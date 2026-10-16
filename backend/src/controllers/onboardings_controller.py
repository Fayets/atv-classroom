from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from src.services.auth_service import obtener_sesion_desde_request
from src.services.onboardings_service import OnboardingsServices
from src.services.pizarra_service import PizarraServices

router = APIRouter(prefix="/api/onboardings", tags=["onboardings"])
service = OnboardingsServices()
pizarras = PizarraServices()


@router.get("")
async def listar(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.listar, sesion)


@router.get("/formularios")
async def formularios(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.formularios, sesion)


@router.get("/{session_id}/pizarra")
async def pizarra(session_id: str, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(pizarras.ver, sesion, session_id)


@router.post("/{session_id}/pizarra")
async def rearmar_pizarra(session_id: str, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(pizarras.ver, sesion, session_id, True)


@router.get("/{session_id}")
async def detalle(session_id: str, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.detalle, sesion, session_id)
