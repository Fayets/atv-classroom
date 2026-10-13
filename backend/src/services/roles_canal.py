"""Roles de un canal grupal, como en Discord: quién puede ver (y escribir en) el canal.
Sin base de datos: lo usan la mensajería y el reparto en vivo."""

ROLES = [
    {"id": "equipo", "nombre": "Equipo ATV", "planes": []},
    {"id": "high", "nombre": "High Level", "planes": ["advantage", "high"]},
    {"id": "boost", "nombre": "Boost", "planes": ["boost"]},
    {"id": "mid", "nombre": "Mid level", "planes": ["mid"]},
    {"id": "entry", "nombre": "Entry level", "planes": ["entry"]},
    {"id": "mentoria", "nombre": "Mentoria", "planes": ["mentoria"]},
]
_POR_ID = {r["id"]: r for r in ROLES}
_ROL_DE_PLAN = {p: r["id"] for r in ROLES for p in r["planes"]}


def rol_de_plan(plan: str | None) -> str | None:
    return _ROL_DE_PLAN.get((plan or "").lower())


def nombre_rol(rol_id: str) -> str:
    return _POR_ID.get(rol_id, {}).get("nombre", rol_id)


def validar_roles(roles: list[str] | None) -> list[str]:
    limpios = [r for r in dict.fromkeys(roles or []) if r in _POR_ID]
    return [r["id"] for r in ROLES if r["id"] in limpios]  # en el orden de ROLES


def cliente_ve(plan: str | None, roles: list[str]) -> bool:
    rol = rol_de_plan(plan)
    return rol is not None and rol in roles
