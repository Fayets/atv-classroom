from fastapi import APIRouter, Depends

from src import schemas
from src.controllers.admin_controller import requerir_admin
from src.services.equipo_service import EquipoServices

router = APIRouter(prefix="/api/admin/equipo", tags=["equipo"])
service = EquipoServices()


@router.get("", response_model=list[schemas.MiembroEquipo])
def listar(_sesion: dict = Depends(requerir_admin)):
    return service.listar()


@router.post("", response_model=schemas.MiembroEquipo, status_code=201)
def crear(body: schemas.MiembroEquipoCreate, _sesion: dict = Depends(requerir_admin)):
    return service.crear(body.model_dump())


@router.patch("/{miembro_id}", response_model=schemas.MiembroEquipo)
def actualizar(miembro_id: int, body: schemas.MiembroEquipoPatch, sesion: dict = Depends(requerir_admin)):
    return service.actualizar(miembro_id, body.model_dump(exclude_unset=True), sesion)
