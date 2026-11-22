from fastapi import APIRouter, Body, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from src.services.auth_service import es_equipo, obtener_sesion_desde_request
from src.services.onboarding_equipo_service import OnboardingEquipoServices

router = APIRouter(tags=["onboarding-equipo"])
service = OnboardingEquipoServices()


def requerir_equipo(sesion: dict = Depends(obtener_sesion_desde_request)) -> dict:
    if not es_equipo(sesion):
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    return sesion


# El miembro del equipo del cliente: su cartel y su formulario.
@router.get("/api/onboarding-equipo/pendiente")
async def pendiente(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.pendiente, sesion)


@router.post("/api/onboarding-equipo")
async def responder(datos: dict = Body(...), sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.responder, sesion, datos)


# El equipo de ATV, desde las acciones rápidas del chat del cliente.
@router.get("/api/onboarding-equipo/cliente/{cliente_id}")
async def de_cliente(cliente_id: int, _sesion: dict = Depends(requerir_equipo)):
    return await run_in_threadpool(service.de_cliente, cliente_id)


@router.post("/api/onboarding-equipo/miembro/{miembro_id}")
async def pedir(miembro_id: int, sesion: dict = Depends(requerir_equipo)):
    return await run_in_threadpool(service.pedir, sesion, miembro_id)


@router.delete("/api/onboarding-equipo/miembro/{miembro_id}")
async def cancelar(miembro_id: int, _sesion: dict = Depends(requerir_equipo)):
    return await run_in_threadpool(service.cancelar, miembro_id)
