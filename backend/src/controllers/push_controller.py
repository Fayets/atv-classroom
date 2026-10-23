from fastapi import APIRouter, Depends
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from src.services import push_service
from src.services.auth_service import obtener_sesion_desde_request

router = APIRouter(prefix="/api/push", tags=["push"])


class Claves(BaseModel):
    p256dh: str
    auth: str


class Suscripcion(BaseModel):
    endpoint: str
    keys: Claves
    dispositivo: str | None = None


class Baja(BaseModel):
    endpoint: str


@router.get("/clave")
async def clave(_sesion: dict = Depends(obtener_sesion_desde_request)):
    return {"clave": await run_in_threadpool(push_service.clave_publica), "activo": push_service.activo()}


@router.post("/suscripcion")
async def suscribir(body: Suscripcion, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(push_service.suscribir, sesion, body.endpoint, body.keys.p256dh, body.keys.auth, body.dispositivo)


@router.post("/baja")
async def baja(body: Baja, _sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(push_service.desuscribir, body.endpoint)


@router.post("/prueba")
async def prueba(sesion: dict = Depends(obtener_sesion_desde_request)):
    return {"enviados": await run_in_threadpool(push_service.probar, sesion)}
