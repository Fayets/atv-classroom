#!/usr/bin/env python3
"""Corre preguntas de prueba contra el agente y reporta costo estimado."""

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

logging.basicConfig(level=logging.INFO, format="%(message)s")

from src.db import init_db
from src.services.agent_service import responder_stream

PREGUNTAS = [
    "¿qué es TOFU en marketing?",
    "¿cómo hago un buen pitch de ventas?",
    "¿qué es el ICP y por qué importa?",
    "¿cómo escalo mi negocio de infoproductos?",
    "¿qué es el posicionamiento de marca personal?",
]


async def _correr_pregunta(pregunta: str) -> dict:
    texto = ""
    async for chunk in responder_stream(pregunta):
        if chunk.startswith("FUENTES:"):
            break
        texto += chunk
    return {"pregunta": pregunta, "chars": len(texto)}


async def main() -> None:
    init_db()
    print("Benchmark de costo — revisá los logs 'Anthropic usage' por pregunta\n")

    for i, pregunta in enumerate(PREGUNTAS, 1):
        print(f"{i}. {pregunta}")
        resultado = await _correr_pregunta(pregunta)
        print(f"   respuesta: {resultado['chars']} caracteres\n")

    print(
        "Costo estimado por request aparece en logs como costo_estimado_usd.\n"
        "Fórmula: input + cache_write*1.25 + cache_read*0.1 + output*5 (USD/M tokens)"
    )


if __name__ == "__main__":
    asyncio.run(main())
