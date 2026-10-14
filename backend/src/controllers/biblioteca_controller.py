from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from src.services.auth_service import obtener_sesion_desde_request
from src.services.biblioteca_service import BibliotecaServices

router = APIRouter(prefix="/api/biblioteca", tags=["biblioteca"])
service = BibliotecaServices()


@router.get("")
async def listar(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.listar, sesion)
