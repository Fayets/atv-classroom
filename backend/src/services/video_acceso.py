"""Qué planes ven el video de una clase. El admin bloquea el video por plan (los SOPs nunca): quien no lo ve
recibe el cartel de "Próximamente" y el link no sale del servidor. El equipo de ATV ve siempre el video,
con el aviso de para quién está bloqueado."""

from src.services.roles_canal import rol_de_plan

# Los planes que se pueden bloquear, en el orden del admin. La clave es la de rol_de_plan (advantage → high).
PLANES_VIDEO = [
    {"id": "high", "nombre": "High Level"},
    {"id": "boost", "nombre": "Boost"},
    {"id": "mid", "nombre": "Mid level"},
    {"id": "entry", "nombre": "Entry level"},
    {"id": "mentoria", "nombre": "Mentoría"},
    {"id": "2k", "nombre": "2K"},
]
_IDS = [p["id"] for p in PLANES_VIDEO]
# Lo que quedó bloqueado "para todos" antes del bloqueo por plan: todos menos 2K (Franco, 27-10-2026).
POR_DEFECTO = [p for p in _IDS if p != "2k"]
_NOMBRES = {p["id"]: p["nombre"] for p in PLANES_VIDEO}


def clave_de_plan(plan: str | None) -> str:
    return rol_de_plan(plan) or (plan or "").lower()


def bloqueado_para(clase) -> list[str]:
    planes = [p for p in (clase.video_bloqueado_para or "").split(",") if p]
    return planes or (list(POR_DEFECTO) if clase.video_bloqueado else [])


def guardar_bloqueo(clase, planes: list[str]) -> None:
    validos = [p for p in _IDS if p in set(planes or [])]
    clase.video_bloqueado_para = ",".join(validos)
    clase.video_bloqueado = bool(validos)


def video(clase, ve_como: str | None) -> dict:
    """Los campos de video de la clase para quien la mira. ve_como: la clave del plan del cliente, o None
    si es alguien del equipo de ATV."""
    bloqueos = bloqueado_para(clase)
    if ve_como is not None and ve_como in bloqueos:
        return {"video_url": None, "video_proximamente": True}
    return {
        "video_url": clase.video_url,
        "video_proximamente": False,
        # Solo para el equipo: para quién está bloqueado lo que está mirando.
        "video_bloqueado_para": [_NOMBRES[p] for p in bloqueos] if ve_como is None else [],
    }


def ve_como(sesion: dict) -> str | None:
    from src.services.auth_service import es_equipo

    return None if es_equipo(sesion) else clave_de_plan(sesion.get("rol"))
