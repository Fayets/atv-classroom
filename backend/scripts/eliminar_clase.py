"""Borra la clase "Empieza por aquí 💎" (pedido de Franco, 27-10-2026): sin video, solo un texto y el link al
WhatsApp del Círculo Privado. Va por el comienzo del título y tiene que haber exactamente una; si no, no
borra nada. Hace lo mismo que el botón Eliminar del admin (progreso y SOPs de la clase incluidos).

    python -m scripts.eliminar_clase            # muestra
    python -m scripts.eliminar_clase --aplicar  # borra
"""

import sys
import unicodedata

from pony.orm import db_session

from src.db import init_db
from src.services.admin_service import _eliminar_clase_cascada

TITULO = "empieza por aqui"


def _plano(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto or "") if unicodedata.category(c) != "Mn").lower().strip()


def main(aplicar: bool) -> int:
    init_db()
    from src.models import Clase

    with db_session:
        hits = [c for c in list(Clase.select()) if _plano(c.titulo).startswith(TITULO)]
        for c in hits:
            print(f"  {c.id:>3}  {c.titulo}  [{c.seccion.programa.titulo} · {c.seccion.titulo}]  video: {'sí' if c.video_url else 'no'} · {c.recursos.count()} SOPs")
        if len(hits) != 1:
            print(f"\n{len(hits)} clases coinciden: tiene que ser una sola. No se borra nada.")
            return 1
        if hits[0].video_url:
            print("\nTiene video: no es la que se pidió borrar. No se borra nada.")
            return 1
        if not aplicar:
            print("\nEs esa. Corré con --aplicar para borrarla.")
            return 0
        _eliminar_clase_cascada(hits[0].id)
    print("\nBorrada.")
    return 0


if __name__ == "__main__":
    sys.exit(main("--aplicar" in sys.argv))
