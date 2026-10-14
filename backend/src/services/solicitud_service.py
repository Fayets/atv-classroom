import json
import logging
from datetime import date, datetime, timedelta
from pathlib import Path

import httpx
from decouple import config
from fastapi import HTTPException
from pony.orm import db_session, flush

from src.models import Admin, Canal, ClienteExterno, SolicitudSop

logger = logging.getLogger(__name__)

# Áreas y a quién se etiqueta en Discord por cada una.
_CONFIG = json.loads((Path(__file__).resolve().parent.parent / "data" / "solicitudes.json").read_text(encoding="utf-8"))
AREAS = _CONFIG["areas"]
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
    area = AREAS[solicitud["area"]]
    cliente = quien["nombre"] or "Cliente"
    if quien["canal"]:
        cliente += f" (#{quien['canal'].lstrip('#')})"
    campos = [
        {"name": "Cliente — Área", "value": f"{cliente} — {area['nombre']}"[:1024], "inline": False},
        {"name": "Fecha estimada", "value": f"{_hasta(hoy, DIAS_MIN)} al {_hasta(hoy, DIAS_MAX)} · o un Loom", "inline": False},
        {"name": "Entregable", "value": solicitud["nombre"].upper()[:1024], "inline": False},
        {"name": "Descripción", "value": solicitud["problema"][:1024], "inline": False},
    ]
    ids = area["etiquetar"]
    return {
        "username": "Classroom ATV",
        # La mención va en el contenido: dentro del embed no le avisa a nadie.
        "content": " ".join(f"<@{i}>" for i in ids),
        "allowed_mentions": {"users": ids},
        "embeds": [
            {
                "title": f"📄 Solicitud de SOP #{solicitud['id']}",
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


async def avisar_pedido_ayuda(sesion: dict, tipo: str, consulta_id: int, frente: str, detalle: str, coach: dict | None) -> bool:
    """El cliente se trabó en un frente: se avisa en el canal etiquetando al coach del frente."""
    quien = _quien(sesion["usuario_id"], tipo, sesion)
    cliente = quien["nombre"] or "Cliente"
    if quien["canal"]:
        cliente += f" (#{quien['canal'].lstrip('#')})"
    discord_id = _CONFIG.get("coaches", {}).get((coach or {}).get("clave", ""))
    campos = [
        {"name": "Cliente", "value": cliente[:1024], "inline": False},
        {"name": "Frente", "value": frente[:1024], "inline": False},
        {"name": "Dónde se trabó", "value": detalle[:1024], "inline": False},
    ]
    if coach:
        campos.append({"name": "Coach", "value": f"{coach['nombre']} · {coach['area']}"[:1024], "inline": False})
    payload = {
        "username": "Classroom ATV",
        "content": f"<@{discord_id}>" if discord_id else "",
        "allowed_mentions": {"users": [discord_id] if discord_id else []},
        "embeds": [
            {
                "title": f"🆘 Pedido de ayuda #{consulta_id}",
                "color": 0xD6A548,
                "fields": campos,
                "footer": {"text": quien["email"] or ""},
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
        ],
    }
    return await _avisar_discord(payload)


class SolicitudServices:
    async def crear(self, sesion: dict, tipo: str, nombre: str, area: str, problema: str, consulta: str | None) -> dict:
        area = area.strip().lower()
        if area not in AREAS:
            raise HTTPException(status_code=422, detail="Elegí un área.")
        with db_session:
            s = SolicitudSop(
                usuario_id=sesion["usuario_id"],
                tipo_usuario=tipo,
                nombre=nombre.strip().upper(),
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

    # ---------- carpeta "SOPs solicitados" del escritorio (todo el equipo) ----------

    @staticmethod
    def _dict(s: SolicitudSop, clientes: dict, canales: dict, admins: dict) -> dict:
        c = clientes.get(s.usuario_id) if s.tipo_usuario == "cliente" else None
        quien = admins.get(s.usuario_id) if s.tipo_usuario != "cliente" else None
        resolvio = admins.get(s.resuelto_por) if s.resuelto_por else None
        return {
            "id": s.id,
            "titulo": s.nombre,
            "area": s.area,
            "area_nombre": AREAS.get(s.area, {}).get("nombre", s.area),
            "problema": s.problema,
            "consulta": s.consulta,
            "estado": s.estado,
            "creado_en": s.creado_en.isoformat() + "Z",
            "cliente": {"id": c.id, "nombre": c.nombre or c.email, "canal_id": canales.get(c.id)} if c else None,
            "pedido_por": (quien.nombre or quien.email) if quien else None,
            "entrega_url": s.entrega_url,
            "resuelto_por": (resolvio.nombre or resolvio.email) if resolvio else None,
            "resuelto_en": s.resuelto_en.isoformat() + "Z" if s.resuelto_en else None,
        }

    def listar(self, sesion: dict) -> dict:
        from src.services.auth_service import es_equipo

        if not es_equipo(sesion):
            raise HTTPException(status_code=403, detail="Solo el equipo.")
        with db_session:
            filas = sorted(list(SolicitudSop.select()), key=lambda s: s.creado_en, reverse=True)
            clientes = {c.id: c for c in list(ClienteExterno.select())}
            canales = {c.cliente_id: c.id for c in list(Canal.select()) if c.cliente_id}
            admins = {a.id: a for a in list(Admin.select())}
            return {
                "areas": [{"id": k, "nombre": v["nombre"]} for k, v in AREAS.items()],
                "solicitudes": [self._dict(s, clientes, canales, admins) for s in filas],
            }

    def actualizar(self, sesion: dict, solicitud_id: int, estado: str | None, entrega_url: str | None) -> dict:
        from src.services.auth_service import es_equipo

        if not es_equipo(sesion):
            raise HTTPException(status_code=403, detail="Solo el equipo.")
        if estado is not None and estado not in ("pendiente", "en_proceso", "entregado"):
            raise HTTPException(status_code=422, detail="Estado inválido.")
        with db_session:
            s = SolicitudSop.get(id=solicitud_id)
            if s is None:
                raise HTTPException(status_code=404, detail="No existe esa solicitud.")
            if entrega_url is not None:
                url = entrega_url.strip()
                if url and not url.startswith(("http://", "https://")):
                    raise HTTPException(status_code=422, detail="Pegá el link completo del SOP (https://…).")
                s.entrega_url = url or None
            if estado is not None:
                s.estado = estado
                s.resuelto_por = sesion["usuario_id"] if estado == "entregado" else None
                s.resuelto_en = datetime.utcnow() if estado == "entregado" else None
            clientes = {s.usuario_id: ClienteExterno.get(id=s.usuario_id)} if s.tipo_usuario == "cliente" else {}
            canal = Canal.get(cliente_id=s.usuario_id) if s.tipo_usuario == "cliente" else None
            return self._dict(s, {k: v for k, v in clientes.items() if v}, {s.usuario_id: canal.id} if canal else {}, {a.id: a for a in list(Admin.select())})
