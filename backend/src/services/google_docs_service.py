"""Crea Google Docs desde el classroom (el diagnóstico de cuello de botella sale como link).

Lo hace un Apps Script publicado en la cuenta de Google de ATV ("ATV Classroom - Google Docs"): recibe el título y
el HTML, crea el Doc en su Drive, lo comparte como "cualquiera con el link puede ver" y devuelve la dirección. Solo
puede tocar los archivos que crea él. La dirección del script es larga e imposible de adivinar: vive solo en
GOOGLE_DOCS_URL. Sin esa variable no hace nada y el diagnóstico sale en PDF, como siempre."""

import requests
from decouple import config
from fastapi import HTTPException


def _url() -> str:
    return config("GOOGLE_DOCS_URL", default="").strip()


def activo() -> bool:
    return bool(_url())


def crear(titulo: str, html: str, editor: str | None = None) -> str:
    """Crea el Doc y devuelve la dirección para compartir. editor: el mail de quien lo va a corregir antes de mandarlo."""
    if not activo():
        raise HTTPException(status_code=409, detail="Falta conectar la cuenta de Google.")
    try:
        r = requests.post(_url(), json={"titulo": titulo, "html": html, "editor": editor}, timeout=90)
        url = r.json().get("url") if r.ok else None
    except (requests.RequestException, ValueError):
        url = None
    if not url:
        raise HTTPException(status_code=502, detail="Google no pudo crear el documento.")
    return url
