from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from src.services import cerebro_chat_service as service
from src.services.auth_service import obtener_sesion_desde_request

router = APIRouter(prefix="/api/consultas", tags=["consultas"])


class Turno(BaseModel):
    rol: str
    texto: str = Field(max_length=8000)


class Pregunta(BaseModel):
    pregunta: str = Field(min_length=3, max_length=4000)
    historial: list[Turno] = []


@router.post("")
async def preguntar(body: Pregunta, sesion: dict = Depends(obtener_sesion_desde_request)):
    """Arranca la consulta al cerebro; la respuesta se pide después con GET /api/consultas/{id}."""
    return await run_in_threadpool(service.empezar, sesion, body.pregunta, [t.model_dump() for t in body.historial])


@router.get("/{tid}")
def estado(tid: str, sesion: dict = Depends(obtener_sesion_desde_request)):
    return service.estado(sesion, tid)
