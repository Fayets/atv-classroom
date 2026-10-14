from fastapi import APIRouter, Depends
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from src.services.auth_service import obtener_sesion_desde_request
from src.services.roadmap_ia_service import RoadmapIAServices
from src.services.roadmap_service import RoadmapServices

router = APIRouter(prefix="/api/roadmap", tags=["roadmap"])
service = RoadmapServices()
ia = RoadmapIAServices()


class Doc(BaseModel):
    titulo: str | None = None
    url: str | None = None
    fathom_url: str | None = None
    tipo: str | None = None
    fecha: str | None = None
    area: str | None = None
    coach_id: int | None = None
    pasos_total: int | None = None
    paso_actual: int | None = None
    principal: bool | None = None
    pasos: list[dict] | None = None  # [{"texto", "quien": cliente|atv}]


class Generar(BaseModel):
    transcripcion: str | None = None
    llamada_id: int | None = None  # una llamada de la carpeta Llamadas (su Fathom conectado)


class Tilde(BaseModel):
    hecho: bool


@router.get("")
async def mio(sesion: dict = Depends(obtener_sesion_desde_request)):
    """El roadmap del cliente que entra (o de su equipo)."""
    return await run_in_threadpool(service.ver, sesion, None)


@router.get("/clientes/{cliente_id}")
async def de_cliente(cliente_id: int, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.ver, sesion, cliente_id)


@router.post("/clientes/{cliente_id}")
async def crear(cliente_id: int, datos: Doc, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.crear, sesion, cliente_id, datos.model_dump(exclude_unset=True))


@router.patch("/docs/{doc_id}")
async def editar(doc_id: int, datos: Doc, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.editar, sesion, doc_id, datos.model_dump(exclude_unset=True))


@router.delete("/docs/{doc_id}")
async def borrar(doc_id: int, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.borrar, sesion, doc_id)


@router.post("/clientes/{cliente_id}/generar")
async def generar(cliente_id: int, datos: Generar, sesion: dict = Depends(obtener_sesion_desde_request)):
    """Borrador con IA desde la transcripción de la llamada: pasos, mensaje y entregables. No guarda nada."""
    return await run_in_threadpool(lambda: ia.generar(sesion, cliente_id, datos.transcripcion, llamada_id=datos.llamada_id))


@router.put("/docs/{doc_id}/pasos/{paso_id}")
async def marcar_paso(doc_id: int, paso_id: int, datos: Tilde, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.marcar_paso, sesion, doc_id, paso_id, datos.hecho)
