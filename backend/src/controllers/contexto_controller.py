from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from src.services.auth_service import obtener_sesion_desde_request
from src.services.contexto_service import ContextoServices

router = APIRouter(prefix="/api/contexto", tags=["contexto"])
service = ContextoServices()


@router.get("/clientes/{cliente_id}")
async def de_cliente(cliente_id: int, sesion: dict = Depends(obtener_sesion_desde_request)):
    """El pase de guardia: el timeline del cliente y lo que no puede faltar antes de la próxima 1 a 1."""
    return await run_in_threadpool(service.de_cliente, sesion, cliente_id)
