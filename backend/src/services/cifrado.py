"""Cifrado de secretos guardados en la base (por ahora, la API key de Fathom de cada coach).

La clave sale de CLAVE_CIFRADO en el .env; si no está, se deriva de la contraseña de la base, que
solo vive en el servidor. Cambiar cualquiera de las dos invalida lo cifrado: hay que volver a conectar.
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from decouple import config


def _fernet() -> Fernet:
    secreto = config("CLAVE_CIFRADO", default="").strip() or "atv-classroom:" + config("DB_PASSWORD", default="")
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secreto.encode("utf-8")).digest()))


def cifrar(texto: str) -> str:
    return _fernet().encrypt(texto.encode("utf-8")).decode("utf-8")


def descifrar(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None
