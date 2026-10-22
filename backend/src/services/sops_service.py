"""SOPs del classroom para los entregables del roadmap.

Los coaches mandaban los SOPs como links de Skool ("Capas de negocio: https://www.skool.com/…").
Ese material ya está en el classroom: cada clase, con sus documentos. Acá se arma el catálogo que ve la
IA al armar el roadmap (una lista cerrada, por número) y el link directo a cada clase.
"""

import re
import time
import unicodedata
from difflib import SequenceMatcher

from decouple import config
from pony.orm import db_session

from src.db import DB_SCHEMA, db

CLASSROOM_URL = config("CLASSROOM_URL", default="https://classroom.atvos.io").rstrip("/")
_cache: dict = {"en": 0.0, "clases": []}


def _norm(t: str) -> str:
    t = "".join(c for c in unicodedata.normalize("NFD", (t or "").lower()) if unicodedata.category(c) != "Mn")
    t = re.sub(r"^[\s\-–•*\d.)]+", "", t)  # "7 - Crear…", "3. Proceso…"
    t = re.sub(r"\b(sop|clase|plantilla|entregable|documento|link|de la|del)\b", " ", t)
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", t).split())


def catalogo() -> list[dict]:
    """Las clases con contenido (sin las "Próximamente"), con su módulo, sus documentos y el link."""
    if time.time() - _cache["en"] < 600 and _cache["clases"]:
        return _cache["clases"]
    with db_session:
        filas = db.select(
            f'SELECT c.id, c.titulo, p.id, p.titulo, '
            f'(SELECT string_agg(r.titulo, \' · \' ORDER BY r.orden) FROM "{DB_SCHEMA}"."clase_recurso" r WHERE r.clase = c.id) '
            f'FROM "{DB_SCHEMA}"."clase" c JOIN "{DB_SCHEMA}"."seccion" s ON s.id = c.seccion '
            f'JOIN "{DB_SCHEMA}"."programa" p ON p.id = s.programa '
            # sin las "Próximamente" ni las vacías (sin video ni documentos): no se manda un link a nada
            f"WHERE c.titulo NOT ILIKE 'próximamente%' AND (coalesce(c.video_url, '') <> '' "
            f'OR EXISTS (SELECT 1 FROM "{DB_SCHEMA}"."clase_recurso" r2 WHERE r2.clase = c.id)) '
            f"ORDER BY p.orden, s.orden, c.orden"
        )
    clases = [
        {"id": cid, "titulo": " ".join(titulo.split()), "modulo": modulo, "documentos": docs or "",
         "url": f"{CLASSROOM_URL}/classroom/{pid}?clase={cid}"}
        for cid, titulo, pid, modulo, docs in filas
    ]
    _cache.update(en=time.time(), clases=clases)
    return clases


def para_prompt() -> str:
    return "\n".join(f"[{c['id']}] {c['titulo'].capitalize()} ({c['modulo']})" for c in catalogo())


def por_id(clase_id) -> dict | None:
    try:
        clase_id = int(clase_id)
    except (TypeError, ValueError):
        return None
    return next((c for c in catalogo() if c["id"] == clase_id), None)


def por_titulo(titulo: str, minimo: float = 0.86) -> dict | None:
    """Si la IA nombró un SOP sin decir cuál es, el que tenga el título casi igual (o contenido entero)."""
    buscado = _norm(titulo)
    if len(buscado) < 5:
        return None
    mejor, puntaje = None, 0.0
    for c in catalogo():
        nt = _norm(c["titulo"])
        p = SequenceMatcher(None, buscado, nt).ratio()
        if len(nt) >= 8 and nt in buscado:  # el título entero de la clase está en lo pedido (no al revés:
            p = max(p, 0.9)                  # "avatar" solo caía en cualquier clase con esa palabra)
        if p > puntaje:
            mejor, puntaje = c, p
    return mejor if puntaje >= minimo else None
