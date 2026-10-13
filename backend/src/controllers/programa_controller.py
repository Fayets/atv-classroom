from fastapi import APIRouter, Depends, HTTPException

from src import schemas
from src.services.auth_service import obtener_sesion_desde_request, persona
from src.services.programa_service import ProgramaServices

router = APIRouter(prefix="/api/programas", tags=["programas"])
service = ProgramaServices()




@router.get("", response_model=list[schemas.ProgramaListItem])
def listar_programas(sesion: dict = Depends(obtener_sesion_desde_request)):
    try:
        tipo, pid = persona(sesion)
        return service.listar_programas(pid, tipo)
    except HTTPException as exc:
        raise exc
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al listar programas.")


@router.get("/{programa_id}", response_model=schemas.ProgramaDetalleResponse)
def obtener_programa(
    programa_id: int,
    sesion: dict = Depends(obtener_sesion_desde_request),
):
    try:
        tipo, pid = persona(sesion)
        return service.obtener_detalle_programa(programa_id, pid, tipo)
    except HTTPException as exc:
        raise exc
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener el programa.")
