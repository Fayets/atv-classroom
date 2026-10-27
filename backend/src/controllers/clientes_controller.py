from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool

from src.controllers.admin_controller import requerir_admin
from src.services import dispositivos_service
from src.services.clientes_service import ClientesServices

router = APIRouter(prefix="/api/admin/clientes", tags=["clientes"])
service = ClientesServices()


@router.get("")
async def carpeta(_sesion: dict = Depends(requerir_admin)):
    return await run_in_threadpool(service.carpeta)


@router.get("/{cliente_id}/dispositivos")
async def dispositivos(cliente_id: int, _sesion: dict = Depends(requerir_admin)):
    return await run_in_threadpool(dispositivos_service.de_cliente, cliente_id)


@router.delete("/dispositivos/{sesion_id}")
async def cerrar_dispositivo(sesion_id: int, _sesion: dict = Depends(requerir_admin)):
    await run_in_threadpool(dispositivos_service.cerrar_de_cliente, sesion_id)
    return {"ok": True}


@router.get("/{cliente_id}")
async def ficha(cliente_id: int, _sesion: dict = Depends(requerir_admin)):
    return await run_in_threadpool(service.ficha, cliente_id)
