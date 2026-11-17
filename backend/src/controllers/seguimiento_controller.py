import asyncio

from fastapi import APIRouter, Body, Depends
from starlette.concurrency import run_in_threadpool

from src.services import push_service
from src.services.auth_service import obtener_sesion_desde_request
from src.services.seguimiento_service import SeguimientoServices, puede
from src.services.tiempo_real import hub

router = APIRouter(prefix="/api/seguimiento", tags=["seguimiento"])
service = SeguimientoServices()


async def despachar(envio_id: int) -> int:
    """Manda un envío y lo avisa en vivo (bandejas abiertas y celulares), como un mensaje escrito a mano.
    Devuelve a cuántos chats (o canales) llegó."""
    salida = await run_in_threadpool(service.preparar, envio_id)
    for mensaje, canal in salida:
        await hub.emitir({"tipo": "mensaje", "mensaje": mensaje}, canal)
        await run_in_threadpool(push_service.avisar_mensaje, mensaje, canal["id"])
    return len({canal["id"] for _, canal in salida})  # chats (o canales) a los que llegó, no globitos


@router.get("/acceso")
async def acceso(sesion: dict = Depends(obtener_sesion_desde_request)):
    return {"puede": await run_in_threadpool(puede, sesion)}


@router.get("/opciones")
async def opciones(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.opciones, sesion)


@router.get("/clientes")
async def clientes(q: str = "", sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.buscar_clientes, sesion, q)


@router.get("/envios")
async def envios(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.listar, sesion)


@router.post("/envios", status_code=201)
async def crear(datos: dict = Body(...), sesion: dict = Depends(obtener_sesion_desde_request)):
    creado = await run_in_threadpool(service.crear, sesion, datos)
    if creado["ya"]:
        creado["enviados"] = await despachar(creado["id"])
    return creado


@router.delete("/envios/{envio_id}")
async def cancelar(envio_id: int, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.cancelar, sesion, envio_id)


async def programados_siempre() -> None:
    """Cada 30 s: los programados cuya hora llegó."""
    import logging

    await asyncio.sleep(20)
    while True:
        try:
            for envio_id in await run_in_threadpool(service.vencidos):
                await despachar(envio_id)
        except Exception:
            logging.getLogger("seguimiento").exception("Seguimiento: falló la vuelta de programados")
        await asyncio.sleep(30)
