import logging
import uuid
from datetime import datetime, timedelta

from decouple import config
from pony.orm import commit, db_session

from src.models import Mensaje

logger = logging.getLogger(__name__)

_ROL_USER = "user"
_ROL_ASSISTANT = "assistant"
_TIPO_ADMIN = "admin"
_TIPO_CLIENTE = "cliente"


def _historial_max() -> int:
    return config("CHAT_HISTORIAL_MAX", default=15, cast=int)


def _sesion_horas_inactividad() -> int:
    return config("CHAT_SESION_HORAS", default=4, cast=int)


def tipo_usuario_desde_sesion(sesion: dict) -> str:
    return _TIPO_ADMIN if sesion.get("rol") == "admin" else _TIPO_CLIENTE


def _mensajes_por_sesion(sesion_id: str) -> list[Mensaje]:
    return [m for m in list(Mensaje.select()) if m.sesion_id == sesion_id]


def _ultimo_mensaje_usuario(usuario_id: int, tipo_usuario: str) -> Mensaje | None:
    candidatos = [
        m
        for m in list(Mensaje.select())
        if m.usuario_id == usuario_id and m.tipo_usuario == tipo_usuario
    ]
    if not candidatos:
        return None
    return max(candidatos, key=lambda m: m.creado_en)


@db_session
def obtener_o_crear_sesion_id(usuario_id: int, tipo_usuario: str) -> str:
    ultimo = _ultimo_mensaje_usuario(usuario_id, tipo_usuario)
    if ultimo is not None:
        limite = datetime.utcnow() - timedelta(hours=_sesion_horas_inactividad())
        if ultimo.creado_en >= limite:
            return ultimo.sesion_id

    return str(uuid.uuid4())


@db_session
def cargar_historial(sesion_id: str, limite: int | None = None) -> list[dict]:
    if limite is None:
        limite = _historial_max()

    mensajes = sorted(_mensajes_por_sesion(sesion_id), key=lambda m: m.creado_en)
    recientes = mensajes[-limite:]
    return [
        {"rol": mensaje.rol, "contenido": mensaje.contenido}
        for mensaje in recientes
    ]


@db_session
def guardar_mensaje(
    *,
    sesion_id: str,
    usuario_id: int,
    tipo_usuario: str,
    rol: str,
    contenido: str,
) -> None:
    Mensaje(
        sesion_id=sesion_id,
        usuario_id=usuario_id,
        tipo_usuario=tipo_usuario,
        rol=rol,
        contenido=contenido,
    )
    commit()


@db_session
def contar_mensajes_sesion(sesion_id: str) -> int:
    return len(_mensajes_por_sesion(sesion_id))
