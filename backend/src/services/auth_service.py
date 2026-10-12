import hashlib
import json
import secrets
import time
from datetime import date, datetime, timedelta

import bcrypt
from fastapi import HTTPException, Request
from pony.orm import db_session

from src.db import db
from src.models import Admin, ClienteExterno, SesionGuardada

TOKEN_TTL = timedelta(days=7)
ROLES_EQUIPO = ("admin", "coach")

# Caché en memoria de las sesiones guardadas en la base: evita una consulta por request.
_sessions: dict[str, dict] = {}


def es_equipo(sesion: dict) -> bool:
    return sesion.get("rol") in ROLES_EQUIPO


def tipo_de_sesion(sesion: dict) -> str:
    """'admin' para cualquier miembro del equipo (su id es de la tabla admins), 'cliente' si no."""
    return "admin" if es_equipo(sesion) else "cliente"


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
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


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _a_epoch(momento: datetime) -> float:
    return (momento - datetime(1970, 1, 1)).total_seconds()


def _crear_token(session_data: dict) -> str:
    token = secrets.token_urlsafe(32)
    expira = datetime.utcnow() + TOKEN_TTL
    with db_session:
        SesionGuardada(
            token_hash=_hash_token(token),
            usuario_id=session_data["usuario_id"],
            tipo=session_data["tipo"],
            rol=session_data["rol"],
            nombre=session_data["nombre"],
            email=session_data["email"],
            expira_en=expira,
        )
    _sessions[token] = {**session_data, "expires_at": _a_epoch(expira)}
    return token


def _obtener_sesion(token: str) -> dict | None:
    sesion = _sessions.get(token)
    if sesion is None:
        with db_session:
            guardada = SesionGuardada.get(token_hash=_hash_token(token))
            if guardada is None:
                return None
            sesion = {
                "usuario_id": guardada.usuario_id,
                "tipo": guardada.tipo,
                "rol": guardada.rol,
                "nombre": guardada.nombre,
                "email": guardada.email,
                "expires_at": _a_epoch(guardada.expira_en),
            }
        _sessions[token] = sesion
    if time.time() > sesion["expires_at"]:
        cerrar_sesion(token)
        return None
    return sesion


def cerrar_sesion(token: str) -> None:
    _sessions.pop(token, None)
    with db_session:
        guardada = SesionGuardada.get(token_hash=_hash_token(token))
        if guardada is not None:
            guardada.delete()


def cerrar_sesiones_de_admin(admin_id: int) -> None:
    """Al dar de baja a alguien del equipo se le cortan todas las sesiones abiertas."""
    for token, sesion in list(_sessions.items()):
        if sesion.get("tipo") == "admin" and sesion.get("usuario_id") == admin_id:
            _sessions.pop(token, None)
    with db_session:
        for guardada in SesionGuardada.select()[:]:
            if guardada.tipo == "admin" and guardada.usuario_id == admin_id:
                guardada.delete()


def _sesion_de_admin(admin: Admin) -> dict:
    session_data = {
        "usuario_id": admin.id,
        "nombre": admin.nombre or admin.email,
        "email": admin.email,
        "rol": admin.rol or "admin",
        "tipo": "admin",
    }
    return {
        "token": _crear_token(session_data),
        **{k: v for k, v in session_data.items() if k != "tipo"},
        "dias_restantes": None,
        "foto_url": admin.foto_url,
    }


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
            return _sesion_de_admin(admin)

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


def login_google(datos: dict) -> dict:
    """datos: lo que devolvió Google ya verificado (sub, email, nombre, foto).
    Solo entra quien esté cargado y activo en el equipo; el primer ingreso ata la cuenta de Google."""
    with db_session:
        admin = _buscar_admin_por_email(datos["email"])
        if admin is None or not admin.activo:
            raise HTTPException(
                status_code=403,
                detail="Tu cuenta de Google no está habilitada en el equipo de ATV. Pedile acceso a un admin.",
            )
        if admin.google_sub and admin.google_sub != datos["sub"]:
            raise HTTPException(status_code=403, detail="Esa cuenta de Google no coincide con la registrada.")
        admin.google_sub = datos["sub"]
        if datos.get("foto"):
            admin.foto_url = datos["foto"]
        if not admin.nombre and datos.get("nombre"):
            admin.nombre = datos["nombre"]
        return _sesion_de_admin(admin)


def token_desde_request(request: Request) -> str | None:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    return auth_header.removeprefix("Bearer ").strip() or None


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
                cerrar_sesion(token)
                raise HTTPException(status_code=401, detail="Tu acceso al Classroom venció.")

    return {
        "usuario_id": sesion["usuario_id"],
        "nombre": sesion["nombre"],
        "email": sesion["email"],
        "rol": sesion["rol"],
    }


def obtener_perfil_sesion(sesion: dict) -> dict:
    if es_equipo(sesion):
        with db_session:
            admin = Admin.get(id=sesion["usuario_id"])
            foto = admin.foto_url if admin else None
        return {
            "usuario_id": sesion["usuario_id"],
            "nombre": sesion["nombre"],
            "email": sesion["email"],
            "rol": sesion["rol"],
            "dias_restantes": None,
            "fecha_vencimiento": None,
            "foto_url": foto,
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
