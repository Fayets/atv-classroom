from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool

from src.controllers.admin_controller import requerir_admin
from src.services.clientes_service import ClientesServices

router = APIRouter(prefix="/api/admin/clientes", tags=["clientes"])
service = ClientesServices()


@router.get("")
async def carpeta(_sesion: dict = Depends(requerir_admin)):
    return await run_in_threadpool(service.carpeta)


@router.get("/{cliente_id}")
async def ficha(cliente_id: int, _sesion: dict = Depends(requerir_admin)):
    return await run_in_threadpool(service.ficha, cliente_id)
