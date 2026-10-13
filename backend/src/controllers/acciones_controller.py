from fastapi import APIRouter, Depends
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from src.services.acciones_service import AccionesServices
from src.services.auth_service import obtener_sesion_desde_request

router = APIRouter(prefix="/api/acciones", tags=["acciones"])
service = AccionesServices()


class Accion(BaseModel):
    nombre: str
    texto: str


@router.get("")
async def listar(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.listar, sesion)


@router.post("")
async def crear(datos: Accion, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.crear, sesion, datos.nombre, datos.texto)


@router.patch("/{accion_id}")
async def editar(accion_id: int, datos: Accion, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.editar, sesion, accion_id, datos.nombre, datos.texto)


@router.delete("/{accion_id}")
async def borrar(accion_id: int, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.borrar, sesion, accion_id)
