"""La Biblioteca: todo lo que el cerebro aprendió de cada nicho, para que el equipo lo consulte.

Junta en un solo lugar lo que ya existe por separado: la base por nicho (dolores, objeciones,
recomendaciones, lo que funcionó y lo que no, con la cita del cliente), las ofertas y precios que
contaron en el onboarding y los roadmaps de los clientes del nicho con los pasos que se cumplieron.
No llama a ninguna IA: solo lee y agrupa. Se arma una vez cada pocos minutos.
"""

import json
import threading
import time

from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA
from src.models import Admin, Canal, ClienteExterno, OnboardingCerebro, RoadmapAprendido, RoadmapDoc

_TTL = 120
_cache: dict = {"t": 0.0, "datos": None}
_armando = threading.Lock()


def _j(texto, defecto=None):
    try:
        return json.loads(texto) if texto else defecto
    except (TypeError, ValueError):
        return defecto


def _roadmaps(clientes: dict[int, str]) -> dict[int, list[dict]]:
    """Por cliente: sus roadmaps con pasos, cuántos se cumplieron y lo que pasó en la llamada siguiente."""
    if not clientes:
        return {}
    ids = ",".join(str(i) for i in clientes)
    docs = list(RoadmapDoc.select_by_sql(
        f'SELECT * FROM "{DB_SCHEMA}"."roadmap_docs" WHERE cliente_id IN ({ids}) AND pasos_json IS NOT NULL ORDER BY fecha DESC, id DESC'
    ))
    resultados = {r.doc_id: _j(r.resultado_json) for r in list(RoadmapAprendido.select()) if r.doc_id and r.resultado_json}
    coaches = {a.id: (a.nombre or a.email) for a in list(Admin.select())}
    salida: dict[int, list[dict]] = {}
    for d in docs:
        pasos = [p for p in (_j(d.pasos_json, []) or []) if isinstance(p, dict)]
        if not pasos:
            continue
        salida.setdefault(d.cliente_id, []).append({
            "id": d.id,
            "titulo": d.titulo,
            "fecha": d.fecha.isoformat(),
            "cliente": clientes[d.cliente_id],
            "coach": coaches.get(d.coach_id),
            "total": len(pasos),
            "hechos": sum(1 for p in pasos if p.get("hecho")),
            "cumplidos": [p.get("texto") for p in pasos if p.get("hecho") and p.get("texto")][:6],
            "resultado": resultados.get(d.id),
        })
    return salida


def _armar() -> dict:
    from src.services.aprendizaje_service import por_nicho
    from src.services.cerebro_service import nombre_nicho

    grupos = por_nicho()
    ids = {c["id"] for g in grupos for c in g["clientes"]}
    with db_session:
        fichas = {o.cliente_id: _j(o.ficha_json, {}) or {} for o in list(OnboardingCerebro.select()) if o.cliente_id in ids}
        externos = {c.id: c for c in list(ClienteExterno.select()) if c.id in ids}
        canales = {c.cliente_id: c.id for c in list(Canal.select()) if c.cliente_id in ids and c.tipo == "cliente"}
        nombres = {i: (externos[i].nombre or externos[i].email) if i in externos else "Cliente" for i in ids}
        roadmaps = _roadmaps(nombres)

    def armar(g: dict) -> dict:
        """Una página de la Biblioteca: la de un nicho o la de uno de sus subnichos (misma forma)."""
        clientes, ofertas, rms = [], [], []
        for c in g["clientes"]:
            cid = c["id"]
            ficha = fichas.get(cid)
            ext = externos.get(cid)
            clientes.append({
                "id": cid,
                "nombre": nombres.get(cid),
                "que_vende": c.get("que_vende"),
                "subnicho": c.get("subnicho"),
                "etapa": c.get("etapa"),
                "plan": ext.plan_actual if ext else None,
                "onboarding": ficha is not None,
                "canal_id": canales.get(cid),
            })
            if ficha and (ficha.get("oferta") or ficha.get("precio")):
                ofertas.append({
                    "cliente": nombres.get(cid),
                    "oferta": ficha.get("que_vende") or ficha.get("oferta"),
                    "precio": ficha.get("precio"),
                    "factura": ficha.get("facturacion"),
                    "objetivo": ficha.get("objetivo"),
                })
            rms.extend(roadmaps.get(cid, []))
        # Primero los que más avanzaron: son los que enseñan algo.
        rms.sort(key=lambda r: (r["hechos"] / r["total"], r["fecha"]), reverse=True)
        clientes.sort(key=lambda c: (not c["onboarding"], (c["nombre"] or "").lower()))
        return {
            "clientes": clientes,
            "dolores": g["dolores"],
            "recomendaciones": g["recomendaciones"],
            "objeciones": g["objeciones"],
            "funciono": g["le_funciono"],
            "no_funciono": g["no_le_funciono"],
            "ofertas": ofertas,
            "roadmaps": rms[:12],
        }

    nichos = []
    for g in grupos:
        nichos.append({
            "slug": g["nicho"],
            "nombre": nombre_nicho(g["nicho"]),
            **armar(g),
            "subnichos": [{"nombre": sg["subnicho"], **armar(sg)} for sg in g.get("subnichos", [])],
        })
    return {"nichos": nichos, "armado_en": int(time.time())}


class BibliotecaServices:
    def listar(self, sesion: dict) -> dict:
        from src.services.auth_service import es_equipo

        if not es_equipo(sesion):
            raise HTTPException(status_code=403, detail="Solo el equipo.")
        if _cache["datos"] is None or time.time() - _cache["t"] > _TTL:
            with _armando:
                if _cache["datos"] is None or time.time() - _cache["t"] > _TTL:
                    _cache["datos"] = _armar()
                    _cache["t"] = time.time()
        return _cache["datos"]
