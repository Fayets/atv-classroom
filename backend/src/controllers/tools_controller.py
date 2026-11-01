from fastapi import APIRouter, Depends
from pydantic import BaseModel

from src.controllers.admin_controller import requerir_admin
from src.services import tools_service
from src.services.auth_service import es_equipo, obtener_sesion_desde_request

router = APIRouter(prefix="/api/tools", tags=["tools"])


@router.get("")
def listar(sesion: dict = Depends(obtener_sesion_desde_request)):
    if es_equipo(sesion):
        return tools_service.para_equipo()
    return tools_service.para_cliente(sesion.get("rol"))


class Cambio(BaseModel):
    plan: str
    tool: str
    estado: str


class Guardar(BaseModel):
    visible: bool | None = None
    cambios: list[Cambio] = []
    precios: dict[str, str] = {}


@router.get("/admin")
def ver(_sesion: dict = Depends(requerir_admin)):
    return tools_service.matriz()


@router.put("/admin")
def guardar(body: Guardar, _sesion: dict = Depends(requerir_admin)):
    return tools_service.guardar(body.visible, [c.model_dump() for c in body.cambios], body.precios)
