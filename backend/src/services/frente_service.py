import json
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException
from pony.orm import db_session, flush

from src.models import Clase, ConsultaCoach, Frente
from src.utils.clase_content import serializar_recursos

_DATA = Path(__file__).resolve().parent.parent / "data"
CATALOGO = json.loads((_DATA / "problemas.json").read_text(encoding="utf-8"))
BRIEFS = json.loads((_DATA / "briefs.json").read_text(encoding="utf-8"))
PROBLEMAS = {p["slug"]: p for p in CATALOGO["problemas"]}
COACHES = json.loads((_DATA / "coaches.json").read_text(encoding="utf-8"))


def coach_de_clase(clase: Clase) -> dict | None:
    """El coach sale del tema de la clase: la primera regla que coincide (clase > sección > módulo)."""
    modulo = clase.seccion.programa.titulo
    seccion = clase.seccion.titulo
    for regla in COACHES["reglas"]:
        if "clases" in regla:
            if clase.id not in regla["clases"]:
                continue
        elif regla.get("modulo") != modulo or ("seccion" in regla and regla["seccion"] != seccion):
            continue
        return {"clave": regla["coach"], **COACHES["coaches"][regla["coach"]]}
    return None


def coach_de_clases(clase_ids: list[int]) -> dict | None:
    for clase_id in clase_ids:
        clase = Clase.get(id=clase_id)
        coach = coach_de_clase(clase) if clase else None
        if coach:
            return coach
    return None


def _problema(slug: str) -> dict:
    problema = PROBLEMAS.get(slug)
    if problema is None:
        raise HTTPException(status_code=404, detail="Ese frente no existe.")
    return problema


_COMPLETABLES = ("docs.google.com",)  # Docs, Sheets y Forms: se copian y se completan


def _plantillas(problema: dict) -> list[dict]:
    """Los recursos de las clases del frente. Los de Google se completan; el resto es material de apoyo."""
    ids = list(dict.fromkeys([*problema["resolver"], problema["sop"]["clase_id"]]))
    salida, vistos = [], set()
    for clase_id in ids:
        clase = Clase.get(id=clase_id)
        if clase is None:
            continue
        for r in serializar_recursos(clase):
            if r["url"] in vistos:
                continue
            vistos.add(r["url"])
            salida.append({**r, "clase_id": clase.id, "clase_titulo": clase.titulo,
                           "completable": any(d in r["url"] for d in _COMPLETABLES)})
    return salida


def _sops(frente: Frente | None) -> dict[str, str]:
    if frente is None or not frente.sops_json:
        return {}
    try:
        datos = json.loads(frente.sops_json)
    except ValueError:
        return {}
    return {str(k): v for k, v in datos.items() if isinstance(v, str) and v}


def _documentado(problema: dict, frente: Frente) -> bool:
    completables = [p for p in _plantillas(problema) if p["completable"]]
    sops = _sops(frente)
    # Frentes de antes: un solo link de SOP para todo el frente; se respeta lo que ya hicieron.
    if not completables or (frente.sop_link and not sops):
        return bool(frente.sop_link)
    return all(str(p["id"]) in sops for p in completables)


def _paso(problema: dict, frente: Frente | None) -> int:
    """0 resolver, 1 documentar, 2 revisar, 3 listo."""
    if frente is None:
        return 0
    vistas = set(json.loads(frente.vistas_json))
    if not set(problema["resolver"]) <= vistas:
        return 0
    if not _documentado(problema, frente):
        return 1
    if not frente.revisado:
        return 2
    return 3


def _estado(problema: dict, frente: Frente | None) -> dict | None:
    if frente is None:
        return None
    return {
        "vistas": json.loads(frente.vistas_json),
        "sop_link": frente.sop_link,
        "sops": _sops(frente),
        "revisado": frente.revisado,
        "paso": _paso(problema, frente),
        "actualizado_en": frente.actualizado_en.isoformat(),
    }


def _frente(usuario_id: int, tipo: str, slug: str) -> Frente | None:
    return Frente.get(usuario_id=usuario_id, tipo_usuario=tipo, slug=slug)


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
                        "frente": _estado(p, propios.get(p["slug"])),
                    }
                )
            return {"areas": CATALOGO["areas"], "problemas": problemas}

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
                "plantillas": _plantillas(problema),
                "sop": {
                    "nombre": problema["sop"]["nombre"],
                    "recursos": serializar_recursos(sop_clase) if sop_clase else [],
                    "cubrir": sop_brief["claves"] if sop_brief else [],
                },
                "frente": _estado(problema, _frente(usuario_id, tipo, slug)),
                "coach": coach_de_clases(problema["resolver"]),
            }

    def actualizar(self, slug: str, usuario_id: int, tipo: str, cambios: dict) -> dict:
        problema = _problema(slug)
        permitidas = set(problema["resolver"])
        with db_session:
            frente = _frente(usuario_id, tipo, slug) or Frente(usuario_id=usuario_id, tipo_usuario=tipo, slug=slug)
            if cambios.get("vistas") is not None:
                frente.vistas_json = json.dumps(sorted({i for i in cambios["vistas"] if i in permitidas}))
            if "sop_link" in cambios:
                link = (cambios["sop_link"] or "").strip()
                if link and not link.startswith(("http://", "https://")):
                    raise HTTPException(status_code=400, detail="El link del SOP tiene que empezar con https://")
                frente.sop_link = link or None
            if cambios.get("sops") is not None:
                validas = {str(p["id"]) for p in _plantillas(problema)}
                sops = _sops(frente)
                for plantilla_id, link in cambios["sops"].items():
                    plantilla_id = str(plantilla_id)
                    if plantilla_id not in validas:
                        continue
                    link = (link or "").strip()
                    if link and not link.startswith(("http://", "https://")):
                        raise HTTPException(status_code=400, detail="El link tiene que empezar con https://")
                    if link:
                        sops[plantilla_id] = link
                    else:
                        sops.pop(plantilla_id, None)
                frente.sops_json = json.dumps(sops)
            if cambios.get("revisado") is not None:
                frente.revisado = bool(cambios["revisado"])
            frente.actualizado_en = datetime.utcnow()
            return _estado(problema, frente)

    def eliminar(self, slug: str, usuario_id: int, tipo: str) -> None:
        _problema(slug)
        with db_session:
            frente = _frente(usuario_id, tipo, slug)
            if frente is None:
                raise HTTPException(status_code=404, detail="Ese frente no está abierto.")
            frente.delete()

    def contexto_ayuda(self, slug: str) -> dict:
        """Título del frente y coach que lo revisa, para el aviso en Discord."""
        problema = _problema(slug)
        with db_session:
            return {"titulo": problema["titulo"], "coach": coach_de_clases(problema["resolver"])}

    def registrar_consulta(self, usuario_id: int, tipo: str, texto: str, slug: str | None) -> dict:
        if slug is not None:
            _problema(slug)
        with db_session:
            consulta = ConsultaCoach(usuario_id=usuario_id, tipo_usuario=tipo, texto=texto.strip(), slug=slug)
            flush()
            return {"id": consulta.id, "estado": consulta.estado}
