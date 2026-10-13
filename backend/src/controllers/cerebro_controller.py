from fastapi import APIRouter, Depends, Query

from src.controllers.admin_controller import requerir_admin
from src.services.cerebro_service import CerebroServices

router = APIRouter(prefix="/api/admin/cerebro", tags=["cerebro"])
service = CerebroServices()


@router.get("")
def grafo(_sesion: dict = Depends(requerir_admin)):
    return service.grafo()


@router.get("/nodo")
def nodo(id: str = Query(min_length=3, max_length=80), _sesion: dict = Depends(requerir_admin)):
    return service.nodo(id)
