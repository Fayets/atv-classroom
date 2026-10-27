"""Saca de las descripciones de las clases a quienes ya no están en ATV: Fede, Naza y Thiago (pedido de Franco,
27-10-2026). Lo que se puede sacar sin romper el texto se saca solo:

- el cierre de la clase si es suyo: el pedido de etiquetarlo, "Mi instagram: @…" y su firma (en primera persona
  no puede quedar apuntando al Instagram de otro),
- su @ de Instagram suelto (y el "y"/"," que lo une a otro @),
- su firma ("-Naza", "– Fede y Juan" queda "– Juan"),
- "hablar con Naza" (los Case of Study, para entrar al Círculo Privado) pasa a "hablar con Juan".

Si después de eso el nombre sigue en una oración, esa clase no se toca y se lista para reescribirla a mano.
Sin --aplicar solo muestra los cambios.

    python -m scripts.limpiar_ex_equipo            # muestra
    python -m scripts.limpiar_ex_equipo --aplicar  # guarda
"""

import re
import sys

from pony.orm import db_session

from src.db import init_db

NOMBRE = r"(?:naza(?:reno)?|fede(?:rico)?|thiago)"
HANDLE = re.compile(rf"@[\w.]*{NOMBRE}[\w.]*", re.I)
QUEDA = re.compile(rf"\b{NOMBRE}\b|@[\w.]*{NOMBRE}", re.I)
FIRMA = re.compile(r"^(\s*[-–—]\s*)(.+?)\s*$")


# Dónde arranca el cierre de la clase: el separador "⸻" o el pedido de foto/etiqueta. Si ese cierre es de alguien
# que se fue (tiene su @ o su firma), se va entero: es un mensaje suyo en primera persona.
CIERRE = re.compile(r"^\s*⸻|si la clase te (?:gust|sirvi)|si te gust[óo] la clase", re.I)


def _sin_cierre_ajeno(texto: str) -> str:
    lineas = texto.split("\n")
    inicio = next((i for i, l in enumerate(lineas) if CIERRE.search(l)), None)
    if inicio is None:
        return texto
    cola = "\n".join(lineas[inicio:])
    if HANDLE.search(cola) or re.search(rf"^\s*[-–—]\s*{NOMBRE}\b", cola, re.I | re.M):
        return "\n".join(lineas[:inicio]).rstrip()
    return texto


def _limpiar(texto: str) -> str:
    texto = _sin_cierre_ajeno(texto)
    # "Mi instagram: @naza_gamero y @juanxcarrizo." está en primera persona: si es de alguien que se fue, la
    # línea entera se va (no puede quedar el Instagram de otro como si fuera el suyo).
    texto = "\n".join(l for l in texto.split("\n") if not (HANDLE.search(l) and re.search(r"instagram|\bmi ig\b", l, re.I)))
    t = HANDLE.sub(lambda m: m.group(0) + "\0", texto)  # marca cada @ que se va
    t = re.sub(r"@[\w.]+\0\s*(?:y|,)\s*", "", t)
    t = re.sub(r"\s*(?:y|,)\s*@[\w.]+\0", "", t)
    t = re.sub(r"@[\w.]+\0", "", t)
    lineas = []
    for linea in t.split("\n"):
        m = FIRMA.match(linea)
        if m and len(m.group(2)) <= 40 and not re.search(r"[.:@]", m.group(2)):
            quienes = [q for q in re.split(r"\s*(?:,|\by\b)\s*", m.group(2)) if q and not re.fullmatch(NOMBRE, q.strip(), re.I)]
            if not quienes:
                continue
            linea = m.group(1) + " y ".join(quienes)
        elif re.fullmatch(rf"\s*{NOMBRE}\s*", linea, re.I):
            continue
        lineas.append(linea)
    t = "\n".join(lineas)
    t = re.sub(rf"\bcon {NOMBRE}\b", "con Juan", t, flags=re.I)
    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def _cambios(antes: str, despues: str) -> list[str]:
    a, d = antes.strip().split("\n"), despues.split("\n")
    return [f"      − {l.strip()}" for l in a if l not in set(d) and l.strip()] + [
        f"      + {l.strip()}" for l in d if l not in set(a) and l.strip()]


def main(aplicar: bool) -> int:
    init_db()
    from src.models import Clase, ClaseRecurso

    limpias, a_mano = 0, []
    with db_session:
        for c in sorted(list(Clase.select()), key=lambda c: c.id):
            texto = c.descripcion or ""
            if not QUEDA.search(texto):
                continue
            nuevo = _limpiar(texto)
            resto = [o.strip() for o in re.split(r"(?<=[.!?\n])", nuevo) if QUEDA.search(o)]
            donde = f"{c.id:>3}  {c.titulo}  [{c.seccion.programa.titulo}]"
            if resto:
                a_mano.append((donde, resto))
                continue
            limpias += 1
            print(f"  ✓ {donde}")
            print("\n".join(_cambios(texto, nuevo)))
            if aplicar:
                c.descripcion = nuevo
        recursos = [r for r in list(ClaseRecurso.select()) if QUEDA.search(r.titulo or "")]
        # Dos descripciones enteras ya limpias (una de Naza y una de Fede), para ver cómo queda todo el texto.
        for cid in (6, 43):
            c = Clase.get(id=cid)
            if c and c.descripcion:
                print(f"\n——— {cid} {c.titulo}, entera después de limpiar ———\n{_limpiar(c.descripcion) if QUEDA.search(c.descripcion) else c.descripcion}")

    print(f"\n{limpias} descripciones {'limpias' if aplicar else 'se limpian'} solas.")
    if a_mano:
        print(f"\n{len(a_mano)} con el nombre dentro de una oración (NO se tocan, hay que reescribirlas):")
        for donde, oraciones in a_mano:
            print(f"  ✗ {donde}")
            for o in oraciones:
                print(f"      «{o[:220]}»")
    if recursos:
        print(f"\n{len(recursos)} SOPs con el nombre en el título (no se tocan):")
        for r in recursos:
            print(f"  · {r.clase.id:>3}  {r.titulo}")
    return 0


if __name__ == "__main__":
    sys.exit(main("--aplicar" in sys.argv))
