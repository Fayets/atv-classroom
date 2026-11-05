"""El borrador del diagnóstico, con la voz del coach que se lo manda al cliente.

Se reescribe sección por sección y en paralelo (el corte de nginx es a los 60 s). La IA solo cambia cómo está
dicho: el código controla que sigan los mismos números, capturas y subtítulos, y si no, esa sección queda como
estaba."""

import re
from concurrent.futures import ThreadPoolExecutor

_INSTRUCCIONES = """Reescribís una sección de un diagnóstico que ATV le manda a un cliente, con la voz de {coach}.

Cambiás SOLO cómo está dicho: vocabulario, ritmo, cercanía, las muletillas y giros de {coach}.
- No agregás ni sacás ideas, datos, números, ejemplos ni pasos. Todo lo que dice el original tiene que seguir diciéndolo.
- Mantené el formato línea por línea: los subtítulos que empiezan con ###, las viñetas con -, los ejemplos con >, las negritas con ** y las líneas [captura MM:SS] exactamente donde están.
- Es un documento para leer, no un chat: mayúscula al empezar, puntuación normal y palabras enteras (nada de "x" por "por", ni "q", ni letras estiradas como "queridoo"), aunque {coach} en el chat escriba distinto. Sin emojis.
- Voseo rioplatense, hablándole directo al cliente.
- No menciones que es una reescritura. Devolvé solo la sección, sin títulos nuevos ni comentarios."""

_NUMEROS = re.compile(r"\d+(?:[.,]\d+)*")
_CAPTURA = re.compile(r"\[captura\s+\d+:\d+\]", re.I)


def _huella(texto: str) -> tuple:
    """Lo que no puede cambiar: números, capturas y cantidad de subtítulos."""
    return (set(_NUMEROS.findall(texto)), sorted(_CAPTURA.findall(texto)), len(re.findall(r"^#{2,}\s", texto, re.M)))


def valida(original: str, nueva: str) -> bool:
    return bool(nueva.strip()) and _huella(original) == _huella(nueva)


def armar_usuario(coach: str, describir: str, ejemplos: list[str], seccion: str, cuerpo: str) -> str:
    lista = "\n".join(f"- {e[:400]}" for e in ejemplos[:16]) or "(sin ejemplos)"
    return f"""Cómo escribe {coach}: {describir}
Mensajes reales de {coach} (copiá el tono, no el contenido):
{lista}

Sección "{seccion}" para reescribir:
{cuerpo}"""


def reescribir(partes: dict[str, str], coach: str, describir: str, ejemplos: list[str], llamar) -> tuple[dict[str, str], list[str]]:
    """Devuelve las secciones reescritas y cuáles quedaron como estaban (porque la IA falló o cambió algo que no debía)."""
    sistema = _INSTRUCCIONES.format(coach=coach)

    def una(item):
        seccion, cuerpo = item
        try:
            nueva = llamar(sistema, armar_usuario(coach, describir, ejemplos, seccion, cuerpo)).strip()
        except Exception:
            return seccion, cuerpo, False
        return (seccion, nueva, True) if valida(cuerpo, nueva) else (seccion, cuerpo, False)

    items = [(s, c) for s, c in partes.items() if c.strip()]
    with ThreadPoolExecutor(max_workers=8) as pool:
        hechas = list(pool.map(una, items))
    return {s: t for s, t, _ in hechas}, [s for s, _, ok in hechas if not ok]
