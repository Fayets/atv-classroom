"""Buscador de SOPs de la Guía ATV.

Cuando el cliente no cuenta un problema sino que busca un SOP ("guion de cierre", "SOP de onboarding"),
la guía le lista los que hay (clases del classroom con su documento y lecciones que siguen en Skool).
Si no hay ninguno, el front le ofrece pedirlo.

A Haiku se le pide solo qué números de la lista cerrada son ese SOP; el código valida cada número.
Sin IA (o si falla), se ordena por las palabras que comparten la búsqueda y el título."""

import json
import logging
import re
import unicodedata

from anthropic import APIConnectionError, APIStatusError, APITimeoutError, AsyncAnthropic
from decouple import config
from pony.orm import db_session

from src.models import Clase
from src.services import sops_service
from src.services.bloqueos import programa_bloqueado

logger = logging.getLogger(__name__)

_MODEL = config("GUIA_MODEL", default="claude-haiku-4-5")
_TIMEOUT_SEGUNDOS = 20
MAX_SOPS = 6

# Palabras que dicen "busco un documento", no "me pasa algo".
_PIDE_SOP = re.compile(
    r"\b(sops?|plantillas?|templates?|guion(es)?|scripts?|checklists?|formatos?|procedimientos?|protocolos?|"
    r"manual(es)?|paso a paso|busco|buscar|necesito el|necesito la|tenes|tienen|hay algun[oa]?|donde esta)\b"
)
# Palabras de alguien que cuenta lo que le pasa: con estas, una frase corta es un problema, no una búsqueda.
_CUENTA_PROBLEMA = re.compile(
    r"\b(no|me|nos|mi|mis|tengo|tenemos|estoy|estamos|cuesta|puedo|podemos|depende|dicen|pasa|falta|faltan|"
    r"quiero|porque|nadie|nunca|siempre|pierdo|perdemos)\b"
)
# Lo que no aporta al comparar títulos.
_VACIAS = {
    "sop", "sops", "de", "del", "la", "el", "los", "las", "un", "una", "para", "con", "y", "o", "en", "a", "al",
    "mi", "tu", "que", "como", "busco", "buscar", "necesito", "tenes", "tienen", "hay", "algun", "alguno", "alguna",
    "plantilla", "plantillas", "template", "documento", "clase", "por", "donde", "esta",
}


def _norm(texto: str) -> str:
    t = "".join(c for c in unicodedata.normalize("NFD", (texto or "").lower()) if unicodedata.category(c) != "Mn")
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", t).split())


def parece_busqueda(texto: str) -> bool:
    """¿Busca un SOP o cuenta un problema? Una palabra de documento manda; si no, una frase corta sin
    nada de "me pasa" ("VSL de chat", "onboarding de clientes") también es una búsqueda."""
    q = _norm(texto)
    if _PIDE_SOP.search(q):
        return True
    palabras = q.split()
    return 0 < len(palabras) <= 4 and not _CUENTA_PROBLEMA.search(q)


def _raiz(palabra: str) -> str:
    # "ventas" y "venta", "llamadas" y "llamada": alcanza con cortar el plural para comparar.
    return palabra[:-2] if palabra.endswith("es") and len(palabra) > 5 else palabra[:-1] if palabra.endswith("s") and len(palabra) > 4 else palabra


def _claves(texto: str) -> set[str]:
    return {_raiz(p) for p in _norm(texto).split() if p not in _VACIAS and len(p) > 2}


def por_palabras(texto: str) -> list[int]:
    """Respaldo sin IA: los SOPs que más palabras comparten con la búsqueda (el título pesa el doble)."""
    buscadas = _claves(texto)
    if not buscadas:
        return []
    puntajes = []
    for c in sops_service.catalogo():
        en_titulo = len(buscadas & _claves(c["titulo"]))
        en_resto = len(buscadas & _claves(f"{c['documentos']} {c['modulo']}"))
        puntos = en_titulo * 2 + en_resto
        if en_titulo:
            puntajes.append((puntos, c["id"]))
    puntajes.sort(key=lambda x: -x[0])
    return [cid for _, cid in puntajes[:MAX_SOPS]]


_TOOL = {
    "name": "elegir_sops",
    "description": "Registra qué SOPs de la lista son lo que busca el cliente.",
    "input_schema": {
        "type": "object",
        "properties": {
            "numeros": {
                "type": "array",
                "maxItems": MAX_SOPS,
                "items": {"type": "integer"},
                "description": "Números de la lista, el más exacto primero. Vacía si ninguno es lo que busca.",
            }
        },
        "required": ["numeros"],
        "additionalProperties": False,
    },
}


def _system() -> list[dict]:
    texto = (
        "El cliente de ATV escribió en el buscador del classroom. Busca un SOP (un documento o una clase con su "
        "plantilla). Elegí de la lista los que son eso que busca o lo cubren directamente, el más exacto primero.\n"
        "- Solo números de la lista.\n"
        "- No agregues SOPs de temas vecinos para completar: si busca 'guion de cierre', no van los de anuncios.\n"
        "- Si ninguno es lo que busca, devolvé la lista vacía.\n\n"
        "Lista ([número] título (módulo)):\n" + sops_service.para_prompt()
    )
    return [{"type": "text", "text": texto, "cache_control": {"type": "ephemeral", "ttl": "1h"}}]


async def _por_ia(texto: str) -> list[int] | None:
    api_key = config("ANTHROPIC_API_KEY", default=None)
    if not api_key:
        return None
    try:
        client = AsyncAnthropic(api_key=api_key, timeout=_TIMEOUT_SEGUNDOS)
        message = await client.messages.create(
            model=_MODEL,
            max_tokens=200,
            system=_system(),
            tools=[_TOOL],
            tool_choice={"type": "tool", "name": "elegir_sops"},
            messages=[{"role": "user", "content": texto}],
        )
    except (APITimeoutError, APIConnectionError, APIStatusError) as exc:
        logger.warning("Buscador de SOPs: la IA no respondió (%s); uso palabras", type(exc).__name__)
        return None
    for bloque in message.content:
        if bloque.type == "tool_use" and bloque.name == "elegir_sops":
            numeros = bloque.input.get("numeros") if isinstance(bloque.input, dict) else None
            if isinstance(numeros, str):
                try:
                    numeros = json.loads(numeros)
                except ValueError:
                    numeros = None
            if isinstance(numeros, list):
                return [n for n in numeros if isinstance(n, int)]
    return None


def _armar(ids: list[int], tarjeta) -> list[dict]:
    """Cada número validado contra el catálogo. Las del classroom van como tarjeta de clase (con sus
    documentos); las de módulos que el cliente no tiene habilitados no se muestran."""
    sops, vistos = [], set()
    with db_session:
        for cid in ids:
            item = sops_service.por_id(cid)
            if item is None or cid in vistos:
                continue
            vistos.add(cid)
            if item["fuente"] == "skool":
                sops.append({"clase_id": None, "titulo": item["titulo"], "modulo": "Skool", "seccion": None,
                             "programa_id": None, "recursos": [], "cubre": None, "resumen": None, "coach": None,
                             "url": item["url"], "fuente": "skool"})
            else:
                clase = Clase.get(id=cid)
                if clase is None or programa_bloqueado(clase.seccion.programa):
                    continue
                sops.append({**tarjeta(clase, None), "fuente": "classroom"})
            if len(sops) == MAX_SOPS:
                break
    return sops


async def buscar(texto: str, tarjeta) -> dict:
    ia = await _por_ia(texto)
    try:
        sops = _armar(ia if ia is not None else por_palabras(texto), tarjeta)
    except Exception:
        logger.exception("Buscador de SOPs: no se pudo armar la respuesta; uso palabras")
        ia, sops = None, _armar(por_palabras(texto), tarjeta)
    coach = next((s["coach"] for s in sops if s.get("coach")), None)
    return {"modo": "sops", "sops": sops, "recomendaciones": [], "coach": coach, "frente": None,
            "fuente": "ia" if ia is not None else "palabras"}
