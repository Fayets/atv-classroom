"""Agrega a cada concepto cómo lo dice un cliente con sus palabras (para reconocerlo en el chat
y en las preguntas a la guía). Una sola llamada; queda en src/data/conceptos.json.

Uso: PYTHONPATH=. python3 scripts/palabras_conceptos.py
"""

import json
import re
from pathlib import Path

from anthropic import Anthropic
from decouple import config

DATA = Path(__file__).resolve().parents[1] / "src" / "data"
archivo = DATA / "conceptos.json"
datos = json.loads(archivo.read_text(encoding="utf-8"))
lista = "\n".join(f"{c['id']}: {c['nombre']} — {c['definicion']}" for c in datos["conceptos"])
cliente = Anthropic(api_key=config("ANTHROPIC_API_KEY"), timeout=600)
msg = cliente.messages.create(
    model=datos.get("modelo", "claude-sonnet-5-5"),
    max_tokens=8000,
    system="Respondé solo con JSON válido, sin texto antes ni después y sin bloques de código.",
    messages=[{"role": "user", "content": (
        "Conceptos del programa ATV:\n" + lista + "\n\n"
        "Para cada concepto dame entre 4 y 8 palabras o frases cortas (1 a 3 palabras) que usaría un dueño de negocio "
        "argentino al hablar de eso SIN conocer el término técnico. Ej: pricing → cobrar, precio, caro, cuánto cobro; "
        "no-show → no se presentan, no vienen, faltan. Minúsculas, sin tildes, nada genérico que aparezca en cualquier "
        'charla (como "negocio" o "clientes").\nFormato: {"<id>": ["frase", "..."]}'
    )}],
)
texto = re.sub(r"^```(?:json)?|```$", "", "".join(b.text for b in msg.content if b.type == "text").strip()).strip()
palabras = json.loads(texto)
for c in datos["conceptos"]:
    c["palabras"] = [p.strip().lower() for p in palabras.get(c["id"], []) if p.strip()]
archivo.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
print("conceptos con palabras:", sum(1 for c in datos["conceptos"] if c.get("palabras")), "de", len(datos["conceptos"]))
