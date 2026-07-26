import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from src import schemas
from src.services.agent_service import _FUENTES_MARKER, responder_stream
from src.services.auth_service import obtener_sesion_desde_request
from src.services.chat_service import (
    cargar_historial,
    guardar_mensaje,
    obtener_o_crear_sesion_id,
    tipo_usuario_desde_sesion,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("")
async def chat(
    body: schemas.ChatRequest,
    sesion: dict = Depends(obtener_sesion_desde_request),
):
    usuario_id = sesion["usuario_id"]
    tipo_usuario = tipo_usuario_desde_sesion(sesion)
    sesion_id = obtener_o_crear_sesion_id(usuario_id, tipo_usuario)
    historial = cargar_historial(sesion_id)
    pregunta = body.pregunta.strip()

    guardar_mensaje(
        sesion_id=sesion_id,
        usuario_id=usuario_id,
        tipo_usuario=tipo_usuario,
        rol="user",
        contenido=pregunta,
    )

    async def stream():
        partes: list[str] = []
        async for chunk in responder_stream(pregunta, historial=historial):
            if chunk.startswith(_FUENTES_MARKER):
                yield chunk
                continue
            partes.append(chunk)
            yield chunk

        respuesta = "".join(partes).strip()
        if respuesta:
            guardar_mensaje(
                sesion_id=sesion_id,
                usuario_id=usuario_id,
                tipo_usuario=tipo_usuario,
                rol="assistant",
                contenido=respuesta,
            )

    return StreamingResponse(stream(), media_type="text/plain; charset=utf-8")
