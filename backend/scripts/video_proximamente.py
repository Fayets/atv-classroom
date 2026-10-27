"""Pone en "Próximamente" el video de las clases donde sale el equipo (listas de Franco del 27-10-2026:
Advantage, Business Foundations, Marketing y Sales). Solo el video: los SOPs de cada clase se siguen viendo. Se puede correr
de nuevo cuando se suman clases: las que ya estaban quedan igual.

Cada clase va por su id con una palabra que tiene que estar en el título: si no coincide, no se toca y se
avisa. Sin --aplicar solo muestra lo que haría.

    python -m scripts.video_proximamente            # muestra
    python -m scripts.video_proximamente --aplicar  # marca
"""

import sys
import unicodedata

from pony.orm import db_session

from src.db import init_db

# id de la clase -> palabra que tiene que aparecer en el título (sin tildes, en minúscula)
CLASES = {
    6: "flywheel",          # Flywheel de negocio simple y escalable (Naza)
    9: "servicio",          # Modelos de servicio (Naza)
    16: "mvp",              # Cómo crear tu producto mvp (Naza)
    17: "pricing",          # Pricing (Naza)
    18: "bases",            # Validar las bases de tu negocio (Naza)
    21: "importancia",      # Importancia de las métricas (Naza)
    22: "decidir",          # Cómo decidir en base a métricas (Naza)
    23: "sacar",            # Cómo sacar métricas (Naza)
    24: "lagunas",          # Lagunas de información y ciclos de compra (Naza)
    26: "laboratorio",      # Laboratorio de contenido (Naza)
    27: "evergreen",        # Evergreen flywheel (Naza)
    28: "roadmap",          # Evergreen roadmap (Naza)
    29: "leads",            # Sistema de generación de leads (Naza)
    30: "research",         # Research interno y externo (Thiago)
    37: "calendario",       # Calendarios de contenidos y cómo adaptarlos (Thiago)
    38: "ads",              # Cuándo hacer ads (Naza)
    43: "closer",           # Closer vs experto en ventas (Fede)
    44: "estructura",       # Estructura de llamada (Fede)
    45: "objeciones",       # Resolución de objeciones (Fede)
    46: "lanzamientos",     # ¿Cuándo hacer lanzamientos? (Naza)
    47: "producto",         # Cómo crear y cómo mejorar tu producto (Naza)
    48: "proyecciones",     # Proyecciones y limitaciones (Naza)
    # Business Foundations
    49: "perfil",           # Qué buscar en cada perfil y dónde buscarlo (Naza)
    50: "miembro",          # Cómo onboardear a un miembro del equipo (Naza)
    51: "gestionar",        # Cómo gestionar tu equipo (Naza)
    52: "reuniones",        # Reuniones efectivas (Naza)
    53: "documentar",       # Cómo documentar procesos para delegar (Naza)
    54: "organizar",        # Cómo organizar tu día para hacer +100K/MES (Naza)
    # Marketing
    60: "marca personal",   # Cómo arrancar una marca personal de 0 (Naza)
    61: "depurar",          # Cómo depurar una cuenta viral (Naza)
    62: "editor",           # Cómo trabajar con un editor (Naza)
    # Sales
    77: "marketing",        # Cómo aportar a marketing (Fede)
    78: "habitos",          # Los 7 hábitos del vendedor #1 (Fede)
    79: "principios",       # Los 5 principios fundamentales de ventas (Fede)
    80: "avanzadas",        # Introducción a las ventas avanzadas (Fede)
    81: "tonalidad",        # Tonalidad avanzada para llamadas (Fede)
    83: "autoridad",        # Cómo hacer que te perciban como autoridad (Fede)
    84: "urgencia",         # Cómo generar urgencia de forma natural (Fede)
    85: "downsell",         # Cómo hacer downsell y cuotas (Fede)
    86: "ego",              # Cómo manejar leads con ego (Fede)
    87: "creencias",        # Cómo detectar las creencias limitantes del lead (Fede)
    88: "identidad",        # Cómo meter al lead en el marco de identidad (Fede)
    89: "presentacion",     # Presentación de ventas (Fede)
}

# Clases que nunca se grabaron y no tienen id a mano: van por módulo (título exacto) y por palabra del título.
# Tiene que haber exactamente una que coincida.
POR_TITULO = [
    ("marketing", "en vivo"),             # Creando en vivo (nunca se grabó)
    ("marketing", "psicologia del consumo"),  # Psicología del consumo (nunca se grabó)
]


def _plano(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto or "") if unicodedata.category(c) != "Mn").lower()


def main(aplicar: bool) -> int:
    init_db()
    from src.models import Clase

    malas = 0
    with db_session:
        elegidas = []
        for cid, palabra in CLASES.items():
            clase = Clase.get(id=cid)
            if clase is None or palabra not in _plano(clase.titulo):
                malas += 1
                print(f"  ✗ {cid:>3}  {clase.titulo if clase else '(no existe)'}  — esperaba «{palabra}», NO se toca")
                continue
            elegidas.append(clase)
        todas = list(Clase.select())
        for modulo, palabra in POR_TITULO:
            hits = [c for c in todas if _plano(c.seccion.programa.titulo).strip() == modulo and palabra in _plano(c.titulo)]
            if len(hits) != 1:
                malas += 1
                print(f"  ✗   ?  «{palabra}» en {modulo}: {len(hits)} clases coinciden ({', '.join(c.titulo for c in hits) or 'ninguna'}), NO se toca")
                continue
            elegidas.append(hits[0])
        for clase in elegidas:
            cid = clase.id
            estado = "ya estaba" if clase.video_bloqueado else ("marcada" if aplicar else "se marcaría")
            print(f"  ✓ {cid:>3}  {clase.titulo}  [{clase.seccion.programa.titulo}] — {estado}")
            if aplicar:
                clase.video_bloqueado = True
    total = len(CLASES) + len(POR_TITULO)
    print(f"\n{total - malas} de {total} {'en Próximamente' if aplicar else 'listas (corré con --aplicar)'}")
    return 1 if malas else 0


if __name__ == "__main__":
    sys.exit(main("--aplicar" in sys.argv))
