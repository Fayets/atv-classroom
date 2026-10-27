"""Pone en "Próximamente" el video de las clases del módulo Advantage donde sale el equipo (lista de Franco,
27-10-2026). Solo el video: los SOPs de cada clase se siguen viendo.

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
}


def _plano(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto or "") if unicodedata.category(c) != "Mn").lower()


def main(aplicar: bool) -> int:
    init_db()
    from src.models import Clase

    malas = 0
    with db_session:
        for cid, palabra in CLASES.items():
            clase = Clase.get(id=cid)
            if clase is None or palabra not in _plano(clase.titulo):
                malas += 1
                print(f"  ✗ {cid:>3}  {clase.titulo if clase else '(no existe)'}  — esperaba «{palabra}», NO se toca")
                continue
            estado = "ya estaba" if clase.video_bloqueado else ("marcada" if aplicar else "se marcaría")
            print(f"  ✓ {cid:>3}  {clase.titulo}  [{clase.seccion.programa.titulo}] — {estado}")
            if aplicar:
                clase.video_bloqueado = True
    print(f"\n{len(CLASES) - malas} de {len(CLASES)} {'en Próximamente' if aplicar else 'listas (corré con --aplicar)'}")
    return 1 if malas else 0


if __name__ == "__main__":
    sys.exit(main("--aplicar" in sys.argv))
