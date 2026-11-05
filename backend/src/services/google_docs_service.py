"""Crea Google Docs desde el classroom (el diagnóstico de cuello de botella sale como link).

Usa la cuenta de Google de ATV con un permiso que se autoriza una sola vez (scripts/google_docs_autorizar.py): el
Doc queda en su Drive y se comparte como "cualquiera con el link puede ver". Sin las tres variables no hace nada y
el diagnóstico sale en PDF, como siempre. El permiso drive.file solo alcanza a los archivos que crea el classroom."""

import json
import uuid

import requests
from decouple import config
from fastapi import HTTPException

TOKEN_URL = "https://oauth2.googleapis.com/token"
SUBIR_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink"
PERMISOS_URL = "https://www.googleapis.com/drive/v3/files/{id}/permissions"


def _credenciales() -> tuple[str, str, str]:
    return (config("GOOGLE_DOCS_CLIENT_ID", default=""), config("GOOGLE_DOCS_CLIENT_SECRET", default=""),
            config("GOOGLE_DOCS_REFRESH_TOKEN", default=""))


def activo() -> bool:
    return all(_credenciales())


def _acceso() -> str:
    cliente, secreto, refresh = _credenciales()
    r = requests.post(TOKEN_URL, data={"client_id": cliente, "client_secret": secreto, "refresh_token": refresh, "grant_type": "refresh_token"}, timeout=20)
    if not r.ok:
        raise HTTPException(status_code=502, detail="Google no dio acceso: hay que volver a autorizar la cuenta.")
    return r.json()["access_token"]


def cuerpo_multipart(titulo: str, html: str) -> tuple[bytes, str]:
    """El pedido a Drive: los datos del archivo y el HTML, que Google convierte en un Doc."""
    corte = uuid.uuid4().hex
    datos = json.dumps({"name": titulo, "mimeType": "application/vnd.google-apps.document"}, ensure_ascii=False)
    cuerpo = (
        f"--{corte}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{datos}\r\n"
        f"--{corte}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n{html}\r\n--{corte}--\r\n"
    )
    return cuerpo.encode("utf-8"), f"multipart/related; boundary={corte}"


def crear(titulo: str, html: str) -> str:
    """Crea el Doc, lo comparte por link y devuelve la dirección."""
    if not activo():
        raise HTTPException(status_code=409, detail="Falta conectar la cuenta de Google.")
    cabecera = {"Authorization": f"Bearer {_acceso()}"}
    cuerpo, tipo = cuerpo_multipart(titulo, html)
    r = requests.post(SUBIR_URL, data=cuerpo, headers={**cabecera, "Content-Type": tipo}, timeout=60)
    if not r.ok:
        raise HTTPException(status_code=502, detail="Google no pudo crear el documento.")
    doc = r.json()
    p = requests.post(PERMISOS_URL.format(id=doc["id"]), json={"role": "reader", "type": "anyone"}, headers=cabecera, timeout=20)
    if not p.ok:
        raise HTTPException(status_code=502, detail="Se creó el documento pero no se pudo compartir.")
    return doc["webViewLink"]
