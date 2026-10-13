"""Archivos adjuntos de la mensajería.

No van en uploads/ (esa carpeta se sirve pública): van en ADJUNTOS_DIR y se bajan por
/api/mensajes/adjuntos/{id}?f=<vence>.<firma>, un link firmado que vence a las 24 h."""

import hashlib
import hmac
import time
import uuid
from pathlib import Path

from decouple import config

BACKEND_ROOT = Path(__file__).resolve().parents[2]
ADJUNTOS_DIR = Path(config("ADJUNTOS_DIR", default=str(BACKEND_ROOT / "adjuntos")))
MAX_BYTES = 25 * 1024 * 1024
VIGENCIA_LINK = 24 * 3600

# Solo tipos seguros, decididos por la extensión (nunca por lo que diga el navegador).
# Fuera: html, svg, js y ejecutables, que podrían correr código al abrirse.
TIPOS = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp",
    "heic": "image/heic",
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "ppt": "application/vnd.ms-powerpoint",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "csv": "text/csv", "txt": "text/plain",
    "mp3": "audio/mpeg", "m4a": "audio/mp4", "ogg": "audio/ogg", "wav": "audio/wav", "webm": "audio/webm",
    "mp4": "video/mp4", "mov": "video/quicktime",
    "zip": "application/zip",
}
# Se abren en el navegador; el resto se descarga.
EN_LINEA = ("image/", "application/pdf", "audio/", "video/")


def _clave() -> bytes:
    secreto = config("ADJUNTOS_SECRET", default="") or config("TOKEN_SECRET", default="") or config("DB_PASSWORD")
    return hashlib.sha256(f"adjuntos:{secreto}".encode()).digest()


def extension(nombre: str) -> str:
    return nombre.rsplit(".", 1)[-1].lower() if "." in nombre else ""


def tipo_permitido(nombre: str) -> str | None:
    return TIPOS.get(extension(nombre))


def nombre_seguro(nombre: str) -> str:
    limpio = "".join(c for c in Path(nombre).name if c.isprintable() and c not in '\\/:*?"<>|').strip()
    return (limpio or "archivo")[:160]


def nuevo_archivo(canal_id: int, nombre: str) -> tuple[str, Path]:
    relativo = f"{canal_id}/{uuid.uuid4().hex}.{extension(nombre)}"
    ruta = ADJUNTOS_DIR / relativo
    ruta.parent.mkdir(parents=True, exist_ok=True)
    return relativo, ruta


def ruta_de(relativo: str) -> Path | None:
    ruta = (ADJUNTOS_DIR / relativo).resolve()
    return ruta if str(ruta).startswith(str(ADJUNTOS_DIR.resolve())) and ruta.is_file() else None


def firmar(adjunto_id: int) -> str:
    vence = int(time.time()) + VIGENCIA_LINK
    firma = hmac.new(_clave(), f"{adjunto_id}.{vence}".encode(), hashlib.sha256).hexdigest()[:32]
    return f"/api/mensajes/adjuntos/{adjunto_id}?f={vence}.{firma}"


def firma_valida(adjunto_id: int, f: str) -> bool:
    try:
        vence_txt, firma = f.split(".", 1)
        vence = int(vence_txt)
    except (ValueError, AttributeError):
        return False
    if vence < time.time():
        return False
    esperada = hmac.new(_clave(), f"{adjunto_id}.{vence}".encode(), hashlib.sha256).hexdigest()[:32]
    return hmac.compare_digest(esperada, firma)
