"""Freno a quien intenta adivinar contraseñas: la clave es el canal de Discord, así que se puede
adivinar si no se limita. Cuenta los intentos fallidos por mail y por IP en memoria."""

import time
from threading import Lock

from fastapi import HTTPException, Request

MAX_FALLOS_MAIL = 5  # por cuenta
MAX_FALLOS_IP = 20  # por IP, contra cualquier cuenta
VENTANA = 15 * 60  # segundos

_fallos: dict[str, list[float]] = {}
_lock = Lock()


def ip_de(request: Request) -> str:
    # nginx pone la IP real en X-Real-IP; si no pasa por nginx, la de la conexión.
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "?")


def _recientes(clave: str, ahora: float) -> list[float]:
    lista = [t for t in _fallos.get(clave, []) if ahora - t < VENTANA]
    if lista:
        _fallos[clave] = lista
    else:
        _fallos.pop(clave, None)
    return lista


def verificar(email: str, ip: str) -> None:
    ahora = time.time()
    with _lock:
        if len(_recientes(f"m:{email}", ahora)) >= MAX_FALLOS_MAIL or len(_recientes(f"i:{ip}", ahora)) >= MAX_FALLOS_IP:
            raise HTTPException(status_code=429, detail="Demasiados intentos. Probá de nuevo en 15 minutos.")


def registrar_fallo(email: str, ip: str) -> None:
    ahora = time.time()
    with _lock:
        for clave in (f"m:{email}", f"i:{ip}"):
            _fallos.setdefault(clave, []).append(ahora)


def limpiar(email: str) -> None:
    with _lock:
        _fallos.pop(f"m:{email}", None)
