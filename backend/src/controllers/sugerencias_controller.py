import base64
import json

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
    sistema, usuario, sid, porque = await run_in_threadpool(service.preparar, sesion, canal, body.borrador)
    # Texto plano en streaming: el navegador muestra la sugerencia a medida que la IA la escribe.
    # Lo que entendió va en un encabezado (base64 de JSON: los encabezados no llevan tildes).
    return StreamingResponse(
        service.transmitir(sistema, usuario, body.borrador, sid),
        media_type="text/plain; charset=utf-8",
        headers={
            "X-Sugerencia-Id": str(sid),
            "X-Sugerencia-Porque": base64.b64encode(json.dumps(porque, ensure_ascii=False).encode()).decode(),
            "Access-Control-Expose-Headers": "X-Sugerencia-Id, X-Sugerencia-Porque",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
        },
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


class Regla(BaseModel):
    texto: str = Field(max_length=300)
    sugerencia_id: int | None = None


@router.get("/reglas-voz")
async def reglas(sesion: dict = Depends(sesion_mensajes)):
    """Las reglas que le diste al Tab corrigiéndolo (o las de la voz que usás)."""
    return await run_in_threadpool(service.reglas, sesion)


@router.post("/reglas-voz")
async def agregar_regla(body: Regla, sesion: dict = Depends(sesion_mensajes)):
    return await run_in_threadpool(service.agregar_regla, sesion, body.texto, body.sugerencia_id)


@router.delete("/reglas-voz/{regla_id}")
async def borrar_regla(regla_id: int, sesion: dict = Depends(sesion_mensajes)):
    return await run_in_threadpool(service.borrar_regla, sesion, regla_id)
