import hashlib
import json
import re
import secrets
import time
from datetime import date, datetime, timedelta

import bcrypt
from decouple import config
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


# Plata (señas, pagos, cuotas) y notas de la caja: solo admins y las áreas que las usan.
AREAS_CON_PLATA = ("ventas", "sistemas")


def ve_plata(sesion: dict) -> bool:
    if sesion.get("rol") == "admin":
        return True
    if not es_equipo(sesion):
        return False
    with db_session:
        yo = Admin.get(id=sesion.get("usuario_id"))
        return bool(yo and yo.activo and yo.area in AREAS_CON_PLATA)


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
            miembro_id=session_data.get("miembro_id"),
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
                "miembro_id": guardada.miembro_id,
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
        miembro = None
        if not validos:
            # ¿Es alguien del equipo de un cliente? Entra con su mail y la clave del cliente.
            from src.models import MiembroCliente

            miembro = MiembroCliente.get(email=email_norm)
            titular = ClienteExterno.get(id=miembro.cliente_id) if miembro else None
            if titular is None or not _clave_correcta(titular, contrasena):
                raise HTTPException(status_code=401, detail="Email o contrasena incorrectos.")
            validos = [titular]

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
        if miembro is not None:
            # La cuenta es la del cliente (chat, plan, vencimiento); la persona es el miembro.
            session_data.update({"nombre": miembro.nombre, "email": miembro.email, "miembro_id": miembro.id})
        return {
            "token": _crear_token(session_data),
            **{k: v for k, v in session_data.items() if k != "tipo"},
            "dias_restantes": dias_restantes,
            **(_datos_miembro(miembro, cliente) if miembro is not None else {}),
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


def sesion_desde_token(token: str) -> dict | None:
    """Lo mismo que valida cada request, para conexiones que no son HTTP (WebSocket)."""
    try:
        return _validar_token(token)
    except HTTPException:
        return None


def obtener_sesion_desde_request(request: Request) -> dict:
    token = token_desde_request(request)
    if not token:
        raise HTTPException(status_code=401, detail="No autorizado.")
    sesion = _validar_token(token)
    # Cliente en pausa: solo puede leer su canal. Todo lo demás (módulos, IA, roadmaps, escribir) se corta
    # acá, en el servidor, con 423 para que la app muestre el cartel de "hablá con Lucas".
    if sesion.get("pausa") and not permitido_en_pausa(request.method, request.url.path):
        raise HTTPException(status_code=423, detail=mensaje_pausa())
    return sesion


# Lo que puede hacer un cliente en pausa: recorrer el classroom (las listas de programas y frentes, su
# perfil) y leer su canal. Entrar a un programa o clase, la IA, el roadmap o escribir: no.
_EN_PAUSA = (
    ("GET", re.compile(r"^/api/(programas|frentes)$")),
    ("GET", re.compile(r"^/api/auth/")),
    ("POST", re.compile(r"^/api/auth/logout$")),
    ("GET", re.compile(r"^/api/mensajes/(habilitada|canales|no-leidos|roles|equipo)$")),
    ("GET", re.compile(r"^/api/mensajes/canales/\d+/(mensajes|participantes)$")),
    ("GET", re.compile(r"^/api/mensajes/adjuntos/\d+$")),
    ("POST", re.compile(r"^/api/mensajes/canales/\d+/leido$")),
    ("GET", re.compile(r"^/api/cuenta(/|$)")),
)
PAUSA_CONTACTO = config("PAUSA_CONTACTO", default="Lucas")
PAUSA_WHATSAPP = config("PAUSA_WHATSAPP", default="")


def permitido_en_pausa(metodo: str, ruta: str) -> bool:
    return any(metodo == m and r.match(ruta) for m, r in _EN_PAUSA)


def contacto_pausa() -> dict:
    numero = "".join(ch for ch in PAUSA_WHATSAPP if ch.isdigit())
    return {"nombre": PAUSA_CONTACTO, "whatsapp": PAUSA_WHATSAPP or None, "link": f"https://wa.me/{numero}" if numero else None}


def mensaje_pausa() -> str:
    c = contacto_pausa()
    return f"Tu programa está en pausa. Para reanudarlo, escribile a {c['nombre']}" + (f" al {c['whatsapp']}." if c["whatsapp"] else ".")


def _validar_token(token: str) -> dict:
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
            if sesion.get("miembro_id"):
                from src.models import MiembroCliente

                m = MiembroCliente.get(id=sesion["miembro_id"])
                if m is None or m.cliente_id != cliente.id:
                    cerrar_sesion(token)
                    raise HTTPException(status_code=401, detail="Ya no estás en el equipo de este cliente.")
                sesion["miembro_rol"] = m.rol
            from src.models import Canal

            canal = Canal.get(cliente_id=cliente.id)
            en_pausa = bool(canal and canal.pausa)
    else:
        en_pausa = False

    return {
        "usuario_id": sesion["usuario_id"],
        "nombre": sesion["nombre"],
        "email": sesion["email"],
        "rol": sesion["rol"],
        "miembro_id": sesion.get("miembro_id"),
        "miembro_rol": sesion.get("miembro_rol"),
        "pausa": en_pausa,
    }


def _datos_miembro(miembro, cliente) -> dict:
    from src.services.equipo_cliente_service import nombre_rol

    return {"miembro": {"id": miembro.id, "rol": miembro.rol, "rol_nombre": nombre_rol(miembro.rol), "cliente_nombre": cliente.nombre or cliente.email}}


def persona(sesion: dict) -> tuple[str, int]:
    """Quién es la persona (no la cuenta): para progreso, notas, fotos y firma de mensajes."""
    if es_equipo(sesion):
        return "admin", sesion["usuario_id"]
    if sesion.get("miembro_id"):
        return "miembro", sesion["miembro_id"]
    return "cliente", sesion["usuario_id"]


def _foto_cliente(cliente_id: int) -> str | None:
    from src.services.cuenta_service import foto_de

    return foto_de("cliente", cliente_id)


def obtener_perfil_sesion(sesion: dict) -> dict:
    if es_equipo(sesion):
        with db_session:
            admin = Admin.get(id=sesion["usuario_id"])
            from src.services.cuenta_service import foto_de

            foto = foto_de("admin", sesion["usuario_id"], admin.foto_url if admin else None)
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
            "pausa": bool(sesion.get("pausa")),
            "contacto_pausa": contacto_pausa() if sesion.get("pausa") else None,
            "dias_restantes": _calcular_dias_restantes(fecha_vencimiento),
            "fecha_vencimiento": fecha_vencimiento.isoformat() if fecha_vencimiento else None,
            "foto_url": _foto_persona(sesion),
            "miembro": _miembro_de_sesion(sesion, cliente),
        }


def _foto_persona(sesion: dict) -> str | None:
    from src.services.cuenta_service import foto_de

    tipo, pid = persona(sesion)
    return foto_de(tipo, pid)


def _miembro_de_sesion(sesion: dict, cliente) -> dict | None:
    if not sesion.get("miembro_id"):
        return None
    from src.models import MiembroCliente

    m = MiembroCliente.get(id=sesion["miembro_id"])
    return _datos_miembro(m, cliente)["miembro"] if m else None
