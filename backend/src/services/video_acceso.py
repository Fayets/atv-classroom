"""Qué planes ven el video de una clase. El admin bloquea el video por plan (los SOPs nunca): quien no lo ve
recibe el cartel de "Próximamente" y el link no sale del servidor. El equipo de ATV ve siempre el video,
con el aviso de para quién está bloqueado."""

from contextvars import ContextVar

from src.services.roles_canal import rol_de_plan

# Las clases que un coach le mandó a este cliente con "Enviar clase": se ven aunque estén bloqueadas para su
# plan. Se cargan al armar ve_como (una vez por pedido) y viven solo durante ese pedido.
_COMPARTIDAS: ContextVar[frozenset] = ContextVar("clases_compartidas", default=frozenset())

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
    from src.services.permisos_service import valor

    bloqueos = bloqueado_para(clase)
    compartida = getattr(clase, "id", None) in _COMPARTIDAS.get()
    if ve_como is not None and not compartida and (ve_como in bloqueos or valor(ve_como, "clases") == "no"):
        return {"video_url": None, "video_proximamente": True}
    return {
        "video_url": clase.video_url,
        "video_proximamente": False,
        # Solo para el equipo: para quién está bloqueado lo que está mirando.
        "video_bloqueado_para": [_NOMBRES[p] for p in bloqueos] if ve_como is None else [],
    }


def ve_como(sesion: dict) -> str | None:
    from src.services.auth_service import es_equipo

    if es_equipo(sesion):
        return None
    _COMPARTIDAS.set(compartidas_de(sesion.get("usuario_id")))
    return clave_de_plan(sesion.get("rol"))


def compartidas_de(cliente_id) -> frozenset:
    """Las clases que le mandaron a este cliente (su equipo entra con el mismo id de cliente)."""
    if not cliente_id:
        return frozenset()
    from pony.orm import db_session

    from src.db import DB_SCHEMA, db

    with db_session:
        return frozenset(int(x) for x in db.select(f'SELECT clase_id FROM "{DB_SCHEMA}"."clases_compartidas" WHERE cliente_id = $cliente_id'))


def recursos(clase, ve_como: str | None) -> list[dict]:
    """Los SOPs de la clase, salvo que el plan los tenga apagados en Permisos."""
    from src.services.permisos_service import valor
    from src.utils.clase_content import serializar_recursos

    if ve_como is not None and valor(ve_como, "sops") == "no":
        return []
    return serializar_recursos(clase)


def modulo_cerrado(programa, ve_como: str | None) -> bool:
    """El módulo no se abre para ese plan: tiene las clases apagadas en Permisos o todos sus videos bloqueados
    para él. Los SOPs siguen en la pestaña SOPs."""
    from src.services.permisos_service import valor

    if ve_como is None:
        return False
    clases = [c for s in programa.secciones for c in s.clases]
    # Si le mandaron una clase de este módulo, el módulo se abre (las demás clases siguen con su bloqueo).
    if _COMPARTIDAS.get() & {getattr(c, "id", None) for c in clases}:
        return False
    if valor(ve_como, "clases") == "no":
        return True
    return bool(clases) and all(ve_como in bloqueado_para(c) for c in clases)
