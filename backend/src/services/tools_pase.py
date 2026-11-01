"""El pase con el que un cliente salta del classroom al proyecto de agentes (tools.atvos.io) sin volver a
loguearse. Es un JSON firmado con HMAC-SHA256 y la clave compartida TOOLS_PASE_SECRET; vence en 60 segundos.

El proyecto de agentes lo valida con `verificar` (copiar esta función tal cual) y anota el `jti` para que el
mismo pase no sirva dos veces. La contraseña del cliente nunca viaja."""

import base64
import hashlib
import hmac
import json
import secrets
import time

VIGENCIA = 60


def _b64(datos: bytes) -> str:
    return base64.urlsafe_b64encode(datos).rstrip(b"=").decode()


def _desb64(texto: str) -> bytes:
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def firmar(datos: dict, clave: str, ahora: float | None = None) -> str:
    ahora = time.time() if ahora is None else ahora
    cuerpo = _b64(json.dumps({**datos, "exp": int(ahora) + VIGENCIA, "jti": secrets.token_hex(12)}, separators=(",", ":")).encode())
    firma = _b64(hmac.new(clave.encode(), cuerpo.encode(), hashlib.sha256).digest())
    return f"{cuerpo}.{firma}"


def verificar(pase: str, clave: str, ahora: float | None = None) -> dict | None:
    """Los datos del pase, o None si la firma no coincide o ya venció."""
    try:
        cuerpo, firma = pase.split(".")
        esperada = _b64(hmac.new(clave.encode(), cuerpo.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(firma, esperada):
            return None
        datos = json.loads(_desb64(cuerpo))
    except (ValueError, json.JSONDecodeError):
        return None
    ahora = time.time() if ahora is None else ahora
    return datos if datos.get("exp", 0) >= ahora else None
