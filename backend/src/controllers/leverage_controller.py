from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from src.services import leverage_service as service
from src.services.auth_service import obtener_sesion_desde_request

# "Entrar con el classroom" desde ATV Leverage (ver leverage_service).
router = APIRouter(prefix="/api/leverage", tags=["leverage"])


class Autorizar(BaseModel):
    vuelta: str = Field(max_length=200)
    estado: str = Field(max_length=200)


class Canje(BaseModel):
    codigo: str = Field(max_length=200)
    vuelta: str = Field(max_length=200)


@router.post("/autorizar")
def autorizar(body: Autorizar, sesion: dict = Depends(obtener_sesion_desde_request)):
    """La persona del equipo aceptó conectar su Leverage: devuelve a dónde volver, con el código."""
    return service.autorizar(sesion, body.vuelta, body.estado)


@router.post("/canje")
def canje(body: Canje):
    """Leverage cambia el código de un solo uso por la clave personal."""
    return service.canjear(body.codigo, body.vuelta)
