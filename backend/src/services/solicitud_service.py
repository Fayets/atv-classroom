import logging
from datetime import date, datetime, timedelta

import httpx
from decouple import config
from fastapi import HTTPException
from pony.orm import db_session, flush

from src.models import ClienteExterno, SolicitudSop

logger = logging.getLogger(__name__)

AREAS = {
    "fulfillment": "Fulfillment",
    "ventas": "Ventas",
    "marketing": "Marketing",
    "equipo": "Equipo",
    "mentalidad": "Mentalidad",
}
DIAS_MIN, DIAS_MAX = 5, 7
WEBHOOK = config("DISCORD_SOLICITUDES_WEBHOOK", default="")


def _hasta(desde: date, dias: int) -> str:
    return (desde + timedelta(days=dias)).strftime("%d/%m")


def _quien(usuario_id: int, tipo: str, sesion: dict) -> dict:
    datos = {"nombre": sesion.get("nombre") or sesion.get("email"), "email": sesion.get("email"), "canal": None}
    if tipo == "cliente":
        with db_session:
            cliente = ClienteExterno.get(id=usuario_id)
            if cliente is not None:
                datos["nombre"] = cliente.nombre or datos["nombre"]
                datos["canal"] = cliente.canal_discord
    return datos


def _mensaje(solicitud: dict, quien: dict) -> dict:
    hoy = date.today()
    cliente = quien["nombre"] or "Cliente"
    if quien["canal"]:
        cliente += f" · #{quien['canal'].lstrip('#')}"
    campos = [
        {"name": "Cliente", "value": cliente[:1024], "inline": True},
        {"name": "Área", "value": AREAS[solicitud["area"]], "inline": True},
        {"name": "Plazo", "value": f"{_hasta(hoy, DIAS_MIN)} al {_hasta(hoy, DIAS_MAX)} · o un Loom", "inline": True},
        {"name": "Problema", "value": solicitud["problema"][:1024], "inline": False},
    ]
    if solicitud.get("consulta"):
        campos.append({"name": "Lo que preguntó en la guía", "value": f"> {solicitud['consulta'][:1000]}", "inline": False})
    return {
        "username": "Classroom ATV",
        "allowed_mentions": {"parse": []},
        "embeds": [
            {
                "title": f"📄 Solicitud de SOP #{solicitud['id']}: {solicitud['nombre']}"[:256],
                "color": 0xB04545,
                "fields": campos,
                "footer": {"text": quien["email"] or ""},
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
        ],
    }


async def _avisar_discord(payload: dict) -> bool:
    if not WEBHOOK:
        logger.warning("Solicitud de SOP sin DISCORD_SOLICITUDES_WEBHOOK: quedó solo en la base")
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(WEBHOOK, json=payload)
            r.raise_for_status()
        return True
    except Exception:
        logger.exception("No se pudo avisar la solicitud de SOP a Discord")
        return False


class SolicitudServices:
    async def crear(self, sesion: dict, tipo: str, nombre: str, area: str, problema: str, consulta: str | None) -> dict:
        area = area.strip().lower()
        if area not in AREAS:
            raise HTTPException(status_code=422, detail="Elegí un área.")
        with db_session:
            s = SolicitudSop(
                usuario_id=sesion["usuario_id"],
                tipo_usuario=tipo,
                nombre=nombre.strip(),
                area=area,
                problema=problema.strip(),
                consulta=(consulta or "").strip() or None,
            )
            flush()
            solicitud = {"id": s.id, "nombre": s.nombre, "area": s.area, "problema": s.problema, "consulta": s.consulta}

        avisado = await _avisar_discord(_mensaje(solicitud, _quien(sesion["usuario_id"], tipo, sesion)))
        if avisado:
            with db_session:
                SolicitudSop[solicitud["id"]].avisado_discord = True

        hoy = date.today()
        return {
            "id": solicitud["id"],
            "estado": "pendiente",
            "entrega_desde": (hoy + timedelta(days=DIAS_MIN)).isoformat(),
            "entrega_hasta": (hoy + timedelta(days=DIAS_MAX)).isoformat(),
        }
