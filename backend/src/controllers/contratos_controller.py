from urllib.parse import quote

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from src.controllers.admin_controller import requerir_admin
from src.services.contratos_service import ContratosServices

router = APIRouter(prefix="/api/admin/contratos", tags=["contratos"])
service = ContratosServices()


@router.get("")
async def listar(_sesion: dict = Depends(requerir_admin)):
    return await run_in_threadpool(service.listar)


@router.get("/{session_id}/pdf")
async def pdf(session_id: str, _sesion: dict = Depends(requerir_admin)):
    contenido, nombre = await run_in_threadpool(service.pdf, session_id)
    return Response(
        contenido,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(nombre)}", "Cache-Control": "private, no-store"},
    )
