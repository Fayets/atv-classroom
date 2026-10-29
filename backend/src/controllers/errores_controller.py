from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from src.services import errores_service
from src.services.auth_service import sesion_desde_token, token_desde_request

router = APIRouter(prefix="/api/errores-front", tags=["errores"])


class ErrorNavegador(BaseModel):
    tipo: str = Field(default="error", max_length=30)
    mensaje: str = Field(default="", max_length=4000)
    pila: str | None = Field(default=None, max_length=20000)
    ruta: str | None = Field(default=None, max_length=1000)
    desde: str | None = Field(default=None, max_length=1000)
    version: str | None = Field(default=None, max_length=100)


@router.post("", status_code=204)
async def registrar(body: ErrorNavegador, request: Request):
    """Un error del navegador. No exige sesión (la pantalla en blanco puede ser justo el login), pero si viene,
    se guarda de quién es."""
    token = token_desde_request(request)
    sesion = sesion_desde_token(token) if token else None
    ip = request.headers.get("X-Real-IP") or (request.client.host if request.client else "")
    await run_in_threadpool(errores_service.registrar, body.model_dump(), sesion, ip, request.headers.get("User-Agent", ""))
