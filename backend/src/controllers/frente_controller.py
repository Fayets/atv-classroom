import logging
import time

import json

from fastapi import APIRouter, Depends, HTTPException
from pony.orm import db_session
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from src.services.auth_service import obtener_sesion_desde_request, tipo_de_sesion
from src.services.frente_service import FrenteServices
from src.services.video_acceso import ve_como
from src.services.guia_service import recomendar
from src.services.plan_acceso import sin_ia
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
    return tipo_de_sesion(sesion)


@router.get("/frentes")
def listar_frentes(sesion: dict = Depends(obtener_sesion_desde_request)):
    return service.listar(sesion["usuario_id"], _tipo(sesion))


@router.get("/frentes/{slug}")
def detalle_frente(slug: str, sesion: dict = Depends(obtener_sesion_desde_request)):
    return service.detalle(slug, sesion["usuario_id"], _tipo(sesion), ve_como=ve_como(sesion))


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
    if sin_ia(sesion):
        raise HTTPException(status_code=403, detail="Tu plan no incluye la guía.")
    _contar_consulta(sesion)
    try:
        respuesta = await recomendar(body.texto)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Guía ATV: error procesando la consulta")
        raise HTTPException(status_code=500, detail="La guía no pudo procesar tu mensaje. Probá de nuevo.")
    await run_in_threadpool(_guardar_consulta, sesion, body.texto, respuesta)
    return respuesta


def _guardar_consulta(sesion: dict, texto: str, respuesta: dict) -> None:
    """Queda registrada para el cerebro; si falla, la respuesta al cliente sale igual."""
    from src.models import ConsultaGuia

    try:
        with db_session:
            ConsultaGuia(
                usuario_id=sesion["usuario_id"],
                tipo_usuario=_tipo(sesion),
                texto=texto.strip()[:1500],
                clases_json=json.dumps([r["clase_id"] for r in respuesta.get("recomendaciones") or respuesta.get("sops") or [] if r.get("clase_id")]),
                frente=(respuesta.get("frente") or {}).get("slug"),
            )
    except Exception:
        logger.exception("Guía ATV: no se pudo guardar la consulta para el cerebro")


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
