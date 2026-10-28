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
from src.models import Adjunto, Admin, Canal, ClienteExterno, LecturaCanal, Mencion, MensajeCanal, Reaccion
from src.storage import adjuntos as almacen
from src.services.auth_service import _emails_del_cliente, _tiene_acceso, es_equipo, ve_plata
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


def _es_mio(m, sesion: dict) -> bool:
    """El cliente y cada persona de su equipo comparten cuenta, pero cada uno edita solo lo suyo."""
    return (m.autor_tipo, m.autor_id) == _yo(sesion) and (getattr(m, "miembro_id", None) or None) == (sesion.get("miembro_id") or None)


def _roles_de(canal: Canal) -> list[str]:
    try:
        return list(json.loads(canal.roles_json or "[]"))
    except ValueError:
        return []


def _participantes(canal: Canal) -> list[int]:
    try:
        return [int(x) for x in json.loads(canal.participantes_json or "[]")]
    except (ValueError, TypeError):
        return []


def _info(canal: Canal) -> dict:
    return {
        "id": canal.id, "tipo": canal.tipo, "cliente_id": canal.cliente_id, "roles": _roles_de(canal), "creado_por": canal.creado_por,
        "participantes": _participantes(canal) if canal.tipo in ("directo", "privado") else None,
    }


_EVERYONE = re.compile(r"@(everyone|todos)\b", re.I)


def _equipo_que_ve(canal: Canal, autor_id: int) -> set[int]:
    """Quiénes del equipo reciben un @everyone en este canal: los admins y los coaches que ya lo ven."""
    ids = set()
    info = _info(canal)
    for a in list(Admin.select()):
        if not a.activo or a.id == autor_id:
            continue
        # Con la sesión de cada uno: en un mensaje directo, ni un admin que no participa lo recibe.
        if _ve({"rol": a.rol or "admin", "usuario_id": a.id}, info):
            ids.add(a.id)
    return ids


def canales_de_coach(admin_id: int) -> set[int]:
    """Los chats de clientes que ve un coach: donde lo etiquetaron, los de los clientes que dio de alta
    y los de los clientes con los que tuvo una llamada (su Fathom), para armarles el roadmap."""
    filas = db.select(f'SELECT DISTINCT canal_id FROM "{DB_SCHEMA}"."menciones" WHERE admin_id = $admin_id')
    altas = db.select(
        f'SELECT c.id FROM "{DB_SCHEMA}"."canales" c JOIN "{DB_SCHEMA}"."altas_clientes" a ON a.cliente_id = c.cliente_id '
        "WHERE a.creado_por = $admin_id"
    )
    llamadas = db.select(
        f'SELECT c.id FROM "{DB_SCHEMA}"."canales" c JOIN "{DB_SCHEMA}"."llamadas" l ON l.cliente_id = c.cliente_id '
        "WHERE l.admin_id = $admin_id"
    )
    return {int(f) for f in filas} | {int(f) for f in altas} | {int(f) for f in llamadas}


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

    def miembro(self, miembro_id: int, nombre: str | None) -> dict:
        """Alguien del equipo del cliente: su nombre, su foto y su rol ("Setter")."""
        clave = ("miembro", miembro_id)
        if clave not in self._cache:
            from src.models import MiembroCliente
            from src.services.equipo_cliente_service import nombre_rol

            mc = MiembroCliente.get(id=miembro_id)
            self._cache[clave] = {
                "nombre": (mc.nombre if mc else None) or nombre or "Equipo del cliente",
                "foto_url": foto_de("miembro", miembro_id),
                "miembro": {"id": miembro_id, "rol": mc.rol if mc else None, "rol_nombre": nombre_rol(mc.rol) if mc else "Equipo"},
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


_MAX_EMOJIS_POR_MENSAJE = 20


def _quien(sesion: dict) -> str:
    """Quién reacciona: cada persona del equipo del cliente por su lado, aunque compartan cuenta."""
    if es_equipo(sesion):
        return f"equipo:{sesion['usuario_id']}"
    if sesion.get("miembro_id"):
        return f"miembro:{sesion['miembro_id']}"
    return f"cliente:{sesion['usuario_id']}"


def _nombre_de_quien(quien: str, autores: _Autores) -> str:
    tipo, _, ident = quien.partition(":")
    if tipo == "miembro":
        return autores.miembro(int(ident), None)["nombre"]
    return autores.de("admin" if tipo == "equipo" else "cliente", int(ident))["nombre"]


def _reacciones_de(mensaje_ids: list[int], autores: _Autores) -> dict[int, list[dict]]:
    """Las reacciones de varios mensajes en una sola consulta, agrupadas por emoji en el orden en que aparecieron."""
    if not mensaje_ids:
        return {}
    ids = ",".join(str(int(i)) for i in mensaje_ids)
    por_mensaje: dict[int, dict[str, dict]] = defaultdict(dict)
    for r in list(Reaccion.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."reacciones" WHERE mensaje_id IN ({ids}) ORDER BY id')):
        grupo = por_mensaje[r.mensaje_id].setdefault(r.emoji, {"emoji": r.emoji, "quienes": [], "nombres": []})
        grupo["quienes"].append(r.quien)
        grupo["nombres"].append(_nombre_de_quien(r.quien, autores).split(" ")[0])
    return {mid: list(grupos.values()) for mid, grupos in por_mensaje.items()}


def _autor(m, autores: _Autores) -> dict:
    """Quién escribió. En el historial de Discord manda el nombre que tenía allá (puede no tener cuenta)."""
    base = autores.de(m.autor_tipo, m.autor_id)
    if getattr(m, "miembro_id", None):
        return {**base, **autores.miembro(m.miembro_id, m.autor_nombre)}
    nombre = getattr(m, "autor_nombre", None)
    if nombre and (m.autor_tipo == "cliente" or not m.autor_id):
        return {**base, "nombre": nombre, "foto_url": None}
    return base


def _mensaje_dict(m: MensajeCanal, autores: _Autores, adjuntos: dict[int, list[dict]] | None = None, reacciones: dict[int, list[dict]] | None = None) -> dict:
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
        "reacciones": [] if m.borrado else (reacciones if reacciones is not None else _reacciones_de([m.id], autores)).get(m.id, []),
        "creado_en": _iso(m.creado_en),
        "origen": "discord" if m.id < 0 else None,
    }


def _nombre_de_canal(nombre: str) -> str:
    """Como Discord hoy: minúsculas y guiones en vez de espacios, pero con emojis, tildes y separadores
    decorativos ("🏠┊general"). Solo se sacan los caracteres de control y los que rompen menciones y
    links (# @ < > / \\ `)."""
    n = "".join(c for c in (nombre or "").strip().lower() if unicodedata.category(c) != "Cc")
    n = re.sub(r"\s+", "-", n)
    n = re.sub(r"[#@<>/\\`]+", "", n)
    n = re.sub(r"-{2,}", "-", n).strip("-")[:60]
    if not n:
        raise HTTPException(status_code=422, detail="Poné un nombre para el canal.")
    return n


def _nombre_canal(cliente: ClienteExterno) -> str:
    return (cliente.nombre or cliente.email or f"cliente-{cliente.id}").strip()


_ultimo_aseguro = 0.0


def _asegurar_canales_de_clientes() -> None:
    """Cada cliente con acceso tiene su canal; se crea la primera vez que alguien lo necesita.
    Recorre todos los canales y clientes: como mucho una vez por minuto, no en cada bandeja."""
    global _ultimo_aseguro
    if time.monotonic() - _ultimo_aseguro < 60:
        return
    _ultimo_aseguro = time.monotonic()
    con_canal = set()
    for canal in Canal.select()[:]:
        if canal.cliente_id is not None:
            con_canal.add(canal.cliente_id)
    for cliente in ClienteExterno.select()[:]:
        # Las fichas sin canal de Discord son señas (todavía sin onboarding): no tienen chat.
        if cliente.id not in con_canal and _tiene_acceso(cliente) and (cliente.canal_discord or "").strip():
            Canal(tipo="cliente", cliente_id=cliente.id, nombre=_nombre_canal(cliente))


def _canal_del_cliente(cliente_id: int) -> Canal:
    canal = Canal.get(cliente_id=cliente_id)
    if canal is None:
        cliente = ClienteExterno.get(id=cliente_id)
        canal = Canal(tipo="cliente", cliente_id=cliente_id, nombre=_nombre_canal(cliente) if cliente else "Mi canal")
        db.flush()
    return canal


def _resumen_canales(lector: tuple[str, int], canal_ids: list[int]) -> dict[int, dict]:
    """Una sola consulta para toda la bandeja: por canal, el último mensaje, los no leídos del
    lector y desde cuándo espera respuesta el cliente (su primer mensaje después del último del equipo).
    Solo sobre los canales que ve el lector: un cliente ve ~5 de cientos (22 ms → 1 ms)."""
    if not canal_ids:
        return {}
    s = DB_SCHEMA
    lector_tipo, lector_id = lector
    ids = ",".join(str(int(i)) for i in canal_ids)
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
        ) u ON TRUE
        WHERE c.id IN ({ids})"""
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


def _nombre_cuenta(cliente_id: int, cache: dict) -> str:
    c = cache.get(cliente_id) or ClienteExterno.get(id=cliente_id)
    return ((c.nombre or c.email) if c else None) or "Cliente"


def _canales_visibles(sesion: dict, equipo: bool, del_equipo: dict[int, dict]) -> list[tuple]:
    """Los canales que van en la bandeja de esta sesión, con la otra persona (directos) y el cliente."""
    clientes = {c.id: c for c in list(ClienteExterno.select())} if equipo else {}
    visibles = []
    for canal in list(Canal.select()):
        if not _ve(sesion, _info(canal)):
            continue
        otro = None
        if canal.tipo == "directo":
            otro_id = next((i for i in _participantes(canal) if i != sesion["usuario_id"]), None)
            otro = del_equipo.get(otro_id)
            if otro is None:
                continue  # la otra persona ya no está en el equipo
        elif canal.tipo == "privado":
            # Entre clientes: al cliente se le muestra el otro; al equipo, los dos.
            ids = _participantes(canal)
            nombres = {i: _nombre_cuenta(i, clientes) for i in ids}
            if equipo:
                otro = {"id": None, "nombre": " ↔ ".join(nombres[i] for i in ids), "clientes": ids}
            else:
                otro_id = next((i for i in ids if i != sesion["usuario_id"]), None)
                otro = {"id": otro_id, "nombre": nombres.get(otro_id) or "Cliente", "foto_url": None}
        cliente = clientes.get(canal.cliente_id) if canal.cliente_id else None
        # Clientes sin acceso fuera de la bandeja, salvo los que el equipo acomodó en Pausa, Vencidos o Inactivos:
        # moverlos de un grupo a otro no los puede hacer desaparecer.
        acomodado = canal.vencido or canal.inactivo or canal.pausa
        if equipo and canal.tipo == "cliente" and (cliente is None or (not _tiene_acceso(cliente) and not acomodado)):
            continue
        visibles.append((canal, otro, cliente))
    return visibles


class MensajeriaServices:
    def listar_canales(self, sesion: dict) -> list[dict]:
        equipo = es_equipo(sesion)
        with db_session:
            if equipo:
                _asegurar_canales_de_clientes()
            elif not equipo:
                _canal_del_cliente(sesion["usuario_id"])
            db.flush()
            autores = _Autores()
            # Con quién es cada mensaje directo (nombre y foto de la otra persona).
            del_equipo = {m["id"]: m for m in equipo_para_mencionar()} if equipo else {}
            visibles = _canales_visibles(sesion, equipo, del_equipo)
            resumen = _resumen_canales(_yo(sesion), [canal.id for canal, _, _ in visibles])
            items = []
            for canal, otro, cliente in visibles:
                datos = resumen.get(canal.id, {})
                ultimo = datos.get("ultimo")
                if equipo and canal.tipo == "cliente" and not (cliente.canal_discord or "").strip() and not ultimo:
                    continue  # seña sin onboarding: va en el grupo Señas, no como chat vacío en su plan
                items.append(
                    {
                        "id": canal.id,
                        "tipo": canal.tipo,
                        "nombre": otro["nombre"] if otro else canal.nombre,
                        "con": otro,
                        "descripcion": canal.descripcion,
                        "cliente": {
                            "id": cliente.id,
                            "nombre": cliente.nombre or cliente.email,
                            "plan": cliente.plan_actual,
                            "responsable": cliente.responsable,
                            "vence": cliente.fecha_vencimiento.isoformat() if cliente.fecha_vencimiento else None,
                            # El nombre del canal de Discord: así lo nombra el equipo en los updates.
                            "slug": (cliente.canal_discord or "").strip().lstrip("#").lower() or None if equipo else None,
                        }
                        if cliente is not None
                        else None,
                        "bloqueado": bool(sesion.get("pausa")) and canal.tipo != "cliente",
                        "ultimo": None if sesion.get("pausa") and canal.tipo != "cliente" else {
                            "texto": _recorte(ultimo["texto"], 90) if ultimo["texto"] else "📎 Archivo adjunto",
                            "autor_nombre": (ultimo.get("autor_nombre") if ultimo.get("autor_nombre") and (ultimo["autor_tipo"] == "cliente" or not ultimo["autor_id"]) else autores.de(ultimo["autor_tipo"], ultimo["autor_id"])["nombre"]),
                            "de": "cliente" if ultimo["autor_tipo"] == "cliente" else "equipo",
                            "creado_en": _iso(ultimo["creado_en"]),
                        }
                        if ultimo
                        else None,
                        "no_leidos": 0 if sesion.get("pausa") and canal.tipo != "cliente" else datos.get("no_leidos", 0),
                        "menciones": datos.get("menciones", 0),
                        "esperando_desde": _iso(datos.get("esperando_desde")),
                        # Quién ve el canal es cosa del equipo: al cliente no se le manda.
                        "roles": _roles_de(canal) if canal.tipo == "grupo" and equipo else None,
                        "creado_por": canal.creado_por if equipo else None,
                        "orden": canal.orden,
                        "inactivo": bool(canal.inactivo) if equipo else False,
                        "pausa": bool(canal.pausa) if equipo else False,
                        "vencido": bool(canal.vencido) if equipo else False,
                        "puede_administrar": self._puede_administrar(sesion, canal),
                    }
                )
        # Anuncios arriba; después quien espera respuesta (el que más espera primero); después lo más reciente.
        anuncios = [c for c in items if c["tipo"] in ("anuncios", "grupo")]
        # El orden que les dio un admin arrastrándolos; los que no tienen orden van al final, como antes.
        anuncios.sort(key=lambda c: (c["orden"] is None, c["orden"] or 0, c["tipo"] != "anuncios", c["nombre"]))
        esperando = [c for c in items if c["tipo"] == "cliente" and c["esperando_desde"]]
        esperando.sort(key=lambda c: c["esperando_desde"])
        resto = [c for c in items if c["tipo"] == "cliente" and not c["esperando_desde"]]
        # Sin novedades: lo más reciente arriba y, entre los que no tienen mensajes, por nombre.
        resto.sort(key=lambda c: c["nombre"].lower())
        resto.sort(key=lambda c: c["ultimo"]["creado_en"] if c["ultimo"] else "", reverse=True)
        # Mensajes directos: el último con movimiento arriba, como en Discord.
        directos = [c for c in items if c["tipo"] in ("directo", "privado")]
        directos.sort(key=lambda c: c["ultimo"]["creado_en"] if c["ultimo"] else "", reverse=True)
        return anuncios + directos + esperando + resto

    def mensajes(self, sesion: dict, canal_id: int, antes_de: int | None = None, despues_de: int | None = None) -> dict:
        # SQL directo: Pony no puede descompilar lambdas en Python 3.13.
        tabla = f'"{DB_SCHEMA}"."mensajes_canal"'
        with db_session:
            canal = _canal_visible(sesion, canal_id)
            if sesion.get("pausa") and canal.tipo != "cliente":
                # En pausa, de la comunidad solo ve el candado: los mensajes no salen del servidor.
                from src.services.auth_service import mensaje_pausa

                raise HTTPException(status_code=423, detail=mensaje_pausa(sesion.get("motivo"), sesion.get("plan")))
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
            reacciones = _reacciones_de([m.id for m in lista], autores)
            salida = []
            for m in lista:
                salida.append(_mensaje_dict(m, autores, adjuntos, reacciones))
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
        if canal.tipo == "privado":
            from src.services.permisos_service import permite

            return sesion["usuario_id"] in _participantes(canal) and permite(sesion, "chat")
        if canal.tipo != "cliente" or canal.cliente_id != sesion["usuario_id"]:
            return False
        from src.services.permisos_service import permite

        return permite(sesion, "chat")

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
            if sesion.get("miembro_id"):
                # Alguien del equipo del cliente: la cuenta es la del cliente, la firma es la suya.
                m.miembro_id = sesion["miembro_id"]
                m.autor_nombre = sesion["nombre"]
            elif yo[0] == "cliente":
                # El titular firma con el nombre que se puso en Mi cuenta (si no, el de la ficha).
                from src.services.auth_service import nombre_titular

                propio = nombre_titular(yo[1])
                if propio:
                    m.autor_nombre = propio
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
            # En un privado entre clientes no se etiqueta al equipo: no tiene que enterarse de esa charla.
            etiquetados = set() if canal.tipo == "privado" else _detectar_menciones(texto, menciones)
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
            if not _es_mio(m, sesion) or m.borrado:
                raise HTTPException(status_code=403, detail="Solo podés editar tus propios mensajes.")
            m.texto = texto
            m.editado_en = datetime.utcnow()
            return _mensaje_dict(m, _Autores()), _info(m.canal)

    def borrar(self, sesion: dict, mensaje_id: int) -> tuple[dict, dict]:
        with db_session:
            m = MensajeCanal.get(id=mensaje_id)
            if m is None or not _ve(sesion, _info(m.canal)):
                raise HTTPException(status_code=404, detail="Mensaje no encontrado.")
            es_mio = _es_mio(m, sesion)
            if not es_mio and sesion.get("rol") != "admin":
                raise HTTPException(status_code=403, detail="Solo podés borrar tus propios mensajes.")
            m.borrado = True  # se conserva el registro; el texto deja de mostrarse
            return _mensaje_dict(m, _Autores()), _info(m.canal)

    def reaccionar(self, sesion: dict, mensaje_id: int, emoji: str) -> tuple[dict, dict]:
        """Pone o saca un emoji, como en Discord. Reacciona cualquiera que vea el canal, también donde no
        puede escribir (en #anuncios los clientes solo reaccionan)."""
        emoji = (emoji or "").strip()
        if not emoji or len(emoji) > 16 or any(c.isascii() and c.isalnum() for c in emoji) or any(c.isspace() for c in emoji):
            raise HTTPException(status_code=422, detail="Reacción inválida.")
        quien = _quien(sesion)
        with db_session:
            m = MensajeCanal.get(id=mensaje_id)
            if m is None or m.borrado or not _ve(sesion, _info(m.canal)):
                raise HTTPException(status_code=404, detail="Mensaje no encontrado.")
            if sesion.get("pausa") and m.canal.tipo != "cliente":
                raise HTTPException(status_code=423, detail="Tu cuenta está en pausa.")
            mid = m.id
            existente = Reaccion.get(mensaje_id=mid, quien=quien, emoji=emoji)
            if existente is not None:
                existente.delete()
            else:
                distintos = {r.emoji for r in list(Reaccion.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."reacciones" WHERE mensaje_id = $mid'))}
                if emoji not in distintos and len(distintos) >= _MAX_EMOJIS_POR_MENSAJE:
                    raise HTTPException(status_code=422, detail="Este mensaje ya tiene demasiadas reacciones distintas.")
                Reaccion(mensaje_id=mid, canal_id=m.canal.id, quien=quien, emoji=emoji)
            db.flush()
            evento = {"mensaje_id": mid, "canal_id": m.canal.id, "reacciones": _reacciones_de([mid], _Autores()).get(mid, [])}
            return evento, _info(m.canal)

    @staticmethod
    def _marcar(canal_id: int, lector: tuple[str, int], ultimo_id: int) -> None:
        # Directo en la base y solo hacia adelante: con dos pestañas de la misma persona marcando
        # a la vez, el chequeo optimista de Pony hacía fallar a una con un 500.
        lector_tipo, lector_id = lector
        cursor = db.execute(
            f'UPDATE "{DB_SCHEMA}"."lecturas_canal" SET ultimo_leido_id = GREATEST(ultimo_leido_id, $ultimo_id) '
            "WHERE canal_id = $canal_id AND lector_tipo = $lector_tipo AND lector_id = $lector_id"
        )
        if cursor.rowcount == 0:
            LecturaCanal(canal_id=canal_id, lector_tipo=lector_tipo, lector_id=lector_id, ultimo_leido_id=ultimo_id)

    # Si las dos pestañas crean la lectura a la vez, una choca con la clave única: se reintenta.
    @db_session(retry=2)
    def marcar_leido(self, sesion: dict, canal_id: int, ultimo_id: int) -> tuple[dict, dict]:
        canal = _canal_visible(sesion, canal_id)
        cid = canal.id
        tope = db.select(f'SELECT COALESCE(max(id), 0) FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = $cid')[0] or 0
        self._marcar(canal.id, _yo(sesion), min(ultimo_id, tope))
        evento = {"canal_id": canal.id, "lector": "cliente" if _yo(sesion)[0] == "cliente" else "equipo", "ultimo_id": min(ultimo_id, tope)}
        return evento, _info(canal)

    def no_leidos(self, sesion: dict) -> dict:
        """Los mismos totales que suma la bandeja, sin armarla: es lo que más se consulta."""
        equipo = es_equipo(sesion)
        pausa = bool(sesion.get("pausa"))
        total = 0
        esperando = 0
        with db_session:
            del_equipo = {a.id: True for a in list(Admin.select()) if a.activo and a.nombre} if equipo else {}
            visibles = _canales_visibles(sesion, equipo, del_equipo)
            resumen = _resumen_canales(_yo(sesion), [canal.id for canal, _, _ in visibles])
            for canal, _, _ in visibles:
                datos = resumen.get(canal.id, {})
                if not (pausa and canal.tipo != "cliente"):
                    total += datos.get("no_leidos", 0)
                if datos.get("esperando_desde"):
                    esperando += 1
        return {"no_leidos": total, "esperando": esperando if equipo else 0}

    def abrir_directo(self, sesion: dict, admin_id: int) -> dict:
        """El mensaje directo con otra persona del equipo, como un DM de Discord: si no existe, se crea.
        Lo ven solo ellos dos (ver puede_ver)."""
        if not es_equipo(sesion) or sesion.get("miembro_id"):
            raise HTTPException(status_code=403, detail="Los mensajes directos son entre el equipo.")
        yo = sesion["usuario_id"]
        if admin_id == yo:
            raise HTTPException(status_code=422, detail="Elegí a otra persona del equipo.")
        with db_session:
            otro = Admin.get(id=admin_id)
            if otro is None or not otro.activo or getattr(otro, "borrado", False):
                raise HTTPException(status_code=404, detail="No existe esa persona en el equipo.")
            a, b = sorted((yo, admin_id))
            clave = f"dm:{a}:{b}"
            canal = Canal.get(tipo="directo", nombre=clave)
            if canal is None:
                canal = Canal(tipo="directo", nombre=clave, participantes_json=json.dumps([a, b]), creado_por=yo)
                canal.flush()
            return {"id": canal.id, "tipo": "directo", "con": admin_id}

    def abrir_privado(self, sesion: dict, cliente_id: int) -> dict:
        """El chat privado con otro cliente (se crea la primera vez). Lo ven solo ellos dos: el equipo de ATV no."""
        from src.services.permisos_service import permite

        if es_equipo(sesion):
            raise HTTPException(status_code=403, detail="Los privados entre clientes los abren los clientes.")
        yo = sesion["usuario_id"]
        if cliente_id == yo:
            raise HTTPException(status_code=422, detail="Elegí a otro cliente.")
        if sesion.get("pausa") or not permite(sesion, "chat"):
            raise HTTPException(status_code=403, detail="Tu plan no incluye mensajes con otros clientes.")
        with db_session:
            otro = ClienteExterno.get(id=cliente_id)
            if otro is None or not _tiene_acceso(otro):
                raise HTTPException(status_code=404, detail="No encontramos a ese cliente.")
            a, b = sorted((yo, cliente_id))
            clave = f"dmc:{a}:{b}"
            canal = Canal.get(tipo="privado", nombre=clave)
            if canal is None:
                canal = Canal(tipo="privado", nombre=clave, participantes_json=json.dumps([a, b]), creado_por=yo)
                canal.flush()
            return {"id": canal.id, "tipo": "privado", "con": cliente_id}

    def directorio_clientes(self, sesion: dict) -> list[dict]:
        """A quién le puede escribir un cliente: los demás clientes con acceso (solo nombre, nada de mails)."""
        if es_equipo(sesion):
            raise HTTPException(status_code=403, detail="Esto es para clientes.")
        from src.services.plan_acceso import sin_chat

        with db_session:
            lista = [
                {"id": c.id, "nombre": (c.nombre or "").strip()}
                for c in list(ClienteExterno.select())
                if c.id != sesion["usuario_id"] and (c.nombre or "").strip() and _tiene_acceso(c)
                and not sin_chat({"rol": c.plan_actual})
            ]
        return sorted(lista, key=lambda x: x["nombre"].lower())

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

    def ordenar_canales(self, sesion: dict, ids: list[int]) -> None:
        """Como en Discord: un admin acomoda los canales arrastrándolos y el orden queda para todos."""
        if sesion.get("rol") != "admin":
            raise HTTPException(status_code=403, detail="Solo un admin acomoda los canales.")
        with db_session:
            canales = {c.id: c for c in list(Canal.select()) if c.tipo in ("grupo", "anuncios")}
            for i, cid in enumerate(dict.fromkeys(ids)):
                if cid in canales:
                    canales[cid].orden = i

    def marcar_inactivo(self, sesion: dict, canal_id: int, inactivo: bool) -> dict:
        """Pasa el chat de un cliente a "Inactivos" (o lo saca). Como Pausa, le corta el acceso (solo lee su
        canal) con un cartel de cuenta inactiva; por eso lo mueven los mismos que pausan."""
        if not ve_plata(sesion):
            raise HTTPException(status_code=403, detail="Solo admins, Ventas o Sistemas pasan a un cliente a Inactivos.")
        with db_session:
            canal = _canal_visible(sesion, canal_id)
            if canal.tipo != "cliente":
                raise HTTPException(status_code=422, detail="Solo los chats de clientes van a Inactivos.")
            canal.inactivo = bool(inactivo)
            if inactivo:
                canal.pausa = canal.vencido = False  # está en un solo grupo a la vez
            return _info(canal)

    def marcar_vencido(self, sesion: dict, canal_id: int, vencido: bool) -> dict:
        """Pasa el chat de un cliente a "Vencidos" (o lo saca). Solo ordena la bandeja: el acceso lo sigue
        decidiendo la fecha de la ficha en atv-clients. Lo mueven los mismos que pausan."""
        if not ve_plata(sesion):
            raise HTTPException(status_code=403, detail="Solo admins, Ventas o Sistemas pasan a un cliente a Vencidos.")
        with db_session:
            canal = _canal_visible(sesion, canal_id)
            if canal.tipo != "cliente":
                raise HTTPException(status_code=422, detail="Solo los chats de clientes van a Vencidos.")
            canal.vencido = bool(vencido)
            if vencido:
                canal.pausa = canal.inactivo = False  # está en un solo grupo a la vez
            return _info(canal)

    def marcar_pausa(self, sesion: dict, canal_id: int, pausa: bool) -> dict:
        """Pone al cliente en pausa (o lo reanuda). A diferencia de Inactivos, esto SÍ toca su acceso: en
        pausa solo puede leer su canal. Lo hacen los admins y Ventas/Sistemas (los que hablan de plata)."""
        if not ve_plata(sesion):
            raise HTTPException(status_code=403, detail="Solo admins, Ventas o Sistemas pausan a un cliente.")
        with db_session:
            canal = _canal_visible(sesion, canal_id)
            if canal.tipo != "cliente":
                raise HTTPException(status_code=422, detail="Solo los chats de clientes van a Pausa.")
            canal.pausa = bool(pausa)
            if pausa:
                canal.inactivo = canal.vencido = False  # está en un solo grupo a la vez
            return _info(canal)

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
            db.execute(f'DELETE FROM "{DB_SCHEMA}"."reacciones" WHERE canal_id = $canal_id')
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
            # Los ids de clientes y de admins son de tablas distintas: un cliente con el mismo número no es el admin.
            if men is None or not es_equipo(sesion) or men.admin_id != sesion["usuario_id"]:
                raise HTTPException(status_code=404, detail="Alerta no encontrada.")
            if men.respondida_en is None:
                men.respondida_en = datetime.utcnow()
            return {"id": men.id, "respondida_en": _iso(men.respondida_en)}

    def participantes(self, sesion: dict, canal_id: int) -> list[dict]:
        with db_session:
            canal = _canal_visible(sesion, canal_id)
            if canal.tipo != "cliente" or not canal.cliente_id:
                return []
            from src.models import MiembroCliente
            from src.services.equipo_cliente_service import nombre_rol

            c = ClienteExterno.get(id=canal.cliente_id)
            lista = [{"clave": f"c{canal.cliente_id}", "nombre": (c.nombre or c.email) if c else canal.nombre, "detalle": "Cliente", "foto_url": foto_de("cliente", canal.cliente_id)}]
            for m in list(MiembroCliente.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."miembros_cliente" WHERE cliente_id = $cid ORDER BY id', {"cid": canal.cliente_id})):
                lista.append({"clave": f"m{m.id}", "nombre": m.nombre, "detalle": nombre_rol(m.rol), "foto_url": foto_de("miembro", m.id)})
            return lista

    def subir_adjunto(self, sesion: dict, canal_id: int, nombre: str, partes) -> dict:
        """partes: iterable de bloques de bytes del archivo (se corta si pasa el tope)."""
        nombre = almacen.nombre_seguro(nombre)
        tipo = almacen.tipo_permitido(nombre)
        if tipo is None:
            raise HTTPException(
                status_code=415,
                detail="Ese tipo de archivo no se puede adjuntar. Probá con imagen, PDF, Office, audio, video o ZIP.",
            )
        if tipo.startswith("audio/") and es_equipo(sesion):
            # Los clientes mandan notas de voz; el equipo responde por escrito.
            raise HTTPException(status_code=403, detail="El equipo no manda audios: respondé por escrito.")
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
