from fastapi import APIRouter, Depends, Query
from starlette.concurrency import run_in_threadpool

from src.controllers.admin_controller import requerir_admin
from src.services import aprendizaje_service as aprendizaje
from src.services.cerebro_service import CerebroServices

router = APIRouter(prefix="/api/admin/cerebro", tags=["cerebro"])
service = CerebroServices()


@router.get("")
def grafo(_sesion: dict = Depends(requerir_admin)):
    return service.grafo()


@router.get("/nodo")
def nodo(id: str = Query(min_length=3, max_length=80), _sesion: dict = Depends(requerir_admin)):
    return service.nodo(id)


@router.get("/nichos")
async def nichos(nicho: str | None = Query(default=None, max_length=40), _sesion: dict = Depends(requerir_admin)):
    """Base de conocimiento por nicho: clientes, dolores, objeciones, qué les funcionó."""
    return await run_in_threadpool(aprendizaje.por_nicho, nicho)


@router.get("/contexto")
async def contexto(canal_id: int, admin_id: int, _sesion: dict = Depends(requerir_admin)):
    """Lo que va a usar la IA para escribir como esa persona del equipo a ese cliente."""
    return await run_in_threadpool(aprendizaje.contexto_para_responder, canal_id, admin_id)


@router.post("/aprender")
async def aprender(_sesion: dict = Depends(requerir_admin)):
    """Corre un ciclo de aprendizaje ahora (además del automático)."""
    return await run_in_threadpool(aprendizaje.ciclo)
