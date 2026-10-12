"""Ingreso del equipo con Google: el navegador obtiene un ID token de Google Identity Services
y acá se valida firma, emisor, audiencia (nuestro client id) y que el mail esté verificado."""

from decouple import config
from fastapi import HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

_transporte = google_requests.Request()


def client_id() -> str:
    return config("GOOGLE_CLIENT_ID", default="").strip()


def verificar_credencial(credencial: str) -> dict:
    cid = client_id()
    if not cid:
        raise HTTPException(status_code=503, detail="El ingreso con Google todavía no está configurado.")
    try:
        datos = id_token.verify_oauth2_token(credencial, _transporte, cid, clock_skew_in_seconds=10)
    except ValueError:
        raise HTTPException(status_code=401, detail="No pudimos validar tu cuenta de Google. Probá de nuevo.")
    if not datos.get("email_verified") or not datos.get("email"):
        raise HTTPException(status_code=401, detail="Tu cuenta de Google no tiene el mail verificado.")
    return {
        "sub": str(datos["sub"]),
        "email": str(datos["email"]).strip().lower(),
        "nombre": datos.get("name"),
        "foto": datos.get("picture"),
    }
