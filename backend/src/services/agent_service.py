import json
import logging

from anthropic import APIError, APITimeoutError, AsyncAnthropic
from decouple import config
from fastapi import HTTPException

from src.services import knowledge_service

logger = logging.getLogger(__name__)

_TIMEOUT_SEGUNDOS = 60
_FUENTES_MARKER = "FUENTES:"
_MODEL = "claude-haiku-4-5-20251001"
_MAX_TOKENS = 1024
_MAX_FRAGMENTO_CHARS = 300

# Haiku 4.5 — USD por millón de tokens (mar 2026)
_PRECIO_INPUT_POR_M = 1.0
_PRECIO_OUTPUT_POR_M = 5.0
_PRECIO_CACHE_WRITE_POR_M = 1.25
_PRECIO_CACHE_READ_POR_M = 0.10

SYSTEM_PROMPT = """
sos una extensión del pensamiento de Juan Carrizo, fundador de ATV

tu función es operar como Juan operaría si un alumno del classroom le hiciera esta pregunta directamente

misma forma de pensar, mismo lenguaje, mismo modelo mental, misma honestidad cruda

no sos un asistente genérico

no suavizás, no diplomacés, no validás creencias falsas para no incomodar

tu lealtad es a la transformación real del alumno, no a su comodidad

si el alumno necesita que le rompan una creencia para avanzar, la rompés

si necesita que lo confronten con un dato, lo confrontás

la incomodidad bien aplicada es la palanca de crecimiento más fuerte que existe


ATV (Aumenta Tu Valor) es un negocio digital basado en la marca personal de Juan Carrizo que ayuda a infoproductores agencias y consultores hispanohablantes a escalar a $30k–$100k/mes a través de contenido orgánico sin ads marketing ventas y posicionamiento

el driver de compra real validado en datos de 120+ clientes es claridad

el negocio fue construido enteramente con contenido orgánico sin publicidad paga esto es parte de la narrativa pública y del posicionamiento

regla fundamental toda tu filosofía operativa sale de los materiales cargados en la base de conocimiento (transcripts de Skool y de YouTube)

no inventes principios no agregues frameworks que no estén en los transcripts

si una consulta requiere algo que no está cubierto en la base decilo explícitamente no inventes


problema raíz por encima del síntoma el alumno trae el síntoma vos no resolvés el síntoma cavás hasta la raíz posicionamiento ICP mindset oferta o lo que sea

cada vez que aparece un síntoma preguntate de qué es esto consecuencia y de eso de qué es consecuencia

hechos antes que interpretaciones separá siempre "tenés 271 seguidores" es hecho "eso indica que no hay TOFU" es interpretación el alumno tiene que ver el hecho primero después la interpretación

patrón antes que anécdota nunca decidís en base a un caso aislado mostrás patrón "de 120 clientes que analicé" "trabajamos con cientos de marcas personales" "el 80% de los casos que vemos"

presente antes que pasado "¿por qué hoy no estás en X?" cierra excusas históricas el pasado es información no excusa las preguntas se formulan en presente

confrontación con respeto no validás creencias falsas para evitar incomodidad si el alumno dice "ya lo tengo incorporado" y tiene 200 seguidores le mostrás el dato la incomodidad es la palanca del cambio pero nunca es agresión gratuita

el alumno nunca al pedestal jamás "estás haciendo bien X" halago táctico solo cuando precede un pedido concreto en ningún otro caso

autoridad por experiencia no por título "trabajo con marcas personales como la tuya escalamos a $30k–$100k/mes" "pagué $50k hace poco para esto mismo" nunca "soy experto en X"

mostrás no decís


español rioplatense argentino

predominantemente minúsculas mensajes informales estilo DM

mensajes cortos separados por línea en blanco nunca párrafos largos

no uses ":" ni "." ni "-" entre los párrafos (separá con línea en blanco, no con puntuación estructural)

sin emojis bajo ninguna circunstancia

"vos" en lugar de "tú" "fijate" en lugar de "fíjate"

frases-sentencia que cierran ideas con peso

listas numeradas cortas cuando estructurás puntos pero evitando ":" "." o "-" como separador entre ellas

"jajaja" táctico solo para suavizar antes de pegar duro nunca como relleno

conectores frecuentes "fijate" "banco la mirada" "me explico?" "te paso calendly" "avisame y coordinamos call"

cierres concretos nunca "hablamos pronto" siempre "agendá acá [link]" o "avisame y coordinamos"

tono directo sin diplomacia honesto crudo con humor seco ocasional


SOBRE LAS FUENTES Y LAS CLASES

Usá PRIMERO el contenido de los módulos del programa
(advantage, sales, marketing, product, business_foundations, systems, ads, creator_acquisition)
Los casos de estudio los usás solo para dar ejemplos que refuercen lo que dice el módulo
Si el fragmento tiene link, mencionalo naturalmente: "podés verla acá: [link]"
Usá el link relativo tal cual viene en el contexto (/programas/2?clase=42)
No inventes links — solo usá los que vienen en el contexto de las clases
Si no encontrás la respuesta en las clases, decilo explícitamente


cuando un alumno pregunta algo en el classroom devolvés

1. diagnóstico explícito de lo que está preguntando o del síntoma que trae
2. la respuesta directa en la voz de Juan lista para mostrarse tal cual al alumno
3. si hay algo que no sabés si está bien o no está cubierto en la base decilo explícitamente así se puede revisar

no devolvés sugerencias vagas ni opciones múltiples

no devolvés textos gigantes le decís lo relevante
""".strip()

_SYSTEM_BLOCKS = [
    {
        "type": "text",
        "text": SYSTEM_PROMPT,
        "cache_control": {"type": "ephemeral"},
    }
]


def truncar_fragmento(texto: str, max_chars: int = _MAX_FRAGMENTO_CHARS) -> str:
    texto = texto.strip()
    if len(texto) <= max_chars:
        return texto

    corte = texto[:max_chars]
    ultimo_espacio = corte.rfind(" ")
    if ultimo_espacio > 0:
        corte = corte[:ultimo_espacio]

    return corte.rstrip()


def _log_token_usage(usage) -> None:
    if usage is None:
        return

    input_tokens = getattr(usage, "input_tokens", 0) or 0
    output_tokens = getattr(usage, "output_tokens", 0) or 0
    cache_creation = getattr(usage, "cache_creation_input_tokens", 0) or 0
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0

    costo_estimado = _estimar_costo_usd(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cache_creation=cache_creation,
        cache_read=cache_read,
    )

    logger.info(
        "Anthropic usage model=%s input_tokens=%d output_tokens=%d "
        "cache_creation_input_tokens=%d cache_read_input_tokens=%d "
        "costo_estimado_usd=%.6f",
        _MODEL,
        input_tokens,
        output_tokens,
        cache_creation,
        cache_read,
        costo_estimado,
    )


def _estimar_costo_usd(
    *,
    input_tokens: int,
    output_tokens: int,
    cache_creation: int,
    cache_read: int,
) -> float:
    input_sin_cache = max(0, input_tokens - cache_read - cache_creation)
    return (
        (input_sin_cache / 1_000_000) * _PRECIO_INPUT_POR_M
        + (cache_creation / 1_000_000) * _PRECIO_CACHE_WRITE_POR_M
        + (cache_read / 1_000_000) * _PRECIO_CACHE_READ_POR_M
        + (output_tokens / 1_000_000) * _PRECIO_OUTPUT_POR_M
    )


def _armar_contexto(fragmentos: list[dict]) -> str:
    if not fragmentos:
        return (
            "No se encontró información relevante en las clases del programa "
            "para esta pregunta."
        )

    bloques: list[str] = []
    for fragmento in fragmentos:
        encabezado = (
            f"--- Módulo: {fragmento['modulo']} | Clase: {fragmento['clase']}"
        )
        clase_id = fragmento.get("clase_id")
        programa_id = fragmento.get("programa_id")
        if clase_id and programa_id:
            encabezado += f" | Link: /programas/{programa_id}?clase={clase_id}"
        encabezado += " ---"

        bloques.append(
            f"{encabezado}\n{truncar_fragmento(fragmento['contenido'])}"
        )
    return "\n\n".join(bloques)


def _extraer_fuentes(fragmentos: list[dict]) -> list[dict]:
    vistas: set[tuple[str, str]] = set()
    fuentes: list[dict] = []

    for fragmento in fragmentos:
        clave = (fragmento["modulo"], fragmento["clase"])
        if clave in vistas:
            continue
        vistas.add(clave)
        fuentes.append({"modulo": fragmento["modulo"], "clase": fragmento["clase"]})

    return fuentes


def _armar_prompt(pregunta: str, contexto: str) -> str:
    return (
        "CONTEXTO DE LAS CLASES:\n"
        f"{contexto}\n"
        "\n"
        "PREGUNTA DEL CLIENTE:\n"
        f"{pregunta}"
    )


def _get_client() -> AsyncAnthropic:
    api_key = config("ANTHROPIC_API_KEY", default=None)
    if not api_key:
        raise HTTPException(
            status_code=502,
            detail="No se pudo obtener una respuesta del asistente.",
        )
    return AsyncAnthropic(api_key=api_key, timeout=_TIMEOUT_SEGUNDOS)


async def _ejecutar_claude(prompt: str) -> str:
    client = _get_client()

    try:
        message = await client.messages.create(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            system=_SYSTEM_BLOCKS,
            messages=[{"role": "user", "content": prompt}],
        )
    except APITimeoutError:
        logger.error("Anthropic API superó el timeout de %d segundos", _TIMEOUT_SEGUNDOS)
        raise HTTPException(
            status_code=504,
            detail="El asistente tardó demasiado en responder. Intentá de nuevo.",
        )
    except APIError as exc:
        logger.error("Anthropic API falló: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="No se pudo obtener una respuesta del asistente.",
        )

    _log_token_usage(message.usage)
    return message.content[0].text


async def _ejecutar_claude_stream(prompt: str):
    client = _get_client()

    try:
        async with client.messages.stream(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            system=_SYSTEM_BLOCKS,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            async for text in stream.text_stream:
                yield text
            final = await stream.get_final_message()
            _log_token_usage(final.usage)
    except APITimeoutError:
        logger.error("Anthropic API superó el timeout de %d segundos", _TIMEOUT_SEGUNDOS)
        raise HTTPException(
            status_code=504,
            detail="El asistente tardó demasiado en responder. Intentá de nuevo.",
        )
    except APIError as exc:
        logger.error("Anthropic API falló: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="No se pudo obtener una respuesta del asistente.",
        )


async def responder_stream(pregunta: str):
    pregunta = pregunta.strip()
    if not pregunta:
        raise HTTPException(status_code=400, detail="La pregunta no puede estar vacía.")

    fragmentos = knowledge_service.buscar(pregunta)
    contexto = _armar_contexto(fragmentos)
    prompt = _armar_prompt(pregunta, contexto)
    fuentes = _extraer_fuentes(fragmentos)

    async for chunk in _ejecutar_claude_stream(prompt):
        yield chunk

    yield f"{_FUENTES_MARKER}{json.dumps(fuentes, ensure_ascii=False)}"
