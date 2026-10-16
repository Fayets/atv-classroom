from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from src.services.fathom_service import recibir_webhook

router = APIRouter(prefix="/api/fathom", tags=["fathom"])


@router.post("/webhook/{token}")
async def webhook(token: str, request: Request):
    """Fathom avisa que una llamada está lista. Sin sesión: lo protege la firma (y el token de la URL)."""
    cuerpo = await request.body()
    encabezados = {k.lower(): v for k, v in request.headers.items()}
    nueva = await run_in_threadpool(recibir_webhook, token, encabezados, cuerpo)
    return {"ok": True, "nueva": nueva}
