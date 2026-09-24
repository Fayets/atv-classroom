import json
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


def _emails_del_cliente(cliente: ClienteExterno) -> set[str]:
    emails = {cliente.email} if cliente.email else set()
    if cliente.emails_json:
        try:
            emails.update(e for e in json.loads(cliente.emails_json) if isinstance(e, str))
        except ValueError:
            pass
    return {_normalizar_email(e) for e in emails if e.strip()}


def _buscar_cliente_por_email(email: str) -> ClienteExterno | None:
    candidatos = _buscar_clientes_por_email(email)
    return candidatos[0] if candidatos else None


def _buscar_clientes_por_email(email: str) -> list[ClienteExterno]:
    """El mail puede ser el principal o cualquiera de los cargados en atv-clients."""
    email_norm = _normalizar_email(email)
    encontrados = []
    for cliente in ClienteExterno.select()[:]:
        if email_norm in _emails_del_cliente(cliente):
            encontrados.append(cliente)
    return encontrados


def clave_desde_canal(canal: str | None) -> str | None:
    """#ema-romero → ema.romero (misma regla que muestra atv-clients)."""
    if not canal:
        return None
    limpio = canal.strip().lstrip("#").strip().lower()
    return limpio.replace("-", ".") if limpio else None


def _clave_correcta(cliente: ClienteExterno, contrasena: str) -> bool:
    clave = clave_desde_canal(cliente.canal_discord)
    if clave:
        return contrasena.strip().lower() == clave
    # Sin canal cargado queda la contraseña manual (seed), si la hay.
    return bool(cliente.password_hash) and _verify_password(contrasena, cliente.password_hash)


def _tiene_acceso(cliente: ClienteExterno) -> bool:
    """El acceso dura lo que dice fecha_vencimiento en atv-clients."""
    if cliente.estado_cliente == "inactivo":
        return False
    return cliente.fecha_vencimiento is None or cliente.fecha_vencimiento >= date.today()


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

        # Un mail puede estar en más de una ficha (ej. cliente que recompró): gana la que tenga
        # la clave correcta y, entre esas, la que siga con acceso.
        validos = [c for c in _buscar_clientes_por_email(email_norm) if _clave_correcta(c, contrasena)]
        if not validos:
            raise HTTPException(status_code=401, detail="Email o contrasena incorrectos.")

        cliente = next((c for c in validos if _tiene_acceso(c)), None)
        if cliente is None:
            vencimiento = max((c.fecha_vencimiento for c in validos if c.fecha_vencimiento), default=None)
            detalle = (
                f"Tu acceso venció el {vencimiento.strftime('%d/%m/%Y')}. Escribinos para renovarlo."
                if vencimiento
                else "Tu acceso no está activo. Escribinos para renovarlo."
            )
            raise HTTPException(status_code=403, detail=detalle)

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

    # Si el cliente vence con la sesión abierta, se corta en el próximo request.
    if sesion.get("tipo") == "cliente":
        with db_session:
            cliente = ClienteExterno.get(id=sesion["usuario_id"])
            if cliente is None or not _tiene_acceso(cliente):
                _sessions.pop(token, None)
                raise HTTPException(status_code=401, detail="Tu acceso al Classroom venció.")

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
