import secrets
import time
from datetime import date, timedelta

import bcrypt
from fastapi import HTTPException, Request
from pony.orm import db_session

from src.db import db
from src.models import Admin, ClienteExterno

TOKEN_TTL = timedelta(days=7)
_sessions: dict[str, dict] = {}


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def _normalizar_email(email: str) -> str:
    return email.strip().lower()


def _calcular_dias_restantes(fecha_vencimiento: date | None) -> int | None:
    if fecha_vencimiento is None:
        return None
    return (fecha_vencimiento - date.today()).days


def _buscar_admin_por_email(email: str) -> Admin | None:
    email_norm = _normalizar_email(email)
    for admin in Admin.select()[:]:
        if admin.email.strip().lower() == email_norm:
            return admin
    return None


def _buscar_cliente_por_email(email: str) -> ClienteExterno | None:
    email_norm = _normalizar_email(email)
    for cliente in ClienteExterno.select()[:]:
        if cliente.email and cliente.email.strip().lower() == email_norm:
            return cliente
    return None


def _crear_token(session_data: dict) -> str:
    token = secrets.token_urlsafe(32)
    _sessions[token] = {
        **session_data,
        "expires_at": time.time() + TOKEN_TTL.total_seconds(),
    }
    return token


def _obtener_sesion(token: str) -> dict | None:
    sesion = _sessions.get(token)
    if sesion is None:
        return None
    if time.time() > sesion["expires_at"]:
        del _sessions[token]
        return None
    return sesion


def crear_admin(*, email: str, password: str, nombre: str | None = None) -> Admin:
    email_norm = _normalizar_email(email)

    with db_session:
        if _buscar_admin_por_email(email_norm) is not None:
            raise ValueError(f"El admin {email_norm} ya existe.")

        kwargs: dict = {
            "email": email_norm,
            "password_hash": _hash_password(password),
        }
        if nombre is not None:
            kwargs["nombre"] = nombre.strip()

        admin = Admin(**kwargs)
        db.flush()
        return admin


def set_password_cliente(email: str, password: str) -> bool:
    """Setea password_hash en clients.clientes. Retorna False si ya tenía password."""
    email_norm = _normalizar_email(email)

    with db_session:
        cliente = _buscar_cliente_por_email(email_norm)
        if cliente is None:
            raise ValueError(f"Cliente {email_norm} no encontrado en clients.clientes.")

        if cliente.password_hash:
            return False

        cliente.password_hash = _hash_password(password)
        return True


def login(email: str, contrasena: str) -> dict:
    email_norm = _normalizar_email(email)

    with db_session:
        admin = _buscar_admin_por_email(email_norm)
        if admin is not None:
            if not admin.activo:
                raise HTTPException(status_code=401, detail="Email o contrasena incorrectos.")
            if not _verify_password(contrasena, admin.password_hash):
                raise HTTPException(status_code=401, detail="Email o contrasena incorrectos.")

            session_data = {
                "usuario_id": admin.id,
                "nombre": admin.nombre or admin.email,
                "email": admin.email,
                "rol": "admin",
                "tipo": "admin",
            }
            return {
                "token": _crear_token(session_data),
                **{k: v for k, v in session_data.items() if k != "tipo"},
                "dias_restantes": None,
            }

        cliente = _buscar_cliente_por_email(email_norm)
        if cliente is None:
            raise HTTPException(status_code=401, detail="Email o contrasena incorrectos.")

        if cliente.estado_cliente != "vigente":
            raise HTTPException(status_code=401, detail="Email o contrasena incorrectos.")

        if not cliente.password_hash or not _verify_password(contrasena, cliente.password_hash):
            raise HTTPException(status_code=401, detail="Email o contrasena incorrectos.")

        rol = cliente.plan_actual or "mentoria"
        dias_restantes = _calcular_dias_restantes(cliente.fecha_vencimiento)
        session_data = {
            "usuario_id": cliente.id,
            "nombre": cliente.nombre or cliente.email,
            "email": cliente.email,
            "rol": rol,
            "tipo": "cliente",
        }
        return {
            "token": _crear_token(session_data),
            **{k: v for k, v in session_data.items() if k != "tipo"},
            "dias_restantes": dias_restantes,
        }


def obtener_sesion_desde_request(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autorizado.")

    token = auth_header.removeprefix("Bearer ").strip()
    sesion = _obtener_sesion(token)
    if sesion is None:
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada.")

    return {
        "usuario_id": sesion["usuario_id"],
        "nombre": sesion["nombre"],
        "email": sesion["email"],
        "rol": sesion["rol"],
    }


def obtener_perfil_sesion(sesion: dict) -> dict:
    if sesion["rol"] == "admin":
        return {
            "usuario_id": sesion["usuario_id"],
            "nombre": sesion["nombre"],
            "email": sesion["email"],
            "rol": sesion["rol"],
            "dias_restantes": None,
            "fecha_vencimiento": None,
        }

    with db_session:
        cliente = ClienteExterno.get(id=sesion["usuario_id"])
        if cliente is None:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")

        fecha_vencimiento = cliente.fecha_vencimiento
        return {
            "usuario_id": sesion["usuario_id"],
            "nombre": sesion["nombre"],
            "email": sesion["email"],
            "rol": sesion["rol"],
            "dias_restantes": _calcular_dias_restantes(fecha_vencimiento),
            "fecha_vencimiento": fecha_vencimiento.isoformat() if fecha_vencimiento else None,
        }
