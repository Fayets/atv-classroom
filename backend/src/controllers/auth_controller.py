from fastapi import APIRouter, Depends, HTTPException, Request

from src import schemas
from src.services import freno_login, google_service
from src.services.auth_service import (
    cerrar_sesion,
    login,
    login_google,
    obtener_perfil_sesion,
    obtener_sesion_desde_request,
    token_desde_request,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/config", response_model=schemas.AuthConfigResponse)
def config_endpoint():
    """Lo público que necesita la pantalla de login (el client id de Google no es secreto)."""
    return {"google_client_id": google_service.client_id() or None}


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


@router.post("/google", response_model=schemas.LoginResponse)
def google_endpoint(body: schemas.GoogleLoginRequest, request: Request):
    ip = freno_login.ip_de(request)
    freno_login.verificar("google", ip)
    try:
        datos = google_service.verificar_credencial(body.credencial)
        return login_google(datos)
    except HTTPException as exc:
        if exc.status_code in (401, 403):
            freno_login.registrar_fallo("google", ip)
        raise


@router.post("/logout", status_code=204)
def logout_endpoint(request: Request):
    token = token_desde_request(request)
    if token:
        cerrar_sesion(token)


@router.get("/me", response_model=schemas.SessionProfileResponse)
def perfil_endpoint(sesion: dict = Depends(obtener_sesion_desde_request)):
    return obtener_perfil_sesion(sesion)
