from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from src.services.auth_service import obtener_sesion_desde_request
from src.services.live_sessions_service import LiveSessionsServices

router = APIRouter(prefix="/api/live-sessions", tags=["live-sessions"])
service = LiveSessionsServices()


class LiveSession(BaseModel):
    programa_id: int
    titulo: str
    url: str
    fecha: date | None = None
    descripcion: str | None = None


@router.get("/modulos")
def modulos(sesion: dict = Depends(obtener_sesion_desde_request)):
    """Los módulos de live sessions a los que se puede subir una grabación."""
    return service.modulos(sesion)


@router.post("", status_code=201)
def subir(body: LiveSession, sesion: dict = Depends(obtener_sesion_desde_request)):
    """La grabación de una clase en vivo: queda como clase nueva, arriba de todo, en ese módulo."""
    return service.subir(sesion, body.programa_id, body.titulo, body.url, body.fecha, body.descripcion)


@router.delete("/{clase_id}", status_code=204)
def borrar(clase_id: int, sesion: dict = Depends(obtener_sesion_desde_request)):
    service.borrar(sesion, clase_id)
