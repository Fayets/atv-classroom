"""Guía ATV: no responde dudas. Elige qué frente del catálogo describe el problema
del cliente, o ninguno. A Haiku se le piden datos (qué problema y con qué frase del
cliente lo sostiene); la decisión de abrir un frente o derivar al coach la toma el código."""

import logging
import unicodedata

from anthropic import APIConnectionError, APIStatusError, APITimeoutError, AsyncAnthropic
from decouple import config

from src.services.frente_service import CATALOGO

logger = logging.getLogger(__name__)

_MODEL = config("GUIA_MODEL", default="claude-haiku-4-5")
_TIMEOUT_SEGUNDOS = 20
_SLUGS = [p["slug"] for p in CATALOGO["problemas"]]

_SYSTEM = (
    "Sos el clasificador de la Guía ATV. Un dueño de negocio describe algo que lo traba. "
    "Tu único trabajo es decir cuál de estos problemas describe, o 'ninguno' si ninguno encaja de verdad. "
    "No respondas su duda ni des consejos.\n\n"
    "Problemas:\n"
    + "\n".join(f"- {p['slug']}: {p['titulo']}. {p['sintoma']}" for p in CATALOGO["problemas"])
)

_TOOL = {
    "name": "elegir_problema",
    "description": "Registra qué problema del catálogo describe el mensaje del cliente.",
    "input_schema": {
        "type": "object",
        "properties": {
            "slug": {"type": "string", "enum": [*_SLUGS, "ninguno"]},
            "frase_del_cliente": {
                "type": "string",
                "description": "Fragmento textual del mensaje del cliente que muestra ese problema. Vacío si elegiste 'ninguno'.",
            },
        },
        "required": ["slug", "frase_del_cliente"],
        "additionalProperties": False,
    },
}


def _normalizar(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn")


def por_palabras(texto: str) -> str | None:
    """Respaldo sin IA: el problema con más señales presentes en el texto."""
    q = _normalizar(texto)
    mejor, puntos = None, 0
    for p in CATALOGO["problemas"]:
        s = 0
        for senal in p["senales"]:
            if _normalizar(senal) in q:
                s += 2 if len(senal) > 6 else 1
        if s > puntos:
            mejor, puntos = p["slug"], s
    return mejor


async def _por_ia(texto: str) -> tuple[str, str] | None:
    api_key = config("ANTHROPIC_API_KEY", default=None)
    if not api_key:
        return None
    client = AsyncAnthropic(api_key=api_key, timeout=_TIMEOUT_SEGUNDOS)
    try:
        message = await client.messages.create(
            model=_MODEL,
            max_tokens=256,
            system=_SYSTEM,
            tools=[_TOOL],
            tool_choice={"type": "tool", "name": "elegir_problema"},
            messages=[{"role": "user", "content": texto}],
        )
    except (APITimeoutError, APIConnectionError, APIStatusError) as exc:
        logger.warning("Guía ATV: la IA no respondió (%s); uso palabras clave", type(exc).__name__)
        return None
    for bloque in message.content:
        if bloque.type == "tool_use" and bloque.name == "elegir_problema":
            datos = bloque.input if isinstance(bloque.input, dict) else {}
            return str(datos.get("slug", "")), str(datos.get("frase_del_cliente", ""))
    return None


async def elegir_frente(texto: str) -> dict:
    texto = texto.strip()
    ia = await _por_ia(texto)
    if ia is not None:
        slug, frase = ia
        # Se acepta solo si el slug existe y la frase citada está de verdad en el mensaje.
        if slug in _SLUGS and frase.strip() and _normalizar(frase.strip()) in _normalizar(texto):
            return {"slug": slug, "fuente": "ia"}
        if slug == "ninguno":
            return {"slug": None, "fuente": "ia"}
    return {"slug": por_palabras(texto), "fuente": "palabras"}
