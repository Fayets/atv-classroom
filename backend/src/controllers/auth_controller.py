from fastapi import APIRouter, Depends, HTTPException, Request

from src import schemas
from src.services import freno_login
from src.services.auth_service import login, obtener_perfil_sesion, obtener_sesion_desde_request

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=schemas.LoginResponse)
def login_endpoint(body: schemas.LoginRequest, request: Request):
    email = body.email.strip().lower()
    ip = freno_login.ip_de(request)
    freno_login.verificar(email, ip)
    try:
        sesion = login(body.email, body.contrasena)
    except HTTPException as exc:
        if exc.status_code == 401:
            freno_login.registrar_fallo(email, ip)
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al iniciar sesión.")
    freno_login.limpiar(email)
    return sesion


@router.get("/me", response_model=schemas.SessionProfileResponse)
def perfil_endpoint(sesion: dict = Depends(obtener_sesion_desde_request)):
    return obtener_perfil_sesion(sesion)
