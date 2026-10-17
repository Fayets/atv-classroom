from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from src.controllers.mensajeria_controller import sesion_mensajes
from src.services.mensajeria_service import MensajeriaServices
from src.services.sugerencias_service import SugerenciasServices

router = APIRouter(prefix="/api/mensajes", tags=["sugerencias"])
service = SugerenciasServices()
mensajeria = MensajeriaServices()


class Borrador(BaseModel):
    borrador: str = Field(default="", max_length=2000)


@router.post("/canales/{canal_id}/sugerir")
async def sugerir(canal_id: int, body: Borrador, sesion: dict = Depends(sesion_mensajes)):
    """Cómo seguiría el mensaje esta persona del equipo (o la respuesta entera si no escribió nada)."""
    canal = await run_in_threadpool(mensajeria.canal_visible_info, sesion, canal_id)
    if canal is None:
        raise HTTPException(status_code=404, detail="Canal no encontrado.")
    sistema, usuario, sid = await run_in_threadpool(service.preparar, sesion, canal, body.borrador)
    # Texto plano en streaming: el navegador muestra la sugerencia a medida que la IA la escribe.
    return StreamingResponse(
        service.transmitir(sistema, usuario, body.borrador, sid),
        media_type="text/plain; charset=utf-8",
        headers={"X-Sugerencia-Id": str(sid), "Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


class Enviada(BaseModel):
    mensaje_id: int


@router.post("/sugerencias/{sugerencia_id}/enviada")
async def enviada(sugerencia_id: int, body: Enviada, sesion: dict = Depends(sesion_mensajes)):
    """Lo que se mandó después de aceptar la sugerencia (la corrección enseña la voz)."""
    return await run_in_threadpool(service.enviada, sesion, sugerencia_id, body.mensaje_id)


@router.post("/sugerencias/{sugerencia_id}/usada")
async def usada(sugerencia_id: int, sesion: dict = Depends(sesion_mensajes)):
    return await run_in_threadpool(service.usada, sesion, sugerencia_id)
