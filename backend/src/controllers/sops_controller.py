from fastapi import APIRouter, Depends
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from src.services.auth_service import obtener_sesion_desde_request
from src.services.solicitud_service import SolicitudServices

router = APIRouter(prefix="/api/sops-solicitados", tags=["sops"])
service = SolicitudServices()


class Cambio(BaseModel):
    estado: str | None = None
    entrega_url: str | None = None


@router.get("")
async def listar(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.listar, sesion)


@router.patch("/{solicitud_id}")
async def actualizar(solicitud_id: int, datos: Cambio, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.actualizar, sesion, solicitud_id, datos.estado, datos.entrega_url)
