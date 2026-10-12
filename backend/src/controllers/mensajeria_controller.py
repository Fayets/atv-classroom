import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from src.services.auth_service import obtener_sesion_desde_request, sesion_desde_token
from src.services.mensajeria_service import MAX_TEXTO, MensajeriaServices, habilitada_para
from src.services.tiempo_real import hub

router = APIRouter(prefix="/api/mensajes", tags=["mensajes"])
ws_router = APIRouter(tags=["mensajes"])
service = MensajeriaServices()


def sesion_mensajes(sesion: dict = Depends(obtener_sesion_desde_request)) -> dict:
    if not habilitada_para(sesion):
        raise HTTPException(status_code=403, detail="La mensajería todavía no está disponible.")
    return sesion


class MensajeNuevo(BaseModel):
    texto: str = Field(min_length=1, max_length=MAX_TEXTO)
    respuesta_a: int | None = None


class MensajeEdicion(BaseModel):
    texto: str = Field(min_length=1, max_length=MAX_TEXTO)


class Leido(BaseModel):
    ultimo_id: int = Field(ge=0)


class CanalNuevo(BaseModel):
    nombre: str = Field(min_length=1, max_length=60)
    descripcion: str | None = Field(default=None, max_length=300)


@router.get("/canales")
def canales(sesion: dict = Depends(sesion_mensajes)):
    return service.listar_canales(sesion)


@router.post("/canales", status_code=201)
def crear_canal(body: CanalNuevo, sesion: dict = Depends(sesion_mensajes)):
    if sesion.get("rol") != "admin":
        raise HTTPException(status_code=403, detail="Solo un admin crea canales de anuncios.")
    return service.crear_canal_anuncios(body.nombre, body.descripcion)


@router.get("/no-leidos")
def no_leidos(sesion: dict = Depends(sesion_mensajes)):
    return service.no_leidos(sesion)


@router.get("/canales/{canal_id}/mensajes")
def mensajes(
    canal_id: int,
    antes_de: int | None = None,
    despues_de: int | None = None,
    sesion: dict = Depends(sesion_mensajes),
):
    return service.mensajes(sesion, canal_id, antes_de=antes_de, despues_de=despues_de)


@router.post("/canales/{canal_id}/mensajes", status_code=201)
async def enviar(canal_id: int, body: MensajeNuevo, sesion: dict = Depends(sesion_mensajes)):
    mensaje, canal = await run_in_threadpool(service.enviar, sesion, canal_id, body.texto, body.respuesta_a)
    await hub.emitir({"tipo": "mensaje", "mensaje": mensaje}, canal)
    return mensaje


@router.patch("/{mensaje_id}")
async def editar(mensaje_id: int, body: MensajeEdicion, sesion: dict = Depends(sesion_mensajes)):
    mensaje, canal = await run_in_threadpool(service.editar, sesion, mensaje_id, body.texto)
    await hub.emitir({"tipo": "editado", "mensaje": mensaje}, canal)
    return mensaje


@router.delete("/{mensaje_id}")
async def borrar(mensaje_id: int, sesion: dict = Depends(sesion_mensajes)):
    mensaje, canal = await run_in_threadpool(service.borrar, sesion, mensaje_id)
    await hub.emitir({"tipo": "borrado", "mensaje": mensaje}, canal)
    return mensaje


@router.post("/canales/{canal_id}/leido")
async def leido(canal_id: int, body: Leido, sesion: dict = Depends(sesion_mensajes)):
    evento, canal = await run_in_threadpool(service.marcar_leido, sesion, canal_id, body.ultimo_id)
    await hub.emitir({"tipo": "leido", **evento}, canal)
    return evento


@ws_router.websocket("/api/ws")
async def tiempo_real(websocket: WebSocket):
    """El token viaja en el primer mensaje, no en la URL, para que no quede en los logs del proxy."""
    await websocket.accept()
    try:
        primero = await asyncio.wait_for(websocket.receive_json(), timeout=10)
    except Exception:
        await websocket.close(code=4401)
        return
    token = primero.get("token") if isinstance(primero, dict) and primero.get("tipo") == "auth" else None
    sesion = await run_in_threadpool(sesion_desde_token, token) if token else None
    if sesion is None:
        await websocket.send_json({"tipo": "error", "detalle": "sesion"})
        await websocket.close(code=4401)
        return
    if not habilitada_para(sesion):
        await websocket.send_json({"tipo": "error", "detalle": "deshabilitada"})
        await websocket.close(code=4403)
        return

    hub.conectar(websocket, sesion)
    await websocket.send_json({"tipo": "listo"})
    try:
        while True:
            crudo = await websocket.receive_text()
            try:
                evento = json.loads(crudo)
            except ValueError:
                continue
            if not isinstance(evento, dict):
                continue
            tipo = evento.get("tipo")
            if tipo == "ping":
                # Cada ping revalida la sesión: una baja o un vencimiento cortan la conexión.
                if await run_in_threadpool(sesion_desde_token, token) is None:
                    await websocket.close(code=4401)
                    break
                await websocket.send_json({"tipo": "pong"})
            elif tipo == "escribiendo":
                try:
                    canal_id = int(evento.get("canal_id"))
                except (TypeError, ValueError):
                    continue
                canal = await run_in_threadpool(service.canal_visible_info, sesion, canal_id)
                if canal is not None:
                    await hub.emitir(
                        {"tipo": "escribiendo", "canal_id": canal_id, "nombre": sesion["nombre"]},
                        canal,
                        excepto=websocket,
                    )
    except WebSocketDisconnect:
        pass
    finally:
        hub.desconectar(websocket)
