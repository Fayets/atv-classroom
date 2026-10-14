"""El roadmap del cliente, como un tablero de Miro: una tarjeta por coach con sus documentos.

Cada documento es el Google Doc de próximos pasos que deja un coach después de una llamada.
- Mismo coach + mismo título = versiones (v1, v2, v3…): la más nueva es la vigente y las otras quedan
  como reemplazadas.
- "El que tenés que seguir ahora" lo marca el coach; si nadie lo marcó, es el vigente más reciente.
- El cliente (y su equipo) solo lo ve; lo crea el coach al salir de la llamada, empezando por el
  link de Fathom para que el cliente pueda ver la grabación.
"""

import json
import re
from datetime import date, datetime

from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.models import Admin, ClienteExterno, RoadmapDoc
from src.services.auth_service import es_equipo, persona
from src.services.cuenta_service import foto_de

TIPOS = {"inicial": "Roadmap inicial", "revision": "Revisión mensual", "complementario": "Complementario"}


def _cliente_de(sesion: dict, cliente_id: int | None) -> int:
    if es_equipo(sesion):
        if not cliente_id:
            raise HTTPException(status_code=422, detail="Falta el cliente.")
        return cliente_id
    if cliente_id and cliente_id != sesion["usuario_id"]:
        raise HTTPException(status_code=404, detail="No encontrado.")
    return sesion["usuario_id"]


def _solo_equipo(sesion: dict) -> None:
    if not es_equipo(sesion):
        raise HTTPException(status_code=403, detail="El roadmap lo carga el equipo de ATV.")


def _de(cliente_id: int) -> list[RoadmapDoc]:
    return list(RoadmapDoc.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."roadmap_docs" WHERE cliente_id = $cliente_id ORDER BY fecha, id'))


def _limpiar(datos: dict, parcial: bool = False) -> dict:
    limpio = {}
    if "titulo" in datos or not parcial:
        titulo = " ".join((datos.get("titulo") or "").split())
        if not titulo or len(titulo) > 80:
            raise HTTPException(status_code=422, detail="Poné un título corto, por ejemplo Ventas o Roadmap inicial.")
        limpio["titulo"] = titulo
    if "pasos" in datos:
        pasos = []
        for i, p in enumerate(datos.get("pasos") or []):
            texto = " ".join(str((p or {}).get("texto") or "").split())[:400]
            if texto:
                pasos.append({"id": i + 1, "texto": texto, "quien": "atv" if (p or {}).get("quien") == "atv" else "cliente", "hecho": False})
        if len(pasos) > 30:
            raise HTTPException(status_code=422, detail="Hasta 30 pasos por roadmap.")
        limpio["pasos_json"] = json.dumps(pasos, ensure_ascii=False) if pasos else None
    if "url" in datos or not parcial:
        url = (datos.get("url") or "").strip()
        if url and (not re.match(r"^https?://\S+$", url) or len(url) > 1000):
            raise HTTPException(status_code=422, detail="Revisá el link del documento.")
        limpio["url"] = url or None
        if not url and not limpio.get("pasos_json") and not parcial:
            raise HTTPException(status_code=422, detail="Escribí los próximos pasos o pegá el link del documento.")
    if "fathom_url" in datos:
        f = (datos.get("fathom_url") or "").strip()
        if f and (not re.match(r"^https?://\S+$", f) or len(f) > 1000):
            raise HTTPException(status_code=422, detail="Pegá el link de la grabación de Fathom.")
        limpio["fathom_url"] = f or None
    if "tipo" in datos or not parcial:
        tipo = datos.get("tipo") or "revision"
        if tipo not in TIPOS:
            raise HTTPException(status_code=422, detail="Tipo inválido.")
        limpio["tipo"] = tipo
    if "fecha" in datos or not parcial:
        try:
            limpio["fecha"] = date.fromisoformat(datos["fecha"]) if datos.get("fecha") else date.today()
        except ValueError:
            raise HTTPException(status_code=422, detail="Fecha inválida.")
    for campo in ("pasos_total", "paso_actual"):
        if campo in datos:
            v = datos.get(campo)
            if v is not None and (not isinstance(v, int) or not 0 <= v <= 50):
                raise HTTPException(status_code=422, detail="Los pasos van de 0 a 50.")
            limpio[campo] = v
    if "area" in datos:
        limpio["area"] = (" ".join((datos.get("area") or "").split()) or None)
    if "coach_id" in datos:
        cid = datos.get("coach_id")
        if cid is not None and Admin.get(id=cid) is None:
            raise HTTPException(status_code=422, detail="Ese coach no existe.")
        limpio["coach_id"] = cid
    if "principal" in datos:
        limpio["principal"] = bool(datos.get("principal"))
    if limpio.get("pasos_total") is not None and (limpio.get("paso_actual") or 0) > limpio["pasos_total"]:
        raise HTTPException(status_code=422, detail="El paso actual no puede pasar el total.")
    return limpio


def _pasos(d: RoadmapDoc) -> list[dict]:
    try:
        return json.loads(d.pasos_json) if d.pasos_json else []
    except ValueError:
        return []


def _armar(cliente_id: int) -> dict:
    """El tablero: grupos por coach (en el orden en que entraron), versiones y el documento a seguir."""
    docs = _de(cliente_id)
    admins = {a.id: a for a in list(Admin.select())}
    ultimo_por_hilo: dict[tuple, int] = {}
    numero: dict[int, int] = {}
    cuenta_hilo: dict[tuple, int] = {}
    for d in docs:  # ya vienen por fecha
        hilo = (d.coach_id, d.titulo.lower())
        cuenta_hilo[hilo] = cuenta_hilo.get(hilo, 0) + 1
        numero[d.id] = cuenta_hilo[hilo]
        ultimo_por_hilo[hilo] = d.id

    def doc_dict(d: RoadmapDoc) -> dict:
        hilo = (d.coach_id, d.titulo.lower())
        pasos = _pasos(d)
        return {
            "id": d.id,
            "titulo": d.titulo,
            "version": numero[d.id],
            "versiones": cuenta_hilo[hilo],
            "tipo": d.tipo,
            "tipo_nombre": TIPOS.get(d.tipo, d.tipo),
            "url": d.url,
            "fathom_url": d.fathom_url,
            "fecha": d.fecha.isoformat(),
            "estado": "vigente" if ultimo_por_hilo[hilo] == d.id else "reemplazado",
            # Con pasos escritos, el avance sale de lo tildado; si no, de lo que cargó el coach.
            "pasos": pasos,
            "pasos_total": len(pasos) if pasos else d.pasos_total,
            "paso_actual": sum(1 for p in pasos if p["hecho"]) if pasos else d.paso_actual,
            "principal": d.principal,
            "coach_id": d.coach_id,
            "area": d.area,
        }

    grupos: dict = {}
    for d in docs:
        g = grupos.setdefault(d.coach_id, {"docs": [], "area": None})
        g["docs"].append(doc_dict(d))
        if d.area:
            g["area"] = d.area
    lista = []
    for coach_id, g in grupos.items():
        a = admins.get(coach_id) if coach_id else None
        lista.append(
            {
                "coach": {
                    "id": coach_id,
                    "nombre": (a.nombre or a.email) if a else "Equipo ATV",
                    "foto_url": foto_de("admin", a.id, a.foto_url) if a else None,
                },
                "area": g["area"],
                "docs": g["docs"],
            }
        )
    todos = [x for g in lista for x in g["docs"]]
    vigentes = [x for x in todos if x["estado"] == "vigente"]
    principal = next((x for x in reversed(todos) if x["principal"] and x["estado"] == "vigente"), None) or (
        max(vigentes, key=lambda x: (x["fecha"], x["id"])) if vigentes else None
    )
    c = ClienteExterno.get(id=cliente_id)
    return {
        "cliente": {"id": cliente_id, "nombre": (c.nombre or c.email) if c else "Cliente", "plan": c.plan_actual if c else None},
        "grupos": lista,
        "principal": principal,
        "total": len(todos),
        "vigentes": len(vigentes),
    }


class RoadmapServices:
    def ver(self, sesion: dict, cliente_id: int | None = None) -> dict:
        cid = _cliente_de(sesion, cliente_id)
        with db_session:
            return _armar(cid)

    def crear(self, sesion: dict, cliente_id: int, datos: dict) -> dict:
        _solo_equipo(sesion)
        borrador_id = datos.pop("borrador_id", None)
        mensaje_final = datos.pop("mensaje_final", None)
        enviado = datos.pop("enviado", None)
        with db_session:
            limpio = _limpiar(datos)
            limpio.setdefault("coach_id", sesion["usuario_id"])
            if limpio.get("principal"):
                for d in _de(cliente_id):
                    d.principal = False
            doc = RoadmapDoc(cliente_id=cliente_id, creado_por=sesion["usuario_id"], **limpio)
            doc.flush()
            doc_id = doc.id
            pasos = [{"texto": p["texto"], "quien": p["quien"]} for p in _pasos(doc)]
            titulo = doc.titulo
        if borrador_id:
            from src.services import roadmaps_aprendidos

            roadmaps_aprendidos.registrar_final(
                borrador_id, doc_id, {"titulo": titulo, "pasos": pasos, "mensaje": mensaje_final}, bool(enviado), sesion["usuario_id"]
            )
        with db_session:
            return _armar(cliente_id)

    def editar(self, sesion: dict, doc_id: int, datos: dict) -> dict:
        _solo_equipo(sesion)
        with db_session:
            d = RoadmapDoc.get(id=doc_id)
            if d is None:
                raise HTTPException(status_code=404, detail="No existe ese documento.")
            limpio = _limpiar(datos, parcial=True)
            if "pasos_json" in limpio and limpio["pasos_json"]:
                # Al editar el texto de los pasos, lo que ya estaba tildado sigue tildado.
                antes = {p["texto"]: p for p in _pasos(d)}
                nuevos = json.loads(limpio["pasos_json"])
                for p in nuevos:
                    viejo = antes.get(p["texto"])
                    if viejo and viejo.get("hecho"):
                        p.update(hecho=True, hecho_en=viejo.get("hecho_en"), hecho_por=viejo.get("hecho_por"))
                limpio["pasos_json"] = json.dumps(nuevos, ensure_ascii=False)
            if limpio.get("principal"):
                for otro in _de(d.cliente_id):
                    otro.principal = False
            for k, v in limpio.items():
                setattr(d, k, v)
            if "pasos_json" in limpio or "titulo" in limpio:
                from src.services import roadmaps_aprendidos

                roadmaps_aprendidos.registrar_edicion(d)  # el cerebro también aprende de lo que corrige después
            if d.pasos_total is not None and (d.paso_actual or 0) > d.pasos_total:
                raise HTTPException(status_code=422, detail="El paso actual no puede pasar el total.")
            return _armar(d.cliente_id)

    def borrar(self, sesion: dict, doc_id: int) -> dict:
        _solo_equipo(sesion)
        with db_session:
            d = RoadmapDoc.get(id=doc_id)
            if d is None:
                raise HTTPException(status_code=404, detail="No existe ese documento.")
            cliente_id = d.cliente_id
            d.delete()
            return _armar(cliente_id)

    def marcar_paso(self, sesion: dict, doc_id: int, paso_id: int, hecho: bool) -> dict:
        """Tilda (o destilda) un paso. Lo puede hacer el cliente dueño del roadmap, alguien de su
        equipo o cualquiera del equipo de ATV."""
        with db_session:
            d = RoadmapDoc.get(id=doc_id)
            if d is None or (not es_equipo(sesion) and d.cliente_id != sesion["usuario_id"]):
                raise HTTPException(status_code=404, detail="No existe ese roadmap.")
            pasos = _pasos(d)
            paso = next((p for p in pasos if p["id"] == paso_id), None)
            if paso is None:
                raise HTTPException(status_code=404, detail="No existe ese paso.")
            tipo, quien = persona(sesion)
            paso["hecho"] = bool(hecho)
            paso["hecho_en"] = datetime.utcnow().isoformat(timespec="seconds") + "Z" if hecho else None
            paso["hecho_por"] = {"tipo": tipo, "id": quien, "nombre": sesion.get("nombre")} if hecho else None
            d.pasos_json = json.dumps(pasos, ensure_ascii=False)
            return _armar(d.cliente_id)
