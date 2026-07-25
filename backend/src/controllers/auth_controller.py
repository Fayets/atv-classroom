from fastapi import APIRouter, Depends, HTTPException

from src import schemas
from src.services.auth_service import login, obtener_perfil_sesion, obtener_sesion_desde_request

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=schemas.LoginResponse)
def login_endpoint(body: schemas.LoginRequest):
    try:
        return login(body.email, body.contrasena)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al iniciar sesión.")


@router.get("/me", response_model=schemas.SessionProfileResponse)
def perfil_endpoint(sesion: dict = Depends(obtener_sesion_desde_request)):
    return obtener_perfil_sesion(sesion)
