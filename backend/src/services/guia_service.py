"""Guía ATV: no responde dudas. Lee lo que le pasa al cliente y le recomienda qué clases
(videos) y SOPs del classroom lo resuelven, y si hay un frente de trabajo que encaja.

A Haiku se le piden datos, no respuestas: ids de clases del catálogo y el fragmento
textual del mensaje que cada una cubre. El código valida los ids, arma las tarjetas con
los datos reales de la base y decide si deriva al coach cuando no queda nada."""

import logging
import unicodedata

from anthropic import APIConnectionError, APIStatusError, APITimeoutError, AsyncAnthropic
from decouple import config
from pony.orm import db_session

from src.models import Clase
from src.services.frente_service import BRIEFS, CATALOGO, PROBLEMAS
from src.utils.clase_content import serializar_recursos

logger = logging.getLogger(__name__)

_MODEL = config("GUIA_MODEL", default="claude-haiku-4-5")
_TIMEOUT_SEGUNDOS = 25
_MAX_RECOMENDACIONES = 4
_SLUGS = [p["slug"] for p in CATALOGO["problemas"]]

_catalogo_texto: str | None = None


def _normalizar(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn")


def _clases_publicadas() -> list[Clase]:
    clases = []
    for clase in Clase.select()[:]:
        if clase.titulo and clase.titulo.strip().lower() != "próximamente":
            clases.append(clase)
    clases.sort(key=lambda c: (c.seccion.programa.orden, c.seccion.orden, c.orden))
    return clases


def _catalogo() -> str:
    """Una línea por clase: id, módulo › sección › título y, si hay transcript, sus claves."""
    global _catalogo_texto
    if _catalogo_texto is None:
        lineas = []
        with db_session:
            for c in _clases_publicadas():
                linea = f"{c.id} | {c.seccion.programa.titulo} › {c.seccion.titulo} › {c.titulo}"
                brief = BRIEFS.get(str(c.id))
                if brief and brief["claves"]:
                    linea += " | trata: " + "; ".join(brief["claves"][:4])
                if c.recursos.count():
                    linea += " | trae plantilla"
                lineas.append(linea)
        _catalogo_texto = "\n".join(lineas)
    return _catalogo_texto


def _system() -> list[dict]:
    frentes = "\n".join(f"- {p['slug']}: {p['titulo']}" for p in CATALOGO["problemas"])
    texto = (
        "Sos la Guía ATV, dentro del classroom de ATV para dueños de negocio. "
        "El cliente te cuenta algo que le pasa en su negocio. No respondés su duda ni das consejos: "
        "elegís qué clases del catálogo lo resuelven, para que las mire y aplique su SOP.\n\n"
        "Reglas:\n"
        f"- Recomendá entre 1 y {_MAX_RECOMENDACIONES} clases, las más directas primero. Solo ids que estén en el catálogo.\n"
        "- En 'cubre' copiá textual el fragmento del mensaje del cliente que esa clase ataca.\n"
        "- Si ninguna clase trata de verdad lo que pregunta (impuestos, temas legales, algo personal, algo que ATV no enseña), devolvé la lista vacía.\n"
        "- 'frente' es el problema de la lista que coincide con lo que cuenta, o 'ninguno'.\n\n"
        f"Frentes de trabajo:\n{frentes}\n\n"
        "Catálogo de clases (id | módulo › sección › título | temas):\n" + _catalogo()
    )
    return [{"type": "text", "text": texto, "cache_control": {"type": "ephemeral"}}]


_TOOL = {
    "name": "recomendar",
    "description": "Registra las clases del catálogo que resuelven lo que cuenta el cliente.",
    "input_schema": {
        "type": "object",
        "properties": {
            "recomendaciones": {
                "type": "array",
                "maxItems": _MAX_RECOMENDACIONES,
                "items": {
                    "type": "object",
                    "properties": {
                        "clase_id": {"type": "integer"},
                        "cubre": {"type": "string", "description": "Fragmento textual del mensaje del cliente que esta clase ataca."},
                    },
                    "required": ["clase_id", "cubre"],
                    "additionalProperties": False,
                },
            },
            "frente": {"type": "string", "enum": [*_SLUGS, "ninguno"]},
        },
        "required": ["recomendaciones", "frente"],
        "additionalProperties": False,
    },
}


def por_palabras(texto: str) -> str | None:
    """Respaldo sin IA: el frente con más señales presentes en el texto."""
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


async def _por_ia(texto: str) -> dict | None:
    api_key = config("ANTHROPIC_API_KEY", default=None)
    if not api_key:
        return None
    client = AsyncAnthropic(api_key=api_key, timeout=_TIMEOUT_SEGUNDOS)
    try:
        message = await client.messages.create(
            model=_MODEL,
            max_tokens=600,
            system=_system(),
            tools=[_TOOL],
            tool_choice={"type": "tool", "name": "recomendar"},
            messages=[{"role": "user", "content": texto}],
        )
    except (APITimeoutError, APIConnectionError, APIStatusError) as exc:
        logger.warning("Guía ATV: la IA no respondió (%s); uso palabras clave", type(exc).__name__)
        return None
    for bloque in message.content:
        if bloque.type == "tool_use" and bloque.name == "recomendar":
            return bloque.input if isinstance(bloque.input, dict) else None
    return None


def _tarjeta(clase: Clase, cubre: str | None) -> dict:
    brief = BRIEFS.get(str(clase.id))
    return {
        "clase_id": clase.id,
        "titulo": clase.titulo,
        "modulo": clase.seccion.programa.titulo,
        "seccion": clase.seccion.titulo,
        "programa_id": clase.seccion.programa.id,
        "recursos": serializar_recursos(clase),
        "cubre": cubre,
        "resumen": brief["resumen"] if brief else None,
    }


async def recomendar(texto: str) -> dict:
    texto = texto.strip()
    q = _normalizar(texto)
    ia = await _por_ia(texto)

    recomendaciones: list[dict] = []
    frente: str | None = None
    fuente = "palabras"

    with db_session:
        if ia is not None:
            fuente = "ia"
            vistos = set()
            for rec in ia.get("recomendaciones") or []:
                clase_id = rec.get("clase_id")
                clase = Clase.get(id=clase_id) if isinstance(clase_id, int) else None
                if clase is None or clase_id in vistos:
                    continue
                vistos.add(clase_id)
                cubre = str(rec.get("cubre") or "").strip()
                # La cita solo se muestra si de verdad está en el mensaje del cliente.
                recomendaciones.append(_tarjeta(clase, cubre if cubre and _normalizar(cubre) in q else None))
                if len(recomendaciones) == _MAX_RECOMENDACIONES:
                    break
            slug = ia.get("frente")
            frente = slug if slug in _SLUGS and recomendaciones else None
        else:
            frente = por_palabras(texto)
            if frente:
                for clase_id in PROBLEMAS[frente]["resolver"]:
                    clase = Clase.get(id=clase_id)
                    if clase:
                        recomendaciones.append(_tarjeta(clase, None))

    return {
        "recomendaciones": recomendaciones,
        "frente": {"slug": frente, "titulo": PROBLEMAS[frente]["titulo"]} if frente else None,
        "fuente": fuente,
    }
