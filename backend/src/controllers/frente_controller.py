import logging
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.services.auth_service import obtener_sesion_desde_request
from src.services.frente_service import FrenteServices
from src.services.guia_service import recomendar
from src.services.solicitud_service import SolicitudServices, avisar_pedido_ayuda

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["frentes"])
service = FrenteServices()
solicitudes = SolicitudServices()


class FrentePatch(BaseModel):
    vistas: list[int] | None = None
    sop_link: str | None = Field(default=None, max_length=2000)
    sops: dict[str, str] | None = None
    revisado: bool | None = None


class GuiaRequest(BaseModel):
    texto: str = Field(min_length=3, max_length=1500)


class ConsultaRequest(BaseModel):
    texto: str = Field(min_length=3, max_length=3000)
    slug: str | None = None


class SolicitudSopRequest(BaseModel):
    nombre: str = Field(min_length=3, max_length=160)
    area: str = Field(max_length=40)
    problema: str = Field(min_length=3, max_length=1500)
    consulta: str | None = Field(default=None, max_length=1500)


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


@router.delete("/frentes/{slug}", status_code=204)
def eliminar_frente(slug: str, sesion: dict = Depends(obtener_sesion_desde_request)):
    service.eliminar(slug, sesion["usuario_id"], _tipo(sesion))


# Tope de consultas a la guía por persona y por día: corta el uso de juguete y los loops por error.
GUIA_TOPE_DIARIO = 30
_consultas_hoy: dict[str, list[float]] = {}


def _contar_consulta(sesion: dict) -> None:
    clave = f"{sesion['rol']}:{sesion['usuario_id']}"
    ahora = time.time()
    recientes = [t for t in _consultas_hoy.get(clave, []) if ahora - t < 24 * 3600]
    if len(recientes) >= GUIA_TOPE_DIARIO:
        raise HTTPException(status_code=429, detail="Llegaste al límite de consultas de hoy. Mañana podés seguir preguntando.")
    recientes.append(ahora)
    _consultas_hoy[clave] = recientes


@router.post("/guia")
async def guia(body: GuiaRequest, sesion: dict = Depends(obtener_sesion_desde_request)):
    _contar_consulta(sesion)
    try:
        return await recomendar(body.texto)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Guía ATV: error procesando la consulta")
        raise HTTPException(status_code=500, detail="La guía no pudo procesar tu mensaje. Probá de nuevo.")


@router.post("/consultas")
async def consulta_coach(body: ConsultaRequest, sesion: dict = Depends(obtener_sesion_desde_request)):
    consulta = service.registrar_consulta(sesion["usuario_id"], _tipo(sesion), body.texto, body.slug)
    coach = None
    if body.slug:
        ctx = service.contexto_ayuda(body.slug)
        coach = ctx["coach"]
        consulta["avisado"] = await avisar_pedido_ayuda(sesion, _tipo(sesion), consulta["id"], ctx["titulo"], body.texto, coach)
    consulta["coach"] = coach["nombre"] if coach else None
    return consulta


@router.post("/solicitudes-sop", status_code=201)
async def solicitar_sop(body: SolicitudSopRequest, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await solicitudes.crear(sesion, _tipo(sesion), body.nombre, body.area, body.problema, body.consulta)
