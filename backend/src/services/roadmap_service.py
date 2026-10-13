"""El roadmap del cliente, como un tablero de Miro: una tarjeta por coach con sus documentos.

Cada documento es el Google Doc de próximos pasos que deja un coach después de una llamada.
- Mismo coach + mismo título = versiones (v1, v2, v3…): la más nueva es la vigente y las otras quedan
  como reemplazadas.
- "El que tenés que seguir ahora" lo marca el coach; si nadie lo marcó, es el vigente más reciente.
- El cliente (y su equipo) solo lo ve; lo carga el equipo de ATV. Para no empezar de cero, se le
  sugieren los Google Docs que ya mandó por el chat.
"""

import re
from datetime import date

from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.models import Admin, Canal, ClienteExterno, RoadmapDoc
from src.services.auth_service import es_equipo
from src.services.cuenta_service import foto_de

TIPOS = {"inicial": "Roadmap inicial", "revision": "Revisión mensual", "complementario": "Complementario"}
_DOC = re.compile(r"https?://docs\.google\.com/(?:document|spreadsheets|presentation)/d/([\w-]{20,})[^\s<>)\"']*", re.I)


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
    if "url" in datos or not parcial:
        url = (datos.get("url") or "").strip()
        if not re.match(r"^https?://\S+$", url) or len(url) > 1000:
            raise HTTPException(status_code=422, detail="Pegá el link del documento.")
        limpio["url"] = url
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
        return {
            "id": d.id,
            "titulo": d.titulo,
            "version": numero[d.id],
            "versiones": cuenta_hilo[hilo],
            "tipo": d.tipo,
            "tipo_nombre": TIPOS.get(d.tipo, d.tipo),
            "url": d.url,
            "fecha": d.fecha.isoformat(),
            "estado": "vigente" if ultimo_por_hilo[hilo] == d.id else "reemplazado",
            "pasos_total": d.pasos_total,
            "paso_actual": d.paso_actual,
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
        with db_session:
            limpio = _limpiar(datos)
            limpio.setdefault("coach_id", sesion["usuario_id"])
            if limpio.get("principal"):
                for d in _de(cliente_id):
                    d.principal = False
            RoadmapDoc(cliente_id=cliente_id, creado_por=sesion["usuario_id"], mensaje_id=datos.get("mensaje_id"), **limpio)
            return _armar(cliente_id)

    def editar(self, sesion: dict, doc_id: int, datos: dict) -> dict:
        _solo_equipo(sesion)
        with db_session:
            d = RoadmapDoc.get(id=doc_id)
            if d is None:
                raise HTTPException(status_code=404, detail="No existe ese documento.")
            limpio = _limpiar(datos, parcial=True)
            if limpio.get("principal"):
                for otro in _de(d.cliente_id):
                    otro.principal = False
            for k, v in limpio.items():
                setattr(d, k, v)
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

    def sugeridos(self, sesion: dict, cliente_id: int) -> list[dict]:
        """Google Docs que el equipo ya le mandó por el chat y todavía no están en el roadmap."""
        _solo_equipo(sesion)
        with db_session:
            canal = Canal.get(cliente_id=cliente_id)
            if canal is None:
                return []
            ya = {m.group(1) for d in _de(cliente_id) for m in [_DOC.search(d.url)] if m}
            filas = db.select(
                f'SELECT id, autor_id, autor_nombre, texto, creado_en FROM "{DB_SCHEMA}"."mensajes_canal" '
                "WHERE canal = $canal AND autor_tipo = 'admin' AND NOT borrado AND texto ILIKE '%docs.google.com%' "
                "ORDER BY creado_en DESC LIMIT 200",
                {"canal": canal.id},
            )
            admins = {a.id: a for a in list(Admin.select())}
            vistos, salida = set(), []
            for mid, autor_id, autor_nombre, texto, creado in filas:
                for m in _DOC.finditer(texto or ""):
                    doc_id = m.group(1)
                    if doc_id in ya or doc_id in vistos:
                        continue
                    vistos.add(doc_id)
                    a = admins.get(autor_id)
                    resto = " ".join(_DOC.sub("", texto).split())
                    salida.append(
                        {
                            "url": m.group(0).rstrip(".,;"),
                            "fecha": creado.date().isoformat(),
                            "coach_id": autor_id if a else None,
                            "coach_nombre": (a.nombre or a.email) if a else (autor_nombre or "Equipo"),
                            "mensaje_id": mid,
                            "extracto": resto[:180],
                        }
                    )
            return salida[:20]

