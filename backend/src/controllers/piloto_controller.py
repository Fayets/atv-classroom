from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from src.controllers.mensajeria_controller import sesion_mensajes
from src.services.mensajeria_service import MensajeriaServices
from src.services.piloto_service import PilotoServices
from src.services.tiempo_real import hub

router = APIRouter(prefix="/api/piloto", tags=["piloto"])
service = PilotoServices()
mensajeria = MensajeriaServices()


class Modo(BaseModel):
    modo: str | None = None
    bloqueados: list[str] | None = None


@router.get("/modo")
def mi_modo(sesion: dict = Depends(sesion_mensajes)):
    return service.mi_modo(sesion)


@router.put("/modo")
def cambiar_mi_modo(body: Modo, sesion: dict = Depends(sesion_mensajes)):
    return service.cambiar_mi_modo(sesion, body.modo, body.bloqueados)


@router.get("/canales/{canal_id}")
def del_canal(canal_id: int, sesion: dict = Depends(sesion_mensajes)):
    """El borrador pendiente del chat y qué mensajes salieron solos (para la marca "Piloto")."""
    return service.del_canal(sesion, canal_id)


class Envio(BaseModel):
    texto: str | None = Field(default=None, max_length=4000)


@router.post("/borradores/{borrador_id}/enviar")
async def enviar(borrador_id: int, body: Envio, sesion: dict = Depends(sesion_mensajes)):
    mensaje, canal = await run_in_threadpool(service.enviar, sesion, borrador_id, body.texto)
    await hub.emitir({"tipo": "mensaje", "mensaje": mensaje}, canal)
    await hub.emitir_equipo_del_canal({"tipo": "piloto", "canal_id": canal["id"]}, canal)
    return mensaje


@router.post("/borradores/{borrador_id}/descartar")
async def descartar(borrador_id: int, sesion: dict = Depends(sesion_mensajes)):
    canal = await run_in_threadpool(service.descartar, sesion, borrador_id)
    await hub.emitir_equipo_del_canal({"tipo": "piloto", "canal_id": canal["id"]}, canal)
    return {"ok": True}
