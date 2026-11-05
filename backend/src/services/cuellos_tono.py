"""El borrador del diagnóstico, con la voz del coach que se lo manda al cliente.

Se reescribe sección por sección y en paralelo (el corte de nginx es a los 60 s). La IA solo cambia cómo está
dicho: el código controla que sigan los mismos números, capturas y subtítulos, y si no, esa sección queda como
estaba."""

import re
from concurrent.futures import ThreadPoolExecutor

_INSTRUCCIONES = """Reescribís una sección de un diagnóstico que ATV le manda a un cliente para que quede escrita por {coach}, de su puño y letra: quien conozca a {coach} tiene que leerla y reconocerlo.

- Copiá su forma de escribir entera, como aparece en sus mensajes: mayúsculas o minúsculas, tildes o falta de tildes, signos, largo de las frases, muletillas, abreviaturas, cómo arranca y cómo cierra. Si escribe todo en minúscula y sin tildes, esto va igual. No lo corrijas ni lo pases a un español prolijo: el documento no es excusa para escribir distinto.
- El contenido no cambia: no agregás ni sacás ideas, datos, números, ejemplos ni pasos, aunque sus mensajes sean más cortos.
- Mantené el formato línea por línea, sin sacar ninguna (tampoco rótulos cortos como "Números:"): los subtítulos que empiezan con ###, las viñetas con -, los ejemplos con >, las negritas con ** y las líneas [captura MM:SS] exactamente donde están.
- Hablale directo al cliente. No menciones que es una reescritura. Devolvé solo la sección, sin títulos nuevos ni comentarios."""

_NUMEROS = re.compile(r"\d+(?:[.,]\d+)*")
_CAPTURA = re.compile(r"\[captura\s+\d+:\d+\]", re.I)


def _huella(texto: str) -> tuple:
    """Lo que no puede cambiar: números, capturas y cantidad de subtítulos y viñetas."""
    return (set(_NUMEROS.findall(texto)), sorted(c.lower() for c in _CAPTURA.findall(texto)), len(re.findall(r"^#{2,}\s", texto, re.M)),
            len(re.findall(r"^[-•*]\s", texto, re.M)))


def valida(original: str, nueva: str) -> bool:
    return bool(nueva.strip()) and _huella(original) == _huella(nueva)


def con_sus_signos(texto: str, rasgos: dict) -> str:
    """Lo que está medido no se le deja a la IA: si escribe en minúscula o sin ¿ ¡, queda así (los links no se tocan)."""
    if (rasgos.get("todo_minuscula_pct") or 0) >= 60:
        texto = " ".join(p if p.startswith("http") else p.lower() for p in texto.split(" "))
    if rasgos.get("abre_pregunta_pct") is not None and rasgos["abre_pregunta_pct"] <= 10:
        texto = texto.replace("¿", "")
    if rasgos.get("abre_exclamacion_pct") is not None and rasgos["abre_exclamacion_pct"] <= 10:
        texto = texto.replace("¡", "")
    return texto


def armar_usuario(coach: str, describir: str, ejemplos: list[str], seccion: str, cuerpo: str) -> str:
    lista = "\n".join(f"- {e[:700]}" for e in ejemplos[:30]) or "(sin ejemplos)"
    return f"""Cómo escribe {coach}: {describir}
Mensajes reales de {coach} (copiá el tono, no el contenido):
{lista}

Sección "{seccion}" para reescribir:
{cuerpo}"""


def reescribir(partes: dict[str, str], coach: str, describir: str, ejemplos: list[str], rasgos: dict, llamar) -> tuple[dict[str, str], list[str]]:
    """Devuelve las secciones reescritas y cuáles quedaron como estaban (porque la IA falló o cambió algo que no debía)."""
    sistema = _INSTRUCCIONES.format(coach=coach)

    def una(item):
        seccion, cuerpo = item
        try:
            nueva = con_sus_signos(llamar(sistema, armar_usuario(coach, describir, ejemplos, seccion, cuerpo)).strip(), rasgos)
        except Exception:
            return seccion, cuerpo, False
        return (seccion, nueva, True) if valida(cuerpo, nueva) else (seccion, cuerpo, False)

    items = [(s, c) for s, c in partes.items() if c.strip()]
    with ThreadPoolExecutor(max_workers=8) as pool:
        hechas = list(pool.map(una, items))
    return {s: t for s, t, _ in hechas}, [s for s, _, ok in hechas if not ok]
