"""#seguimiento: la pantalla de Mauri para recordar las clases (y escribirle a los que faltaron).

Pedido de Franco del 16-11-2026: baja asistencia a las clases. Mauri arma un mensaje, elige a nombre de quién
sale (Juampi, Juan, Ale, Lucas, Nick…) y a quién: canales de la comunidad (un mensaje por canal) o el chat
privado de cada cliente de las ofertas que tilde (o de clientes sueltos). Sale ya o a la hora que elija.
- {nombre} se completa con el nombre de pila de cada cliente (en un canal se borra).
- Con @everyone en un canal de la comunidad, a los clientes que lo ven les llega la notificación.
- La ven los admins y quien está en SEGUIMIENTO_EMAILS (Mauri).
"""
import json
import logging
import re
from datetime import datetime, timezone

from decouple import config
from fastapi import HTTPException
from pony.orm import commit, db_session

from src.models import Admin, Canal, ClienteExterno, SeguimientoEnvio
from src.services.auth_service import _tiene_acceso, es_equipo

logger = logging.getLogger("seguimiento")

_EMAILS = {e.strip().lower() for e in config("SEGUIMIENTO_EMAILS", default="mauriw35@gmail.com,s_35@live.com").split(",") if e.strip()}

# Las mismas ofertas (y en el mismo orden) que los grupos de la bandeja.
OFERTAS = [
    {"id": "high", "nombre": "High Level", "planes": ["high", "advantage"]},
    {"id": "dfy", "nombre": "DFY", "planes": ["dfy"]},
    {"id": "boost", "nombre": "Boost", "planes": ["boost"]},
    {"id": "mid", "nombre": "Mid level", "planes": ["mid"]},
    {"id": "entry", "nombre": "Entry level", "planes": ["entry"]},
    {"id": "mentoria", "nombre": "Mentoria", "planes": ["mentoria"]},
    {"id": "2k", "nombre": "2K", "planes": ["2k"]},
]
_PLANES = {o["id"]: set(o["planes"]) for o in OFERTAS}
_NOMBRE = re.compile(r"\{\s*nombre\s*\}", re.I)
MAX_TEXTO = 4000
MAX_GLOBITOS = 10


def puede(sesion: dict) -> bool:
    if not es_equipo(sesion) or sesion.get("miembro_id"):
        return False
    with db_session:
        admin = Admin.get(id=sesion["usuario_id"])
        # Los admins y Mauri (que es coach en una de sus cuentas): pedido de Franco del 16-11-2026.
        return bool(admin and admin.activo and not admin.borrado and (admin.rol == "admin" or (admin.email or "").strip().lower() in _EMAILS))


def _exigir(sesion: dict) -> None:
    if not puede(sesion):
        raise HTTPException(status_code=403, detail="Esta pantalla es de los admins.")


def _nombre_canal(nombre: str) -> str:
    """ "⚡︙boost" → "boost": sin el emoji ni el separador."""
    return re.sub(r"^[^\w]+", "", nombre or "", flags=re.UNICODE) or nombre


def _clientes_activos() -> list[ClienteExterno]:
    """Los mismos que la bandeja muestra en cada grupo: con acceso, sin Pausa, Vencidos ni Inactivos."""
    fuera = {c.cliente_id for c in list(Canal.select()) if c.tipo == "cliente" and (c.pausa or c.inactivo or c.vencido)}
    return [c for c in list(ClienteExterno.select()) if c.id not in fuera and _tiene_acceso(c)]


def _de_pila(cliente: ClienteExterno) -> str:
    nombre = (cliente.nombre or "").strip()
    return nombre.split(" ")[0].capitalize() if nombre else ""


def _iso(momento: datetime | None) -> str | None:
    return momento.replace(tzinfo=timezone.utc).isoformat() if momento else None


class SeguimientoServices:
    def opciones(self, sesion: dict) -> dict:
        _exigir(sesion)
        with db_session:
            cuentas = [
                {"id": a.id, "nombre": a.nombre, "foto_url": a.foto_url, "rol": a.rol, "area": a.area}
                for a in sorted(list(Admin.select()), key=lambda a: (a.nombre or "").lower())
                if a.activo and not a.borrado and a.nombre
            ]
            canales = [
                {"id": c.id, "nombre": _nombre_canal(c.nombre), "tipo": c.tipo}
                for c in sorted(list(Canal.select()), key=lambda c: (c.orden is None, c.orden or 0, c.id))
                if c.tipo in ("grupo", "anuncios")
            ]
            activos = _clientes_activos()
            ofertas = [
                {"id": o["id"], "nombre": o["nombre"], "clientes": sum(1 for c in activos if (c.plan_actual or "").lower() in _PLANES[o["id"]])}
                for o in OFERTAS
            ]
        return {"cuentas": cuentas, "canales": canales, "ofertas": [o for o in ofertas if o["clientes"]]}

    def buscar_clientes(self, sesion: dict, q: str) -> list[dict]:
        _exigir(sesion)
        q = (q or "").strip().lower()
        if len(q) < 2:
            return []
        with db_session:
            return [
                {"id": c.id, "nombre": c.nombre or c.email, "plan": c.plan_actual}
                for c in _clientes_activos()
                if q in (c.nombre or "").lower() or q in (c.email or "").lower()
            ][:8]

    def _destinos(self, destino: dict) -> list[tuple[int, ClienteExterno | None]]:
        """(canal_id, cliente) por cada mensaje que sale. Dentro de un db_session."""
        from src.services.mensajeria_service import _canal_del_cliente

        if destino.get("donde") == "canal":
            ids = {int(i) for i in destino.get("canales") or []}
            return [(c.id, None) for c in list(Canal.select()) if c.id in ids and c.tipo in ("grupo", "anuncios")]
        planes = set().union(*(_PLANES.get(o, set()) for o in destino.get("ofertas") or [])) if destino.get("ofertas") else set()
        sueltos = {int(i) for i in destino.get("clientes") or []}
        elegidos = [c for c in _clientes_activos() if (c.plan_actual or "").lower() in planes or c.id in sueltos]
        return [(_canal_del_cliente(c.id).id, c) for c in elegidos]

    def _validar(self, sesion: dict, datos: dict) -> tuple[int, dict, list[str], datetime]:
        _exigir(sesion)
        # Modo secuencia: varios globitos que salen uno atrás del otro. Sin "mensajes", un solo globito ("texto").
        crudos = datos.get("mensajes") if isinstance(datos.get("mensajes"), list) else [datos.get("texto")]
        mensajes = [str(m).strip() for m in crudos if str(m or "").strip()]
        if not mensajes:
            raise HTTPException(status_code=422, detail="Escribí el mensaje.")
        if len(mensajes) > MAX_GLOBITOS:
            raise HTTPException(status_code=422, detail=f"Una secuencia puede tener hasta {MAX_GLOBITOS} mensajes.")
        if any(len(m) > MAX_TEXTO for m in mensajes):
            raise HTTPException(status_code=422, detail=f"Un mensaje supera los {MAX_TEXTO} caracteres.")
        destino = datos.get("destino") or {}
        if destino.get("donde") not in ("canal", "chat"):
            raise HTTPException(status_code=422, detail="Elegí dónde sale: canal o chat de cada uno.")
        with db_session:
            cuenta = Admin.get(id=int(datos.get("cuenta_id") or 0))
            if cuenta is None or not cuenta.activo or cuenta.borrado:
                raise HTTPException(status_code=422, detail="Elegí a nombre de quién sale.")
            if not self._destinos(destino):
                raise HTTPException(status_code=422, detail="No hay a quién mandarle: elegí canales, ofertas o clientes.")
        cuando = datetime.utcnow()
        if datos.get("cuando"):
            try:
                momento = datetime.fromisoformat(str(datos["cuando"]).replace("Z", "+00:00"))
            except ValueError:
                raise HTTPException(status_code=422, detail="La fecha no es válida.")
            cuando = momento.astimezone(timezone.utc).replace(tzinfo=None) if momento.tzinfo else momento
        return cuenta.id, destino, mensajes, cuando

    def crear(self, sesion: dict, datos: dict) -> dict:
        """Lo guarda; si es para ahora, el controlador lo manda en el momento (despachar)."""
        cuenta_id, destino, mensajes, cuando = self._validar(sesion, datos)
        with db_session:
            ya = cuando <= datetime.utcnow()
            e = SeguimientoEnvio(creado_por=sesion["usuario_id"], cuenta_id=cuenta_id, destino_json=json.dumps(destino),
                                 texto="\n\n".join(mensajes), mensajes_json=json.dumps(mensajes, ensure_ascii=False),
                                 cuando=cuando, estado="enviando" if ya else "pendiente")
            commit()  # despachar lo lee desde otro hilo
            return {"id": e.id, "ya": ya}

    def preparar(self, envio_id: int) -> list[tuple[dict, dict]]:
        """Manda los mensajes de un envío (ya marcado 'enviando'). Devuelve (mensaje, canal) para avisar en vivo."""
        from src.services.mensajeria_service import MensajeriaServices, _EVERYONE

        mensajeria = MensajeriaServices()
        with db_session:
            e = SeguimientoEnvio.get(id=envio_id)
            cuenta = Admin.get(id=e.cuenta_id)
            sesion = {"rol": cuenta.rol or "admin", "usuario_id": cuenta.id, "nombre": cuenta.nombre}
            destino = json.loads(e.destino_json)
            destinos = [(canal_id, (_de_pila(c) if c else None)) for canal_id, c in self._destinos(destino)]
            globitos = json.loads(e.mensajes_json) if e.mensajes_json else [e.texto]
        salida, errores, alcanzados = [], [], 0
        for canal_id, nombre in destinos:
            llego = False
            for texto in globitos:  # en orden: cada uno queda después del anterior en el chat
                propio = _NOMBRE.sub(nombre or "", texto)
                propio = re.sub(r"[ \t]{2,}", " ", propio).replace(" !", "!").replace(" ,", ",").strip()
                if not propio:
                    continue
                try:
                    mensaje, canal = mensajeria.enviar(sesion, canal_id, propio, None, automatico=True)
                    if destino.get("donde") == "canal" and _EVERYONE.search(propio):
                        mensaje["aviso_clientes"] = True
                    salida.append((mensaje, canal))
                    llego = True
                except HTTPException as err:
                    errores.append(f"canal {canal_id}: {err.detail}")
                    break  # si no entró uno, el resto de la secuencia tampoco va a ese chat
                except Exception as err:  # uno que falla no frena al resto
                    logger.exception("Seguimiento %s: falló el canal %s", envio_id, canal_id)
                    errores.append(f"canal {canal_id}: {err}")
                    break
            alcanzados += llego
        with db_session:
            e = SeguimientoEnvio.get(id=envio_id)
            e.enviados, e.enviado_en = alcanzados, datetime.utcnow()
            e.estado = "enviado" if salida else "error"
            e.error = "; ".join(errores)[:2000] or None
        return salida

    def vencidos(self) -> list[int]:
        """Los programados cuya hora llegó: se marcan 'enviando' para que nadie más los tome."""
        with db_session:
            ids = []
            ahora = datetime.utcnow()
            for e in list(SeguimientoEnvio.select()):
                if e.estado != "pendiente" or e.cuando > ahora:
                    continue
                e.estado = "enviando"
                ids.append(e.id)
            return ids

    def listar(self, sesion: dict) -> list[dict]:
        _exigir(sesion)
        with db_session:
            nombres = {a.id: a.nombre for a in list(Admin.select())}
            canales = {c.id: _nombre_canal(c.nombre) for c in list(Canal.select()) if c.tipo in ("grupo", "anuncios")}
            ofertas = {o["id"]: o["nombre"] for o in OFERTAS}
            filas = sorted(list(SeguimientoEnvio.select()), key=lambda e: e.cuando, reverse=True)[:30]
            salida = []
            for e in filas:
                d = json.loads(e.destino_json)
                if d.get("donde") == "canal":
                    a_quien = ", ".join("#" + canales.get(int(i), "?") for i in d.get("canales") or [])
                else:
                    partes = [ofertas.get(o, o) for o in d.get("ofertas") or []]
                    if d.get("clientes"):
                        partes.append(f"{len(d['clientes'])} sueltos")
                    a_quien = "chat de cada uno · " + ", ".join(partes)
                salida.append({
                    "id": e.id, "cuenta": nombres.get(e.cuenta_id), "texto": e.texto, "a_quien": a_quien,
                    "cuando": _iso(e.cuando), "estado": e.estado, "enviados": e.enviados, "error": e.error,
                    "globitos": len(json.loads(e.mensajes_json)) if e.mensajes_json else 1,
                })
            return salida

    def cancelar(self, sesion: dict, envio_id: int) -> dict:
        _exigir(sesion)
        with db_session:
            e = SeguimientoEnvio.get(id=envio_id)
            if e is None or e.estado != "pendiente":
                raise HTTPException(status_code=409, detail="Ya salió o no existe.")
            e.estado = "cancelado"
            return {"ok": True}
