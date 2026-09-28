"""Módulos que se muestran pero todavía no se pueden abrir ("se desbloquea pronto").
Para abrir uno, sacarlo de la lista y reiniciar el backend."""

from fastapi import HTTPException

MODULOS_BLOQUEADOS = {"launch"}
MENSAJE = "Este módulo se desbloquea pronto."


def programa_bloqueado(programa) -> bool:
    return (programa.slug or "").lower() in MODULOS_BLOQUEADOS


def exigir_desbloqueado(programa) -> None:
    if programa_bloqueado(programa):
        raise HTTPException(status_code=403, detail=MENSAJE)
