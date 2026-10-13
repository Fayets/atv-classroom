"""Mensajería del classroom: un canal privado por cliente con todo el equipo, más canales
de anuncios que leen todos y donde escribe solo el equipo.

Autores y lectores se identifican por (tipo, id): "cliente" es clients.clientes y "admin" es
cualquier miembro del equipo (tabla admins, con rol admin o coach)."""

import json
import re
import time
import unicodedata
from collections import defaultdict, deque
from datetime import datetime, timedelta

from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.models import Adjunto, Admin, Canal, ClienteExterno, LecturaCanal, Mencion, MensajeCanal
from src.storage import adjuntos as almacen
from src.services.auth_service import _emails_del_cliente, _tiene_acceso, es_equipo
from src.services.cuenta_service import foto_de, fotos_de
from src.services.roles_canal import validar_roles
from src.services.tiempo_real import puede_ver

MAX_TEXTO = 4000
MAX_ADJUNTOS = 10


def _mails_de_prueba() -> set[str]:
    crudo = str(config("MENSAJES_PRUEBA", default="") or "")
    return {m.strip().lower() for m in crudo.split(",") if m.strip()}


def habilitada_para(sesion: dict) -> bool:
    """El equipo siempre la usa; los clientes, recién cuando MENSAJES_CLIENTES=1 (lanzamiento).
    Antes del lanzamiento, los mails de MENSAJES_PRUEBA (separados por coma) ya la ven, para probar."""
    if es_equipo(sesion) or config("MENSAJES_CLIENTES", default=False, cast=bool):
        return True
    prueba = _mails_de_prueba()
    if not prueba:
        return False
    if (sesion.get("email") or "").strip().lower() in prueba:
        return True
    # El cliente puede haber entrado con un mail secundario de su ficha: se miran todos.
    with db_session:
        cliente = ClienteExterno.get(id=sesion["usuario_id"])
        return bool(cliente) and bool(_emails_del_cliente(cliente) & prueba)


def clientes_habilitados() -> bool:
    return config("MENSAJES_CLIENTES", default=False, cast=bool)
_PAGINA = 50
_RECUPERO_MAX = 200
_TOPE_POR_MINUTO = 20  # clientes: frena el spam
_TOPE_EQUIPO_POR_MINUTO = 120  # el equipo contesta a muchos clientes seguidos
_envios_recientes: dict[tuple, deque] = defaultdict(deque)


def _iso(momento: datetime | None) -> str | None:
    return momento.isoformat(timespec="seconds") + "Z" if momento else None


def _yo(sesion: dict) -> tuple[str, int]:
    return ("admin" if es_equipo(sesion) else "cliente", sesion["usuario_id"])


def _roles_de(canal: Canal) -> list[str]:
    try:
        return list(json.loads(canal.roles_json or "[]"))
    except ValueError:
        return []


def _info(canal: Canal) -> dict:
    return {"id": canal.id, "tipo": canal.tipo, "cliente_id": canal.cliente_id, "roles": _roles_de(canal), "creado_por": canal.creado_por}


_EVERYONE = re.compile(r"@(everyone|todos)\b", re.I)


def _equipo_que_ve(canal: Canal, autor_id: int) -> set[int]:
    """Quiénes del equipo reciben un @everyone en este canal: los admins y los coaches que ya lo ven."""
    ids = set()
    info = _info(canal)
    for a in list(Admin.select()):
        if not a.activo or a.id == autor_id:
            continue
        if a.rol == "admin" or _ve({"rol": "coach", "usuario_id": a.id}, info):
            ids.add(a.id)
    return ids


def canales_de_coach(admin_id: int) -> set[int]:
    """Los canales donde etiquetaron a este coach: los únicos de clientes que puede ver."""
    filas = db.select(f'SELECT DISTINCT canal_id FROM "{DB_SCHEMA}"."menciones" WHERE admin_id = $admin_id')
    return {int(f) for f in filas}


def _ve(sesion: dict, canal: dict) -> bool:
    if sesion.get("rol") == "coach" and "canales_coach" not in sesion:
        sesion["canales_coach"] = canales_de_coach(sesion["usuario_id"])
    return puede_ver(sesion, canal)


def _canal_visible(sesion: dict, canal_id: int) -> Canal:
    canal = Canal.get(id=canal_id)
    if canal is None or not _ve(sesion, _info(canal)):
        # Mismo error exista o no: no se revela qué canales hay.
        raise HTTPException(status_code=404, detail="Canal no encontrado.")
    return canal


def _frenar_rafaga(clave: tuple) -> None:
    ahora = time.time()
    envios = _envios_recientes[clave]
    while envios and ahora - envios[0] > 60:
        envios.popleft()
    tope = _TOPE_EQUIPO_POR_MINUTO if "admin" in clave else _TOPE_POR_MINUTO
    if len(envios) >= tope:
        raise HTTPException(status_code=429, detail="Estás mandando muchos mensajes seguidos. Esperá un momento.")
    envios.append(ahora)


class _Autores:
    """Nombres y fotos de quienes escriben, buscados una vez por pedido."""

    def __init__(self) -> None:
        self._cache: dict[tuple, dict] = {}

    def de(self, tipo: str, autor_id: int) -> dict:
        clave = (tipo, autor_id)
        if clave not in self._cache:
            if tipo == "admin":
                a = Admin.get(id=autor_id)
                self._cache[clave] = {
                    "tipo": "equipo",
                    "id": autor_id,
                    "nombre": (a.nombre or a.email) if a else "Equipo ATV",
                    "foto_url": foto_de("admin", autor_id, a.foto_url if a else None),
                    "rol": (a.rol or "admin") if a else None,
                    "area": a.area if a else None,
                }
            else:
                c = ClienteExterno.get(id=autor_id)
                self._cache[clave] = {
                    "tipo": "cliente",
                    "id": autor_id,
                    "nombre": (c.nombre or c.email) if c else "Cliente",
                    "foto_url": foto_de("cliente", autor_id),
                    "rol": None,
                    "area": None,
                }
        return self._cache[clave]


def _recorte(texto: str, largo: int = 140) -> str:
    texto = " ".join(texto.split())
    return texto if len(texto) <= largo else texto[: largo - 1] + "…"


def _adjunto_dict(a: Adjunto) -> dict:
    return {"id": a.id, "nombre": a.nombre, "tipo_mime": a.tipo_mime, "tamano": a.tamano, "url": almacen.firmar(a.id)}


def _adjuntos_de(mensaje_ids: list[int]) -> dict[int, list[dict]]:
    """Los adjuntos de varios mensajes en una sola consulta."""
    if not mensaje_ids:
        return {}
    ids = ",".join(str(int(i)) for i in mensaje_ids)
    por_mensaje: dict[int, list[dict]] = defaultdict(list)
    for a in list(Adjunto.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."adjuntos" WHERE mensaje_id IN ({ids}) ORDER BY id')):
        por_mensaje[a.mensaje_id].append(_adjunto_dict(a))
    return por_mensaje


def _autor(m, autores: _Autores) -> dict:
    """Quién escribió. En el historial de Discord manda el nombre que tenía allá (puede no tener cuenta)."""
    base = autores.de(m.autor_tipo, m.autor_id)
    nombre = getattr(m, "autor_nombre", None)
    if nombre and (m.autor_tipo == "cliente" or not m.autor_id):
        return {**base, "nombre": nombre, "foto_url": None}
    return base


def _mensaje_dict(m: MensajeCanal, autores: _Autores, adjuntos: dict[int, list[dict]] | None = None) -> dict:
    respuesta = None
    if m.respuesta_a:
        original = MensajeCanal.get(id=m.respuesta_a)
        if original is not None:
            respuesta = {
                "id": original.id,
                "autor_nombre": _autor(original, autores)["nombre"],
                "texto": None if original.borrado else (_recorte(original.texto) if original.texto else "📎 Archivo adjunto"),
            }
    return {
        "id": m.id,
        "canal_id": m.canal.id,
        "autor": _autor(m, autores),
        "texto": None if m.borrado else m.texto,
        "adjuntos": [] if m.borrado else (adjuntos if adjuntos is not None else _adjuntos_de([m.id])).get(m.id, []),
        "borrado": m.borrado,
        "editado": m.editado_en is not None,
        "respuesta_a": respuesta,
        "creado_en": _iso(m.creado_en),
        "origen": "discord" if m.id < 0 else None,
    }


def _nombre_de_canal(nombre: str) -> str:
    """Como Discord: minúsculas, guiones en vez de espacios, sin símbolos raros."""
    n = _normal((nombre or "").strip()).replace(" ", "-")
    n = re.sub(r"[^a-z0-9_-]+", "", n).strip("-")[:60]
    if not n:
        raise HTTPException(status_code=422, detail="Poné un nombre para el canal.")
    return n


def _nombre_canal(cliente: ClienteExterno) -> str:
    return (cliente.nombre or cliente.email or f"cliente-{cliente.id}").strip()


def _asegurar_canales_de_clientes() -> None:
    """Cada cliente con acceso tiene su canal; se crea la primera vez que alguien lo necesita."""
    con_canal = set()
    for canal in Canal.select()[:]:
        if canal.cliente_id is not None:
            con_canal.add(canal.cliente_id)
    for cliente in ClienteExterno.select()[:]:
        if cliente.id not in con_canal and _tiene_acceso(cliente):
            Canal(tipo="cliente", cliente_id=cliente.id, nombre=_nombre_canal(cliente))


def _canal_del_cliente(cliente_id: int) -> Canal:
    canal = Canal.get(cliente_id=cliente_id)
    if canal is None:
        cliente = ClienteExterno.get(id=cliente_id)
        canal = Canal(tipo="cliente", cliente_id=cliente_id, nombre=_nombre_canal(cliente) if cliente else "Mi canal")
        db.flush()
    return canal


def _resumen_canales(lector: tuple[str, int]) -> dict[int, dict]:
    """Una sola consulta para toda la bandeja: por canal, el último mensaje, los no leídos del
    lector y desde cuándo espera respuesta el cliente (su primer mensaje después del último del equipo)."""
    s = DB_SCHEMA
    lector_tipo, lector_id = lector
    filas = db.select(
        f"""SELECT c.id, u.id, u.texto, u.autor_tipo, u.autor_id, u.creado_en, u.autor_nombre,
          (SELECT count(*) FROM "{s}"."mensajes_canal" m
             WHERE m.canal = c.id AND NOT m.borrado
               AND m.id > COALESCE(l.ultimo_leido_id, 0)
               AND NOT (m.autor_tipo = $lector_tipo AND m.autor_id = $lector_id)),
          (SELECT count(*) FROM "{s}"."menciones" mn
             JOIN "{s}"."mensajes_canal" mm ON mm.id = mn.mensaje_id AND NOT mm.borrado
             WHERE mn.canal_id = c.id AND $lector_tipo = 'admin' AND mn.admin_id = $lector_id
               AND mn.mensaje_id > COALESCE(l.ultimo_leido_id, 0)),
          (SELECT min(m.creado_en) FROM "{s}"."mensajes_canal" m
             WHERE m.canal = c.id AND NOT m.borrado AND m.autor_tipo = 'cliente' AND m.id > 0
               AND m.id > COALESCE((SELECT max(t.id) FROM "{s}"."mensajes_canal" t
                                    WHERE t.canal = c.id AND NOT t.borrado AND t.autor_tipo = 'admin'), 0))
        FROM "{s}"."canales" c
        LEFT JOIN "{s}"."lecturas_canal" l
          ON l.canal_id = c.id AND l.lector_tipo = $lector_tipo AND l.lector_id = $lector_id
        LEFT JOIN LATERAL (
          SELECT m.id, m.texto, m.autor_tipo, m.autor_id, m.creado_en, m.autor_nombre FROM "{s}"."mensajes_canal" m
          WHERE m.canal = c.id AND NOT m.borrado ORDER BY m.id DESC LIMIT 1
        ) u ON TRUE"""
    )
    resumen = {}
    for canal_id, u_id, u_texto, u_tipo, u_autor, u_fecha, u_nombre, no_leidos, menciones, espera in filas:
        resumen[canal_id] = {
            "ultimo": {"id": u_id, "texto": u_texto, "autor_tipo": u_tipo, "autor_id": u_autor, "creado_en": u_fecha, "autor_nombre": u_nombre}
            if u_id
            else None,
            "no_leidos": int(no_leidos or 0),
            "menciones": int(menciones or 0),  # etiquetas a quien mira la bandeja, sin leer (como en Discord)
            "esperando_desde": espera,
        }
    return resumen


def _normal(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn")


def equipo_para_mencionar() -> list[dict]:
    """El equipo activo, para el autocompletado de @ (lo ven también los clientes)."""
    equipo = []
    subidas = fotos_de("admin")
    for a in list(Admin.select()):
        if a.activo and a.nombre:
            equipo.append({"id": a.id, "nombre": a.nombre, "area": a.area, "rol": a.rol or "admin", "foto_url": subidas.get(a.id) or a.foto_url})
    equipo.sort(key=lambda m: m["nombre"].lower())
    return equipo


def _detectar_menciones(texto: str, ids_enviados: list[int] | None) -> set[int]:
    """Los ids que marcó el autocompletado (si siguen escritos) más cualquier @Nombre que coincida
    con un solo miembro activo del equipo, por nombre completo o por primer nombre."""
    equipo = equipo_para_mencionar()
    texto_n = _normal(texto)
    ids = set()
    validos = {m["id"]: m for m in equipo}
    for i in ids_enviados or []:
        if i in validos:
            ids.add(i)
    por_primer_nombre = defaultdict(list)
    for m in equipo:
        por_primer_nombre[_normal(m["nombre"].split()[0])].append(m["id"])
        if f"@{_normal(m['nombre'])}" in texto_n:
            ids.add(m["id"])
    for palabra in re.findall(r"@([\w]+)", texto_n):
        candidatos = por_primer_nombre.get(palabra, [])
        if len(candidatos) == 1:
            ids.add(candidatos[0])
    return ids


def _mencion_dict(men: Mencion, autores: "_Autores", ahora: datetime) -> dict | None:
    m = MensajeCanal.get(id=men.mensaje_id)
    canal = Canal.get(id=men.canal_id)
    if m is None or canal is None or m.borrado:
        return None
    hasta = men.respondida_en or ahora
    return {
        "id": men.id,
        "canal_id": canal.id,
        "canal_nombre": canal.nombre,
        "mensaje_id": m.id,
        "autor": autores.de(m.autor_tipo, m.autor_id),
        "texto": _recorte(m.texto, 220) if m.texto else "📎 Archivo adjunto",
        "creado_en": _iso(men.creado_en),
        "respondida_en": _iso(men.respondida_en),
        "estado": "respondida" if men.respondida_en else "pendiente",
        "minutos": max(0, int((hasta - men.creado_en).total_seconds() // 60)),
    }


class MensajeriaServices:
    def listar_canales(self, sesion: dict) -> list[dict]:
        equipo = es_equipo(sesion)
        with db_session:
            if sesion.get("rol") == "admin":
                _asegurar_canales_de_clientes()
            elif not equipo:
                _canal_del_cliente(sesion["usuario_id"])
            db.flush()
            resumen = _resumen_canales(_yo(sesion))
            autores = _Autores()
            clientes = {}
            if equipo:
                for c in ClienteExterno.select()[:]:
                    clientes[c.id] = c

            items = []
            for canal in Canal.select()[:]:
                if not _ve(sesion, _info(canal)):
                    continue
                cliente = clientes.get(canal.cliente_id) if canal.cliente_id else None
                if equipo and canal.tipo == "cliente" and (cliente is None or not _tiene_acceso(cliente)):
                    continue  # clientes vencidos fuera de la bandeja
                datos = resumen.get(canal.id, {})
                ultimo = datos.get("ultimo")
                items.append(
                    {
                        "id": canal.id,
                        "tipo": canal.tipo,
                        "nombre": canal.nombre,
                        "descripcion": canal.descripcion,
                        "cliente": {
                            "id": cliente.id,
                            "nombre": cliente.nombre or cliente.email,
                            "plan": cliente.plan_actual,
                            "responsable": cliente.responsable,
                            "vence": cliente.fecha_vencimiento.isoformat() if cliente.fecha_vencimiento else None,
                        }
                        if cliente is not None
                        else None,
                        "ultimo": {
                            "texto": _recorte(ultimo["texto"], 90) if ultimo["texto"] else "📎 Archivo adjunto",
                            "autor_nombre": (ultimo.get("autor_nombre") if ultimo.get("autor_nombre") and (ultimo["autor_tipo"] == "cliente" or not ultimo["autor_id"]) else autores.de(ultimo["autor_tipo"], ultimo["autor_id"])["nombre"]),
                            "de": "cliente" if ultimo["autor_tipo"] == "cliente" else "equipo",
                            "creado_en": _iso(ultimo["creado_en"]),
                        }
                        if ultimo
                        else None,
                        "no_leidos": datos.get("no_leidos", 0),
                        "menciones": datos.get("menciones", 0),
                        "esperando_desde": _iso(datos.get("esperando_desde")),
                        # Quién ve el canal es cosa del equipo: al cliente no se le manda.
                        "roles": _roles_de(canal) if canal.tipo == "grupo" and equipo else None,
                        "creado_por": canal.creado_por if equipo else None,
                        "puede_administrar": self._puede_administrar(sesion, canal),
                    }
                )
        # Anuncios arriba; después quien espera respuesta (el que más espera primero); después lo más reciente.
        anuncios = [c for c in items if c["tipo"] in ("anuncios", "grupo")]
        anuncios.sort(key=lambda c: (c["tipo"] != "anuncios", c["nombre"]))
        esperando = [c for c in items if c["tipo"] == "cliente" and c["esperando_desde"]]
        esperando.sort(key=lambda c: c["esperando_desde"])
        resto = [c for c in items if c["tipo"] == "cliente" and not c["esperando_desde"]]
        # Sin novedades: lo más reciente arriba y, entre los que no tienen mensajes, por nombre.
        resto.sort(key=lambda c: c["nombre"].lower())
        resto.sort(key=lambda c: c["ultimo"]["creado_en"] if c["ultimo"] else "", reverse=True)
        return anuncios + esperando + resto

    def mensajes(self, sesion: dict, canal_id: int, antes_de: int | None = None, despues_de: int | None = None) -> dict:
        # SQL directo: Pony no puede descompilar lambdas en Python 3.13.
        tabla = f'"{DB_SCHEMA}"."mensajes_canal"'
        with db_session:
            canal = _canal_visible(sesion, canal_id)
            cid = canal.id
            hay_mas = False
            if despues_de is not None:
                # Recupero tras una reconexión: lo nuevo, en orden, con tope.
                desde = int(despues_de)
                tope = _RECUPERO_MAX
                lista = list(MensajeCanal.select_by_sql(
                    f"SELECT * FROM {tabla} WHERE canal = $cid AND NOT borrado AND id > $desde ORDER BY id LIMIT $tope"
                ))
            else:
                hasta = int(antes_de) if antes_de is not None else 2**31 - 1
                tope = _PAGINA + 1
                lista = list(MensajeCanal.select_by_sql(
                    f"SELECT * FROM {tabla} WHERE canal = $cid AND NOT borrado AND id < $hasta ORDER BY id DESC LIMIT $tope"
                ))
                hay_mas = len(lista) > _PAGINA
                lista = list(reversed(lista[:_PAGINA]))
            autores = _Autores()
            adjuntos = _adjuntos_de([m.id for m in lista])
            salida = []
            for m in lista:
                salida.append(_mensaje_dict(m, autores, adjuntos))
            return {
                "canal": {"id": canal.id, "tipo": canal.tipo, "nombre": canal.nombre, "descripcion": canal.descripcion},
                "mensajes": salida,
                "hay_mas": hay_mas,
                "lecturas": self._lecturas(canal),
                "puede_escribir": self._puede_escribir(sesion, canal),
            }

    def _lecturas(self, canal: Canal) -> dict:
        """Hasta dónde leyó el cliente y hasta dónde leyó alguien del equipo (para el "visto")."""
        cid = canal.id
        filas = db.select(
            f'SELECT lector_tipo, max(ultimo_leido_id) FROM "{DB_SCHEMA}"."lecturas_canal" '
            "WHERE canal_id = $cid GROUP BY lector_tipo"
        )
        lecturas = {"cliente": 0, "equipo": 0}
        for tipo, ultimo in filas:
            lecturas["cliente" if tipo == "cliente" else "equipo"] = int(ultimo or 0)
        return lecturas

    @staticmethod
    def _puede_escribir(sesion: dict, canal: Canal) -> bool:
        if es_equipo(sesion):
            return True
        if canal.tipo == "grupo":
            return True  # si llegó acá es porque lo ve (ver _canal_visible)
        return canal.tipo == "cliente" and canal.cliente_id == sesion["usuario_id"]

    def enviar(
        self,
        sesion: dict,
        canal_id: int,
        texto: str,
        respuesta_a: int | None,
        menciones: list[int] | None = None,
        adjuntos: list[int] | None = None,
    ) -> tuple[dict, dict]:
        texto = (texto or "").strip()
        adjuntos = list(dict.fromkeys(adjuntos or []))
        if not texto and not adjuntos:
            raise HTTPException(status_code=422, detail="El mensaje está vacío.")
        if len(adjuntos) > MAX_ADJUNTOS:
            raise HTTPException(status_code=422, detail=f"Podés mandar hasta {MAX_ADJUNTOS} archivos por mensaje.")
        if len(texto) > MAX_TEXTO:
            raise HTTPException(status_code=422, detail=f"El mensaje supera los {MAX_TEXTO} caracteres.")
        yo = _yo(sesion)
        _frenar_rafaga(yo)
        with db_session:
            canal = _canal_visible(sesion, canal_id)
            if not self._puede_escribir(sesion, canal):
                raise HTTPException(status_code=403, detail="En este canal escribe solo el equipo.")
            if respuesta_a is not None:
                original = MensajeCanal.get(id=respuesta_a)
                if original is None or original.canal.id != canal.id:
                    raise HTTPException(status_code=422, detail="El mensaje al que respondés no está en este canal.")
            propios = []
            for adjunto_id in adjuntos:
                a = Adjunto.get(id=adjunto_id)
                if (
                    a is None
                    or a.canal_id != canal.id
                    or a.mensaje_id is not None
                    or (a.subido_por_tipo, a.subido_por_id) != yo
                ):
                    raise HTTPException(status_code=422, detail="Uno de los archivos no es válido. Volvé a subirlo.")
                propios.append(a)
            m = MensajeCanal(canal=canal, autor_tipo=yo[0], autor_id=yo[1], texto=texto, respuesta_a=respuesta_a)
            canal.ultimo_mensaje_en = datetime.utcnow()
            db.flush()
            for a in propios:
                a.mensaje_id = m.id
            self._marcar(canal.id, yo, m.id)
            if yo[0] == "admin":
                # Escribir en el canal responde las alertas abiertas de quien escribe.
                for abierta in list(Mencion.select_by_sql(
                    f'SELECT * FROM "{DB_SCHEMA}"."menciones" WHERE canal_id = $cid AND admin_id = $aid AND respondida_en IS NULL',
                    globals={"cid": canal.id, "aid": yo[1]},
                )):
                    abierta.respondida_en = m.creado_en
            nuevas = []
            etiquetados = _detectar_menciones(texto, menciones)
            if es_equipo(sesion) and _EVERYONE.search(texto):
                etiquetados |= _equipo_que_ve(canal, sesion["usuario_id"])
            for admin_id in etiquetados:
                if yo == ("admin", admin_id):
                    continue
                nuevas.append(Mencion(mensaje_id=m.id, canal_id=canal.id, admin_id=admin_id, creado_en=m.creado_en))
            db.flush()
            datos = _mensaje_dict(m, _Autores())
            datos["menciones"] = [n.admin_id for n in nuevas]
            return datos, _info(canal)

    def editar(self, sesion: dict, mensaje_id: int, texto: str) -> tuple[dict, dict]:
        texto = (texto or "").strip()
        if not texto or len(texto) > MAX_TEXTO:
            raise HTTPException(status_code=422, detail="Texto inválido.")
        with db_session:
            m = MensajeCanal.get(id=mensaje_id)
            if m is None or not _ve(sesion, _info(m.canal)):
                raise HTTPException(status_code=404, detail="Mensaje no encontrado.")
            if (m.autor_tipo, m.autor_id) != _yo(sesion) or m.borrado:
                raise HTTPException(status_code=403, detail="Solo podés editar tus propios mensajes.")
            m.texto = texto
            m.editado_en = datetime.utcnow()
            return _mensaje_dict(m, _Autores()), _info(m.canal)

    def borrar(self, sesion: dict, mensaje_id: int) -> tuple[dict, dict]:
        with db_session:
            m = MensajeCanal.get(id=mensaje_id)
            if m is None or not _ve(sesion, _info(m.canal)):
                raise HTTPException(status_code=404, detail="Mensaje no encontrado.")
            es_mio = (m.autor_tipo, m.autor_id) == _yo(sesion)
            if not es_mio and sesion.get("rol") != "admin":
                raise HTTPException(status_code=403, detail="Solo podés borrar tus propios mensajes.")
            m.borrado = True  # se conserva el registro; el texto deja de mostrarse
            return _mensaje_dict(m, _Autores()), _info(m.canal)

    @staticmethod
    def _marcar(canal_id: int, lector: tuple[str, int], ultimo_id: int) -> None:
        lectura = LecturaCanal.get(canal_id=canal_id, lector_tipo=lector[0], lector_id=lector[1])
        if lectura is None:
            LecturaCanal(canal_id=canal_id, lector_tipo=lector[0], lector_id=lector[1], ultimo_leido_id=ultimo_id)
        elif ultimo_id > lectura.ultimo_leido_id:
            lectura.ultimo_leido_id = ultimo_id

    def marcar_leido(self, sesion: dict, canal_id: int, ultimo_id: int) -> tuple[dict, dict]:
        with db_session:
            canal = _canal_visible(sesion, canal_id)
            cid = canal.id
            tope = db.select(f'SELECT COALESCE(max(id), 0) FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = $cid')[0] or 0
            self._marcar(canal.id, _yo(sesion), min(ultimo_id, tope))
            evento = {"canal_id": canal.id, "lector": "cliente" if _yo(sesion)[0] == "cliente" else "equipo", "ultimo_id": min(ultimo_id, tope)}
            return evento, _info(canal)

    def no_leidos(self, sesion: dict) -> dict:
        if sesion.get("rol") == "coach":
            pendientes = self.menciones(sesion)["pendientes"]
            return {"no_leidos": pendientes, "esperando": pendientes}
        canales = self.listar_canales(sesion)
        total = 0
        esperando = 0
        for c in canales:
            total += c["no_leidos"]
            if c["esperando_desde"]:
                esperando += 1
        return {"no_leidos": total, "esperando": esperando if es_equipo(sesion) else 0}

    def crear_canal_grupo(self, sesion: dict, nombre: str, descripcion: str | None, roles: list[str] | None) -> dict:
        """Cualquiera del equipo crea un canal grupal, como en Discord: nombre y roles que lo ven."""
        if not es_equipo(sesion):
            raise HTTPException(status_code=403, detail="Solo el equipo crea canales.")
        nombre = _nombre_de_canal(nombre)
        roles_ok = validar_roles(roles)
        if not roles_ok:
            raise HTTPException(status_code=422, detail="Elegí al menos un rol que vea el canal.")
        with db_session:
            if any(c.nombre == nombre and c.tipo in ("grupo", "anuncios") for c in list(Canal.select())):
                raise HTTPException(status_code=409, detail="Ya hay un canal con ese nombre.")
            canal = Canal(tipo="grupo", nombre=nombre, descripcion=(descripcion or "").strip()[:300] or None, roles_json=json.dumps(roles_ok), creado_por=sesion["usuario_id"])
            db.flush()
            return {"id": canal.id, "tipo": canal.tipo, "nombre": canal.nombre, "descripcion": canal.descripcion, "roles": roles_ok, "creado_por": canal.creado_por, "info": _info(canal)}

    @staticmethod
    def _puede_administrar(sesion: dict, canal: Canal) -> bool:
        """Como "Gestionar canal" en Discord: un admin cualquiera; un coach, solo los grupos que creó."""
        if sesion.get("rol") == "admin":
            return canal.tipo in ("grupo", "anuncios")
        return canal.tipo == "grupo" and es_equipo(sesion) and canal.creado_por == sesion["usuario_id"]

    def editar_canal(self, sesion: dict, canal_id: int, nombre: str | None, descripcion: str | None, roles: list[str] | None) -> tuple[dict, dict, dict]:
        """Cambia nombre, descripción y roles. Devuelve el canal y su visibilidad antes y después
        (para avisar en vivo tanto a quien lo pierde como a quien lo gana)."""
        with db_session:
            canal = _canal_visible(sesion, canal_id)
            if not self._puede_administrar(sesion, canal):
                raise HTTPException(status_code=403, detail="Solo quien creó el canal o un admin lo puede editar.")
            antes = _info(canal)
            if nombre is not None:
                nuevo = _nombre_de_canal(nombre)
                if nuevo != canal.nombre and any(c.id != canal.id and c.nombre == nuevo and c.tipo in ("grupo", "anuncios") for c in list(Canal.select())):
                    raise HTTPException(status_code=409, detail="Ya hay un canal con ese nombre.")
                canal.nombre = nuevo
            if descripcion is not None:
                canal.descripcion = descripcion.strip()[:300] or None
            if roles is not None and canal.tipo == "grupo":
                roles_ok = validar_roles(roles)
                if not roles_ok:
                    raise HTTPException(status_code=422, detail="Elegí al menos un rol que vea el canal.")
                canal.roles_json = json.dumps(roles_ok)
            db.flush()
            return (
                {"id": canal.id, "tipo": canal.tipo, "nombre": canal.nombre, "descripcion": canal.descripcion, "roles": _roles_de(canal), "creado_por": canal.creado_por},
                antes,
                _info(canal),
            )

    def borrar_canal(self, sesion: dict, canal_id: int) -> dict:
        """Borra el canal con todo lo que tiene: mensajes, adjuntos, etiquetas y lecturas."""
        with db_session:
            canal = _canal_visible(sesion, canal_id)
            if not self._puede_administrar(sesion, canal):
                raise HTTPException(status_code=403, detail="Solo quien creó el canal o un admin lo puede borrar.")
            info = _info(canal)
            for a in list(Adjunto.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."adjuntos" WHERE canal_id = $canal_id')):
                ruta = almacen.ruta_de(a.archivo)
                if ruta and ruta.exists():
                    ruta.unlink()
                a.delete()
            db.execute(f'DELETE FROM "{DB_SCHEMA}"."menciones" WHERE canal_id = $canal_id')
            db.execute(f'DELETE FROM "{DB_SCHEMA}"."lecturas_canal" WHERE canal_id = $canal_id')
            mensajes = db.execute(f'DELETE FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = $canal_id').rowcount
            canal.delete()
            return {"info": info, "mensajes": mensajes}

    def crear_canal_anuncios(self, nombre: str, descripcion: str | None) -> dict:
        nombre = (nombre or "").strip().lower().replace(" ", "-")
        if not nombre:
            raise HTTPException(status_code=422, detail="Poné un nombre para el canal.")
        with db_session:
            canal = Canal(tipo="anuncios", nombre=nombre, descripcion=(descripcion or "").strip() or None)
            db.flush()
            return {"id": canal.id, "tipo": canal.tipo, "nombre": canal.nombre, "descripcion": canal.descripcion}

    def canal_visible_info(self, sesion: dict, canal_id: int) -> dict | None:
        with db_session:
            try:
                return _info(_canal_visible(sesion, canal_id))
            except HTTPException:
                return None

    def menciones(self, sesion: dict, dias: int = 30) -> dict:
        """Alertas de quien pregunta: dónde lo etiquetaron, hace cuánto y cuánto tardó en responder."""
        admin_id = sesion["usuario_id"]
        desde = datetime.utcnow() - timedelta(days=dias)
        ahora = datetime.utcnow()
        with db_session:
            filas = list(Mencion.select_by_sql(
                f'SELECT * FROM "{DB_SCHEMA}"."menciones" WHERE admin_id = $admin_id AND creado_en >= $desde ORDER BY id DESC'
            ))
            autores = _Autores()
            items = []
            for men in filas:
                d = _mencion_dict(men, autores, ahora)
                if d is not None:
                    items.append(d)
        pendientes = [i for i in items if i["estado"] == "pendiente"]
        pendientes.sort(key=lambda i: i["creado_en"])  # la que más espera, primero
        respondidas = [i for i in items if i["estado"] == "respondida"]
        semana = [i["minutos"] for i in respondidas if i["respondida_en"] >= _iso(ahora - timedelta(days=7))]
        return {
            "pendientes": len(pendientes),
            "promedio_minutos": round(sum(semana) / len(semana)) if semana else None,
            "respondidas_semana": len(semana),
            "alertas": pendientes + respondidas,
        }

    def resolver_mencion(self, sesion: dict, mencion_id: int) -> dict:
        with db_session:
            men = Mencion.get(id=mencion_id)
            if men is None or men.admin_id != sesion["usuario_id"]:
                raise HTTPException(status_code=404, detail="Alerta no encontrada.")
            if men.respondida_en is None:
                men.respondida_en = datetime.utcnow()
            return {"id": men.id, "respondida_en": _iso(men.respondida_en)}

    def subir_adjunto(self, sesion: dict, canal_id: int, nombre: str, partes) -> dict:
        """partes: iterable de bloques de bytes del archivo (se corta si pasa el tope)."""
        nombre = almacen.nombre_seguro(nombre)
        tipo = almacen.tipo_permitido(nombre)
        if tipo is None:
            raise HTTPException(
                status_code=415,
                detail="Ese tipo de archivo no se puede adjuntar. Probá con imagen, PDF, Office, audio, video o ZIP.",
            )
        yo = _yo(sesion)
        _frenar_rafaga(("adjunto",) + yo)
        with db_session:
            canal = _canal_visible(sesion, canal_id)
            if not self._puede_escribir(sesion, canal):
                raise HTTPException(status_code=403, detail="En este canal escribe solo el equipo.")
        relativo, ruta = almacen.nuevo_archivo(canal_id, nombre)
        total = 0
        try:
            with open(ruta, "wb") as destino:
                for bloque in partes:
                    total += len(bloque)
                    if total > almacen.MAX_BYTES:
                        raise HTTPException(status_code=413, detail="El archivo pesa más de 25 MB.")
                    destino.write(bloque)
        except Exception:
            ruta.unlink(missing_ok=True)
            raise
        if total == 0:
            ruta.unlink(missing_ok=True)
            raise HTTPException(status_code=422, detail="El archivo está vacío.")
        with db_session:
            a = Adjunto(
                canal_id=canal_id,
                subido_por_tipo=yo[0],
                subido_por_id=yo[1],
                nombre=nombre,
                archivo=relativo,
                tipo_mime=tipo,
                tamano=total,
            )
            db.flush()
            return _adjunto_dict(a)

    def archivo_adjunto(self, adjunto_id: int, firma: str) -> tuple:
        """Para la descarga: valida el link firmado y devuelve (ruta, nombre, tipo)."""
        if not almacen.firma_valida(adjunto_id, firma):
            raise HTTPException(status_code=403, detail="El link del archivo venció. Volvé a abrir el chat.")
        with db_session:
            a = Adjunto.get(id=adjunto_id)
            if a is None:
                raise HTTPException(status_code=404, detail="Archivo no encontrado.")
            if a.mensaje_id is not None:
                m = MensajeCanal.get(id=a.mensaje_id)
                if m is None or m.borrado:
                    raise HTTPException(status_code=404, detail="Archivo no encontrado.")
            ruta = almacen.ruta_de(a.archivo)
            if ruta is None:
                raise HTTPException(status_code=404, detail="Archivo no encontrado.")
            return ruta, a.nombre, a.tipo_mime
