from fastapi import APIRouter, Body, Depends
from starlette.concurrency import run_in_threadpool

from src.controllers.admin_controller import requerir_admin
from src.services.auth_service import obtener_sesion_desde_request
from src.services.cierre_service import CierreServices

router = APIRouter(tags=["cierre"])
service = CierreServices()


@router.get("/api/cierre/pendiente")
async def pendiente(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.pendiente, sesion)


@router.post("/api/cierre/{periodo}")
async def responder(periodo: str, datos: dict = Body(...), sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.responder, sesion, periodo, datos)


@router.get("/api/admin/cierres")
async def meses(_sesion: dict = Depends(requerir_admin)):
    return await run_in_threadpool(service.meses)


@router.get("/api/admin/cierres/{periodo}")
async def mes(periodo: str, _sesion: dict = Depends(requerir_admin)):
    return await run_in_threadpool(service.mes, periodo)


@router.post("/api/admin/cierres/{periodo}/enviar")
async def enviar(periodo: str, sesion: dict = Depends(requerir_admin)):
    return await run_in_threadpool(service.enviar, sesion, periodo)
