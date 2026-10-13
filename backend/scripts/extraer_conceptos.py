"""Extrae, una sola vez, los conceptos que atraviesan las clases (para el cerebro del admin).

1) Con los títulos y claves de todas las clases, Claude arma una taxonomía de conceptos de ATV.
2) En tandas de 50 clases, etiqueta cada clase con 2 a 6 de esos conceptos.
El resultado queda en src/data/conceptos.json, versionado: el cerebro no llama a la IA al cargar.

Uso: PYTHONPATH=. python3 scripts/extraer_conceptos.py
"""

import json
import re
import sys
from pathlib import Path

from anthropic import Anthropic
from decouple import config
from pony.orm import db_session

from src.db import init_db
from src.models import Clase

DATA = Path(__file__).resolve().parents[1] / "src" / "data"
MODELO = "claude-sonnet-5-5"
cliente = Anthropic(api_key=config("ANTHROPIC_API_KEY"), timeout=600)


def pedir_json(prompt: str, max_tokens: int = 12000):
    msg = cliente.messages.create(
        model=MODELO,
        max_tokens=max_tokens,
        system="Respondé solo con JSON válido, sin texto antes ni después y sin bloques de código.",
        messages=[{"role": "user", "content": prompt}],
    )
    texto = "".join(b.text for b in msg.content if b.type == "text").strip()
    texto = re.sub(r"^```(?:json)?|```$", "", texto).strip()
    if msg.stop_reason == "max_tokens":
        raise SystemExit("La respuesta se cortó por largo")
    return json.loads(texto), msg.usage


def main() -> None:
    init_db()
    briefs = json.loads((DATA / "briefs.json").read_text(encoding="utf-8"))
    clases = []
    with db_session:
        for clase_id, b in briefs.items():
            c = Clase.get(id=int(clase_id))
            if c is not None:
                clases.append({"id": c.id, "modulo": c.seccion.programa.titulo, "titulo": c.titulo, "claves": b.get("claves", [])})

    resumen = "\n".join(f"[{c['id']}] {c['modulo']} › {c['titulo']}: {'; '.join(c['claves'])}" for c in clases)
    taxonomia, uso1 = pedir_json(
        "Clases del classroom de ATV (programa para dueños de infoproductos y servicios):\n" + resumen + "\n\n"
        "Armá una taxonomía de 50 a 80 CONCEPTOS que atraviesen varias clases (no uno por clase): temas de negocio "
        "concretos como Avatar, Oferta, Pricing, Follow-up, No-show, Objeciones, Setter, Closer, Reels, Historias, "
        "Métricas, Evergreen, Lanzamiento, Webinar, Lead magnet, Onboarding, Inactividad, Upsell, Equipo, Comisiones, "
        "Mentalidad. Vocabulario de ATV. Cada concepto debe tocar al menos 2 clases.\n"
        'Formato: {"conceptos":[{"id":"slug-con-guiones","nombre":"1 a 3 palabras","definicion":"una oración en términos de ATV"}]}'
    )
    conceptos = taxonomia["conceptos"]
    ids = {c["id"] for c in conceptos}
    lista = "\n".join(f"{c['id']}: {c['nombre']}" for c in conceptos)

    etiquetas: dict[str, list[str]] = {}
    for i in range(0, len(clases), 50):
        tanda = clases[i : i + 50]
        texto = "\n".join(f"[{c['id']}] {c['modulo']} › {c['titulo']}: {'; '.join(c['claves'])}" for c in tanda)
        res, _ = pedir_json(
            "Conceptos disponibles (id: nombre):\n" + lista + "\n\nEtiquetá CADA una de estas clases con 2 a 6 ids de "
            "conceptos de la lista, los que de verdad trata la clase:\n" + texto + "\n\n"
            'Formato: {"clases":{"<id de la clase>":["id-concepto", "..."]}}',
            max_tokens=6000,
        )
        for clase_id, lista_ids in res["clases"].items():
            validos = [x for x in lista_ids if x in ids]
            if validos:
                etiquetas[str(clase_id)] = validos
        print(f"tanda {i // 50 + 1}: {len(res['clases'])} clases")

    salida = {"modelo": MODELO, "conceptos": conceptos, "clases": etiquetas}
    (DATA / "conceptos.json").write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
    usados = {x for v in etiquetas.values() for x in v}
    print(f"conceptos: {len(ids)} (usados {len(usados)}) | clases etiquetadas: {len(etiquetas)} de {len(clases)} | tokens taxonomía in {uso1.input_tokens} out {uso1.output_tokens}")


if __name__ == "__main__":
    sys.exit(main())
