import json
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException
from pony.orm import db_session, flush

from src.models import Clase, ClienteExterno, ConsultaCoach, Frente
from src.utils.clase_content import serializar_recursos

_DATA = Path(__file__).resolve().parent.parent / "data"
CATALOGO = json.loads((_DATA / "problemas.json").read_text(encoding="utf-8"))
BRIEFS = json.loads((_DATA / "briefs.json").read_text(encoding="utf-8"))
PROBLEMAS = {p["slug"]: p for p in CATALOGO["problemas"]}

# clients.clientes.responsable guarda la clave; acá el nombre que ve el cliente.
NOMBRES_COACH = {"lucas": "Lucas", "juampi": "Juampi", "juan": "Juan", "ale": "Ale"}


def _problema(slug: str) -> dict:
    problema = PROBLEMAS.get(slug)
    if problema is None:
        raise HTTPException(status_code=404, detail="Ese frente no existe.")
    return problema


def _paso(problema: dict, frente: Frente | None) -> int:
    """0 resolver, 1 documentar, 2 automatizar, 3 implementado."""
    if frente is None:
        return 0
    vistas = set(json.loads(frente.vistas_json))
    if not set(problema["resolver"]) <= vistas:
        return 0
    if not frente.sop_link:
        return 1
    if not frente.automatizado:
        return 2
    return 3


def _estado(problema: dict, frente: Frente | None) -> dict | None:
    if frente is None:
        return None
    return {
        "vistas": json.loads(frente.vistas_json),
        "sop_link": frente.sop_link,
        "automatizado": frente.automatizado,
        "paso": _paso(problema, frente),
        "actualizado_en": frente.actualizado_en.isoformat(),
    }


def _frente(usuario_id: int, tipo: str, slug: str) -> Frente | None:
    return Frente.get(usuario_id=usuario_id, tipo_usuario=tipo, slug=slug)


def _coach(usuario_id: int, tipo: str) -> dict | None:
    if tipo != "cliente":
        return None
    cliente = ClienteExterno.get(id=usuario_id)
    clave = (cliente.responsable or "").strip().lower() if cliente else ""
    if not clave:
        return None
    return {"nombre": NOMBRES_COACH.get(clave, clave.capitalize())}


def _clase(clase_id: int) -> dict | None:
    clase = Clase.get(id=clase_id)
    if clase is None:
        return None
    brief = BRIEFS.get(str(clase_id))
    return {
        "id": clase.id,
        "titulo": clase.titulo,
        "video_url": clase.video_url,
        "programa_id": clase.seccion.programa.id,
        "recursos": serializar_recursos(clase),
        "resumen": brief["resumen"] if brief else None,
        "claves": brief["claves"] if brief else [],
    }


class FrenteServices:
    def listar(self, usuario_id: int, tipo: str) -> dict:
        with db_session:
            # Sin lambdas de Pony: en Python 3.13 el decompilador filtra mal.
            propios = {}
            for f in Frente.select()[:]:
                if f.usuario_id == usuario_id and f.tipo_usuario == tipo:
                    propios[f.slug] = f
            problemas = []
            for p in CATALOGO["problemas"]:
                problemas.append(
                    {
                        "slug": p["slug"],
                        "area": p["area"],
                        "titulo": p["titulo"],
                        "sintoma": p["sintoma"],
                        "clases_resolver": len(p["resolver"]),
                        "sop_nombre": p["sop"]["nombre"],
                        "tiene_automatizacion": bool(p["automatizar"]),
                        "frente": _estado(p, propios.get(p["slug"])),
                    }
                )
            return {"areas": CATALOGO["areas"], "problemas": problemas, "coach": _coach(usuario_id, tipo)}

    def detalle(self, slug: str, usuario_id: int, tipo: str) -> dict:
        problema = _problema(slug)
        with db_session:
            sop_clase = Clase.get(id=problema["sop"]["clase_id"])
            sop_brief = BRIEFS.get(str(sop_clase.id)) if sop_clase else None
            return {
                "slug": slug,
                "area": problema["area"],
                "titulo": problema["titulo"],
                "sintoma": problema["sintoma"],
                "resolver": [c for c in (_clase(i) for i in problema["resolver"]) if c],
                "automatizar": [c for c in (_clase(i) for i in problema["automatizar"]) if c],
                "sop": {
                    "nombre": problema["sop"]["nombre"],
                    "recursos": serializar_recursos(sop_clase) if sop_clase else [],
                    "cubrir": sop_brief["claves"] if sop_brief else [],
                },
                "frente": _estado(problema, _frente(usuario_id, tipo, slug)),
                "coach": _coach(usuario_id, tipo),
            }

    def actualizar(self, slug: str, usuario_id: int, tipo: str, cambios: dict) -> dict:
        problema = _problema(slug)
        permitidas = set(problema["resolver"]) | set(problema["automatizar"])
        with db_session:
            frente = _frente(usuario_id, tipo, slug) or Frente(usuario_id=usuario_id, tipo_usuario=tipo, slug=slug)
            if cambios.get("vistas") is not None:
                frente.vistas_json = json.dumps(sorted({i for i in cambios["vistas"] if i in permitidas}))
            if "sop_link" in cambios:
                link = (cambios["sop_link"] or "").strip()
                if link and not link.startswith(("http://", "https://")):
                    raise HTTPException(status_code=400, detail="El link del SOP tiene que empezar con https://")
                frente.sop_link = link or None
            if cambios.get("automatizado") is not None:
                frente.automatizado = bool(cambios["automatizado"])
            frente.actualizado_en = datetime.utcnow()
            return _estado(problema, frente)

    def registrar_consulta(self, usuario_id: int, tipo: str, texto: str, slug: str | None) -> dict:
        if slug is not None:
            _problema(slug)
        with db_session:
            consulta = ConsultaCoach(usuario_id=usuario_id, tipo_usuario=tipo, texto=texto.strip(), slug=slug)
            flush()
            return {"id": consulta.id, "estado": consulta.estado, "coach": _coach(usuario_id, tipo)}
