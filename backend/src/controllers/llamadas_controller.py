from fastapi import APIRouter, Depends
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from src.services.auth_service import obtener_sesion_desde_request
from src.services.fathom_service import FathomServices
from src.services.llamadas_service import LlamadasServices

router = APIRouter(prefix="/api", tags=["llamadas"])
llamadas = LlamadasServices()
fathom = FathomServices()


class Clave(BaseModel):
    clave: str


class Link(BaseModel):
    url: str


class Cliente(BaseModel):
    cliente_id: int | None = None


@router.get("/llamadas")
async def listar(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(llamadas.listar, sesion)


@router.post("/llamadas/por-link")
async def por_link(datos: Link, sesion: dict = Depends(obtener_sesion_desde_request)):
    """Pegás el link de Fathom y trae la llamada con su transcripción."""
    return await run_in_threadpool(llamadas.por_link, sesion, datos.url)


@router.get("/llamadas/{llamada_id}")
async def detalle(llamada_id: int, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(llamadas.detalle, sesion, llamada_id)


@router.put("/llamadas/{llamada_id}/cliente")
async def asignar_cliente(llamada_id: int, datos: Cliente, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(llamadas.asignar_cliente, sesion, llamada_id, datos.cliente_id)


@router.get("/cuenta/fathom")
async def estado(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(fathom.estado, sesion)


@router.put("/cuenta/fathom")
async def conectar(datos: Clave, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(fathom.conectar, sesion, datos.clave)


@router.delete("/cuenta/fathom")
async def desconectar(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(fathom.desconectar, sesion)


@router.post("/cuenta/fathom/sincronizar")
async def sincronizar(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(fathom.sincronizar_ahora, sesion)
