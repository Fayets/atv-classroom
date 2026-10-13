from fastapi import APIRouter, Depends
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from src.services.alta_service import AltaServices
from src.services.auth_service import obtener_sesion_desde_request

router = APIRouter(prefix="/api/altas", tags=["altas"])
service = AltaServices()


class Alta(BaseModel):
    nombre: str
    email: str
    plan: str


@router.get("")
async def listar(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.listar, sesion)


@router.post("")
async def crear(datos: Alta, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.crear, sesion, datos.nombre, datos.email, datos.plan)


@router.post("/{alta_id}/enviar-onboarding")
async def enviar(alta_id: int, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.enviar_mail, sesion, alta_id)


@router.delete("/{alta_id}")
async def anular(alta_id: int, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.anular, sesion, alta_id)
