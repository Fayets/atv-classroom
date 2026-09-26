from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.services.auth_service import obtener_sesion_desde_request
from src.services.frente_service import FrenteServices
from src.services.guia_service import recomendar

router = APIRouter(prefix="/api", tags=["frentes"])
service = FrenteServices()


class FrentePatch(BaseModel):
    vistas: list[int] | None = None
    sop_link: str | None = Field(default=None, max_length=2000)
    automatizado: bool | None = None


class GuiaRequest(BaseModel):
    texto: str = Field(min_length=3, max_length=1500)


class ConsultaRequest(BaseModel):
    texto: str = Field(min_length=3, max_length=3000)
    slug: str | None = None


def _tipo(sesion: dict) -> str:
    return "admin" if sesion["rol"] == "admin" else "cliente"


@router.get("/frentes")
def listar_frentes(sesion: dict = Depends(obtener_sesion_desde_request)):
    return service.listar(sesion["usuario_id"], _tipo(sesion))


@router.get("/frentes/{slug}")
def detalle_frente(slug: str, sesion: dict = Depends(obtener_sesion_desde_request)):
    return service.detalle(slug, sesion["usuario_id"], _tipo(sesion))


@router.put("/frentes/{slug}")
def actualizar_frente(slug: str, body: FrentePatch, sesion: dict = Depends(obtener_sesion_desde_request)):
    return service.actualizar(slug, sesion["usuario_id"], _tipo(sesion), body.model_dump(exclude_unset=True))


@router.post("/guia")
async def guia(body: GuiaRequest, sesion: dict = Depends(obtener_sesion_desde_request)):
    try:
        return await recomendar(body.texto)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="La guía no pudo procesar tu mensaje. Probá de nuevo.")


@router.post("/consultas")
def consulta_coach(body: ConsultaRequest, sesion: dict = Depends(obtener_sesion_desde_request)):
    return service.registrar_consulta(sesion["usuario_id"], _tipo(sesion), body.texto, body.slug)
