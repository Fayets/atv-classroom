#!/usr/bin/env python3
"""Diagnóstico de ranking — 5 preguntas de temas distintos."""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

logging.basicConfig(level=logging.INFO, format="%(message)s")

from src.services import knowledge_service

PREGUNTAS = [
    ("ventas", "¿cómo cierro una venta en una call de discovery?"),
    ("ads", "¿cómo armo una campaña de ads en meta para captar leads?"),
    ("mindset", "¿cómo supero el miedo a vender y el bloqueo mental?"),
    ("contenido", "¿cómo hago reels virales para instagram?"),
    ("sistemas", "¿cómo automatizo mi negocio con sistemas y procesos?"),
]


def main() -> None:
    print(f"Índice cargado: {len(knowledge_service._INDEX)} archivos\n")
    for tema, pregunta in PREGUNTAS:
        print("=" * 72)
        print(f"[{tema.upper()}] {pregunta}")
        print("-" * 72)
        fuentes = knowledge_service.buscar(pregunta)
        print(f"→ seleccionados ({len(fuentes)}):")
        for f in fuentes:
            print(f"   {f['modulo']}/{f['clase']}")
        print()


if __name__ == "__main__":
    main()
