from fastapi import APIRouter, Depends, HTTPException

from src import schemas
from src.services.auth_service import obtener_sesion_desde_request
from src.services.clase_service import ClaseServices

router = APIRouter(prefix="/api/clases", tags=["clases"])
service = ClaseServices()


def _tipo_desde_rol(rol: str) -> str:
    return "admin" if rol == "admin" else "cliente"


@router.get("/{clase_id}", response_model=schemas.ClaseDetalleResponse)
def obtener_clase(
    clase_id: int,
    sesion: dict = Depends(obtener_sesion_desde_request),
):
    try:
        tipo = _tipo_desde_rol(sesion["rol"])
        return service.obtener_detalle_clase(clase_id, sesion["usuario_id"], tipo)
    except HTTPException as exc:
        raise exc
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener la clase.")


@router.put("/{clase_id}/progreso", response_model=schemas.ProgresoResponse)
def marcar_progreso(
    clase_id: int,
    body: schemas.ProgresoRequest,
    sesion: dict = Depends(obtener_sesion_desde_request),
):
    try:
        tipo = _tipo_desde_rol(sesion["rol"])
        return service.marcar_progreso(
            clase_id,
            sesion["usuario_id"],
            tipo,
            body.completado,
        )
    except HTTPException as exc:
        raise exc
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al marcar progreso.")


@router.put("/{clase_id}/nota", response_model=schemas.NotaResponse)
def guardar_nota(
    clase_id: int,
    body: schemas.NotaRequest,
    sesion: dict = Depends(obtener_sesion_desde_request),
):
    try:
        tipo = _tipo_desde_rol(sesion["rol"])
        return service.guardar_nota(
            clase_id,
            sesion["usuario_id"],
            tipo,
            body.texto,
        )
    except HTTPException as exc:
        raise exc
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al guardar la nota.")
