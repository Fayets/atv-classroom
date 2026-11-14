"""Entrar con el classroom desde ATV Leverage.

Cada persona del equipo conecta su Leverage con su cuenta: en Leverage toca "Entrar con el classroom", acá acepta
y su Leverage queda con una clave personal para la API de agentes (/api/agentes). Así Leverage sabe quién es (sus
pendientes, su voz) y nadie comparte la clave general.

El circuito:
1. Leverage abre /leverage/conectar?estado=…&vuelta=http://127.0.0.1:<puerto>/classroom/vuelta.
2. La persona, con su sesión del classroom, acepta: POST /api/leverage/autorizar devuelve la vuelta con un código
   de un solo uso (5 minutos, atado a esa vuelta).
3. Leverage cambia el código por la clave (POST /api/leverage/canje). Se guarda solo el sha256.
La vuelta solo puede ser la propia compu (127.0.0.1 o localhost): un código nunca sale hacia otro sitio.
"""

import hashlib
import re
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlencode

from fastapi import HTTPException
from pony.orm import db_session

from src.models import Admin, ClaveLeverage, CodigoLeverage
from src.services.auth_service import AREAS_CON_PLATA, ROLES_EQUIPO, es_equipo

VUELTA = re.compile(r"^http://(127\.0\.0\.1|localhost):\d{2,5}/classroom/vuelta$")
ESTADO = re.compile(r"^[A-Za-z0-9_-]{16,128}$")
DURA_CODIGO = timedelta(minutes=5)
# La fecha de último uso se anota como mucho una vez por hora: no se escribe en cada pedido.
ANOTAR_USO_CADA = timedelta(hours=1)


def _h(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def validar_pedido(vuelta: str, estado: str) -> None:
    if not VUELTA.match(vuelta or ""):
        raise HTTPException(status_code=422, detail="La vuelta tiene que ser ATV Leverage en esta misma compu.")
    if not ESTADO.match(estado or ""):
        raise HTTPException(status_code=422, detail="El pedido de Leverage vino incompleto. Probá de nuevo desde Leverage.")


def scopes_de(admin) -> list[str]:
    """Lo mismo que puede hacer la persona en el classroom: leer y el piloto; la plata, solo admins y las áreas
    que la usan (como ve_plata)."""
    scopes = ["lectura", "piloto"]
    if admin.rol == "admin" or admin.area in AREAS_CON_PLATA:
        scopes.append("plata")
    return scopes


def persona_de(admin) -> dict:
    return {"id": admin.id, "nombre": admin.nombre or admin.email, "rol": admin.rol, "area": admin.area}


def _del_equipo(admin) -> bool:
    return bool(admin and admin.activo and not admin.borrado and admin.rol in ROLES_EQUIPO)


def autorizar(sesion: dict, vuelta: str, estado: str) -> dict:
    """La persona aceptó en el classroom: se arma el código y la dirección a la que vuelve."""
    if not es_equipo(sesion):
        raise HTTPException(status_code=403, detail="Solo el equipo de ATV conecta ATV Leverage.")
    validar_pedido(vuelta, estado)
    codigo = secrets.token_urlsafe(32)
    with db_session:
        admin = Admin.get(id=sesion.get("usuario_id"))
        if not _del_equipo(admin):
            raise HTTPException(status_code=403, detail="Solo el equipo de ATV conecta ATV Leverage.")
        CodigoLeverage(admin_id=admin.id, sha256=_h(codigo), vuelta=vuelta)
    return {"url": f"{vuelta}?{urlencode({'codigo': codigo, 'estado': estado})}", "persona": persona_de(admin)}


def canjear(codigo: str, vuelta: str, ahora: datetime | None = None) -> dict:
    """Leverage cambia el código por la clave. El código sirve una sola vez, 5 minutos y para esa vuelta."""
    ahora = ahora or datetime.utcnow()
    vencido = HTTPException(status_code=400, detail="El código venció o ya se usó. Probá de nuevo desde Leverage.")
    if not codigo or len(codigo) > 200:
        raise vencido
    with db_session:
        c = CodigoLeverage.get(sha256=_h(codigo))
        if c is None or c.usado_en is not None or c.vuelta != vuelta or ahora - c.creado_en > DURA_CODIGO:
            raise vencido
        c.usado_en = ahora
        admin = Admin.get(id=c.admin_id)
        if not _del_equipo(admin):
            raise HTTPException(status_code=403, detail="Esa cuenta ya no es del equipo.")
        clave = f"lev_{secrets.token_urlsafe(32)}"
        ClaveLeverage(admin_id=admin.id, sha256=_h(clave))
        return {"clave": clave, "persona": persona_de(admin), "scopes": scopes_de(admin)}


def agente_de_clave(huella: str, ahora: datetime | None = None) -> dict | None:
    """El agente que corresponde a una clave personal (por su sha256), o None si no es de nadie, se cortó o la
    persona ya no está en el equipo."""
    ahora = ahora or datetime.utcnow()
    with db_session:
        k = ClaveLeverage.get(sha256=huella)
        if k is None or k.revocada_en is not None:
            return None
        admin = Admin.get(id=k.admin_id)
        if not _del_equipo(admin):
            return None
        if k.usada_en is None or ahora - k.usada_en > ANOTAR_USO_CADA:
            k.usada_en = ahora
        return {"nombre": f"leverage:{admin.nombre or admin.id}", "scopes": scopes_de(admin), "persona": persona_de(admin), "clave_id": k.id}


def desconectar(agente: dict) -> dict:
    """La persona desconecta su Leverage: la clave deja de andar. Las claves generales no se cortan desde acá."""
    clave_id = agente.get("clave_id")
    if not clave_id:
        raise HTTPException(status_code=400, detail="Esta clave no es de una persona: se corta en el servidor.")
    with db_session:
        k = ClaveLeverage.get(id=clave_id)
        if k is not None and k.revocada_en is None:
            k.revocada_en = datetime.utcnow()
    return {"desconectado": True}
