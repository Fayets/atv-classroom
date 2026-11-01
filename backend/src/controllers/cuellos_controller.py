from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from src.services.auth_service import es_equipo, obtener_sesion_desde_request
from src.services.cuellos_service import CuellosServices

router = APIRouter(prefix="/api/cuellos", tags=["cuellos"])
service = CuellosServices()


def requerir_equipo(sesion: dict = Depends(obtener_sesion_desde_request)) -> dict:
    if not es_equipo(sesion):
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    return sesion


class Pedido(BaseModel):
    cliente_id: int
    loom_url: str | None = None
    texto: str | None = None
    contexto: str | None = None
    cierre_periodo: str | None = None


class Texto(BaseModel):
    texto: str


class Aprobar(BaseModel):
    texto: str | None = None


class Leccion(BaseModel):
    seccion: str
    texto: str
    antes: str | None = None
    despues: str | None = None


class Lecciones(BaseModel):
    lecciones: list[Leccion]


@router.post("/jeremy/{token}")
async def de_jeremy(token: str, request: Request):
    """La vuelta de Jeremy (trigger "ATV Bottleneck"): sin sesión, la dirección lleva el token del diagnóstico."""
    try:
        cuerpo = await request.json()
    except ValueError:
        raise HTTPException(status_code=422, detail="El cuerpo no es JSON.")
    return await run_in_threadpool(service.recibir, token, cuerpo if isinstance(cuerpo, dict) else {})


@router.get("")
async def lista(_sesion: dict = Depends(requerir_equipo)):
    return await run_in_threadpool(service.lista)


@router.get("/clientes")
async def clientes(_sesion: dict = Depends(requerir_equipo)):
    return await run_in_threadpool(service.clientes)


@router.get("/cliente/{cliente_id}")
async def de_cliente(cliente_id: int, _sesion: dict = Depends(requerir_equipo)):
    return await run_in_threadpool(service.de_cliente, cliente_id)


@router.get("/neurona")
async def neurona(_sesion: dict = Depends(requerir_equipo)):
    return await run_in_threadpool(service.neurona)


@router.post("")
async def pedir(body: Pedido, sesion: dict = Depends(requerir_equipo)):
    return await run_in_threadpool(lambda: service.pedir(sesion, body.cliente_id, body.loom_url, body.texto, body.contexto, cierre_periodo=body.cierre_periodo))


@router.get("/{diag_id}")
async def detalle(diag_id: int, _sesion: dict = Depends(requerir_equipo)):
    return await run_in_threadpool(service.detalle, diag_id)


@router.put("/{diag_id}")
async def guardar(diag_id: int, body: Texto, _sesion: dict = Depends(requerir_equipo)):
    return await run_in_threadpool(service.guardar, diag_id, body.texto)


@router.post("/{diag_id}/reintentar")
async def reintentar(diag_id: int, _sesion: dict = Depends(requerir_equipo)):
    return await run_in_threadpool(service.reintentar, diag_id)


@router.post("/{diag_id}/aprobar")
async def aprobar(diag_id: int, body: Aprobar, sesion: dict = Depends(requerir_equipo)):
    return await run_in_threadpool(service.aprobar, sesion, diag_id, body.texto)


@router.post("/{diag_id}/lecciones")
async def lecciones(diag_id: int, body: Lecciones, _sesion: dict = Depends(requerir_equipo)):
    return await run_in_threadpool(service.guardar_lecciones, diag_id, [l.model_dump() for l in body.lecciones])


@router.delete("/lecciones/{leccion_id}")
async def desactivar(leccion_id: int, _sesion: dict = Depends(requerir_equipo)):
    return await run_in_threadpool(service.desactivar_leccion, leccion_id)
