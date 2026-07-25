from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from src import schemas
from src.services.agent_service import responder_stream
from src.services.auth_service import obtener_sesion_desde_request

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("")
async def chat(
    body: schemas.ChatRequest,
    _sesion: dict = Depends(obtener_sesion_desde_request),
):
    async def stream():
        async for chunk in responder_stream(body.pregunta):
            yield chunk

    return StreamingResponse(stream(), media_type="text/plain; charset=utf-8")
