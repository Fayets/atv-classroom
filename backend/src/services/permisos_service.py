"""Qué parte del classroom ve cada plan: la pantalla Permisos del admin. Cada interruptor es una fila de
permisos_plan (plan, clave, valor); lo que no está guardado toma el valor por defecto de abajo. El equipo de
ATV no pasa por acá: ve todo. El cupo del equipo del cliente vive en limites_equipo (equipo_cliente_service)."""

import time

from fastapi import HTTPException
from pony.orm import db_session

from src.models import PermisoPlan
from src.services.video_acceso import PLANES_VIDEO, clave_de_plan

# clave → (nombre, valores posibles). "chat" tiene un tercer estado: solo para pedir las sesiones 1 a 1.
PERMISOS = {
    "clases": ("Clases (videos)", ["si", "no"]),
    "sops": ("SOPs", ["si", "no"]),
    "roadmaps": ("Roadmaps", ["si", "no"]),
    "chat": ("Chat con coaches", ["si", "1a1", "no"]),
    "comunidad": ("Comunidad", ["si", "no"]),
    "ia": ("Asistente IA", ["si", "no"]),
}
# El 2K es solo contenido (Franco, 26 y 27-10-2026): su canal es para pedir 1 a 1, sin comunidad, IA ni roadmaps.
_POR_DEFECTO_2K = {"chat": "1a1", "comunidad": "no", "ia": "no", "roadmaps": "no"}


def por_defecto(plan: str, clave: str) -> str:
    return (_POR_DEFECTO_2K if plan == "2k" else {}).get(clave, "si")


def valor(plan: str | None, clave: str) -> str:
    """El valor para un plan (la clave de rol_de_plan o el plan crudo). Sin plan (el equipo de ATV): todo."""
    if plan is None:
        return "si"
    plan = clave_de_plan(plan)
    return _guardados().get((plan, clave)) or por_defecto(plan, clave)


# Se leen en cada clase de cada página: una lectura cada 10 s alcanza (y guardar la refresca al instante).
_CACHE: dict = {"hasta": 0.0, "filas": {}}


def _guardados() -> dict:
    if time.monotonic() > _CACHE["hasta"]:
        with db_session:
            _CACHE["filas"] = {(f.plan, f.clave): f.valor for f in list(PermisoPlan.select())}
        _CACHE["hasta"] = time.monotonic() + 10
    return _CACHE["filas"]


def permite(sesion: dict, clave: str) -> bool:
    from src.services.auth_service import es_equipo

    return es_equipo(sesion) or valor(sesion.get("rol"), clave) != "no"


def exigir(sesion: dict, clave: str) -> None:
    if not permite(sesion, clave):
        raise HTTPException(status_code=403, detail=f"{PERMISOS[clave][0]} no está incluido en tu plan.")


def matriz() -> dict:
    from src.services.equipo_cliente_service import limite_de

    planes = [p["id"] for p in PLANES_VIDEO]
    _CACHE["hasta"] = 0.0
    guardados = _guardados()
    return {
        "planes": PLANES_VIDEO,
        "permisos": [
            {"clave": c, "nombre": nombre, "valores": valores,
             "por_plan": {p: guardados.get((p, c), por_defecto(p, c)) for p in planes}}
            for c, (nombre, valores) in PERMISOS.items()
        ],
        # El cupo se guarda por plan crudo (limites_equipo): High Level es "advantage" ahí.
        "equipo": _cupos(planes, limite_de),
        "plan_cupo": {p: CUPO_DE.get(p, p) for p in planes},
    }


def guardar(cambios: list[dict]) -> dict:
    """cambios: [{"plan", "clave", "valor"}]."""
    planes = {p["id"] for p in PLANES_VIDEO}
    with db_session:
        for c in cambios:
            plan, clave, val = c.get("plan"), c.get("clave"), c.get("valor")
            if plan not in planes or clave not in PERMISOS or val not in PERMISOS[clave][1]:
                raise HTTPException(status_code=422, detail=f"Permiso inválido: {plan} · {clave} · {val}.")
            fila = PermisoPlan.get(plan=plan, clave=clave)
            if fila:
                fila.valor = val
            else:
                PermisoPlan(plan=plan, clave=clave, valor=val)
    return matriz()


CUPO_DE = {"high": "advantage"}


def _cupos(planes: list[str], limite_de) -> dict:
    with db_session:
        return {p: limite_de(CUPO_DE.get(p, p)) for p in planes}
