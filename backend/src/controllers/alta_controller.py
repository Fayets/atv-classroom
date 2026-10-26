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
    pago: str | None = None  # modalidad de pago del contrato; High Level y Boost son siempre pago único
    ficha_id: int | None = None  # la ficha que ya existe por una seña
    sin_ficha: bool = False  # confirmó que no es ninguna de las fichas de seña parecidas


@router.get("")
async def listar(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.listar, sesion)


@router.post("")
async def crear(datos: Alta, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.crear, sesion, datos.nombre, datos.email, datos.plan, datos.ficha_id, datos.sin_ficha, datos.pago)


@router.get("/senas")
async def senas(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.senas, sesion)


@router.get("/buscar-ficha")
async def buscar_ficha(nombre: str = "", email: str = "", sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.buscar_ficha, sesion, nombre, email)


@router.post("/{alta_id}/enviar-onboarding")
async def enviar(alta_id: int, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.enviar_mail, sesion, alta_id)


@router.delete("/{alta_id}")
async def anular(alta_id: int, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.anular, sesion, alta_id)
