"""El cerebro de los roadmaps: guarda cada borrador de la IA, cómo lo corrigió el coach y qué
resultado dio, y con eso arma el contexto para que el próximo borrador salga mejor.

- Las correcciones las compara el código (no el modelo): pasos que el coach sacó, agregó o
  reescribió, si cambió quién lo hace, el título y cuánto cambió el mensaje.
- Los resultados salen de dos lados: lo que el cliente tildó en su roadmap y lo que dijo en la
  llamada siguiente (al armar ese roadmap, la IA revisa los pasos del anterior).
"""

import json
from datetime import datetime
from difflib import SequenceMatcher

from pony.orm import db_session

from src.db import DB_SCHEMA
from src.models import Admin, ClienteExterno, RoadmapAprendido, RoadmapDoc

ESTADOS = ("hecho", "parcial", "no_hecho", "no_se_hablo")
_PARECIDO = 0.55  # un paso del final que se parece tanto a uno del borrador es "reescrito", no "nuevo"


def _parecido(a: str, b: str) -> float:
    return SequenceMatcher(None, (a or "").lower(), (b or "").lower()).ratio()


def comparar(borrador: dict, final: dict) -> dict:
    """Qué corrigió el coach entre el borrador de la IA y lo que guardó."""
    pb = [p for p in borrador.get("pasos") or [] if p.get("texto")]
    pf = [p for p in final.get("pasos") or [] if p.get("texto")]
    usados, iguales, reescritos, agregados, quien = set(), 0, [], [], []
    for p in pf:
        mejor, idx = 0.0, None
        for i, q in enumerate(pb):
            if i in usados:
                continue
            r = _parecido(p["texto"], q["texto"])
            if r > mejor:
                mejor, idx = r, i
        if idx is not None and mejor >= _PARECIDO:
            usados.add(idx)
            q = pb[idx]
            if p["texto"].strip() == q["texto"].strip():
                iguales += 1
            else:
                reescritos.append({"antes": q["texto"], "despues": p["texto"]})
            if p.get("quien") != q.get("quien"):
                quien.append({"texto": p["texto"], "antes": q.get("quien"), "despues": p.get("quien")})
        else:
            agregados.append(p["texto"])
    sacados = [q["texto"] for i, q in enumerate(pb) if i not in usados]
    mensaje = round(_parecido(borrador.get("mensaje") or "", final.get("mensaje") or ""), 2) if final.get("mensaje") is not None else None
    return {
        "iguales": iguales,
        "reescritos": reescritos,
        "agregados": agregados,
        "sacados": sacados,
        "quien": quien,
        "titulo": {"antes": borrador.get("titulo"), "despues": final.get("titulo")} if (final.get("titulo") or "") != (borrador.get("titulo") or "") else None,
        "mensaje_parecido": mensaje,  # 1 = lo mandó tal cual
        "sin_cambios": not (reescritos or agregados or sacados or quien) and (mensaje is None or mensaje > 0.97),
    }


def _j(texto, defecto=None):
    try:
        return json.loads(texto) if texto else defecto
    except ValueError:
        return defecto


# ---------------------------------------------------------------- registrar

def registrar_borrador(cliente_id: int, coach_id: int, voz_id: int | None, borrador: dict, transcripcion: str, fathom_url: str | None) -> int:
    with db_session:
        r = RoadmapAprendido(
            cliente_id=cliente_id, coach_id=coach_id, voz_id=voz_id, fathom_url=fathom_url or None,
            transcripcion=transcripcion, borrador_json=json.dumps(borrador, ensure_ascii=False),
        )
        r.flush()
        return r.id


def registrar_final(borrador_id: int, doc_id: int, final: dict, enviado: bool, coach_id: int) -> None:
    """Al guardar el roadmap: lo que quedó, qué cambió y, si el borrador traía el seguimiento del
    roadmap anterior, ese resultado queda en el anterior."""
    with db_session:
        r = RoadmapAprendido.get(id=borrador_id)
        if r is None or r.coach_id != coach_id or r.doc_id is not None:
            return
        borrador = _j(r.borrador_json, {})
        r.doc_id, r.enviado, r.guardado_en = doc_id, bool(enviado), datetime.utcnow()
        r.final_json = json.dumps(final, ensure_ascii=False)
        r.cambios_json = json.dumps(comparar(borrador, final), ensure_ascii=False)
        seguimiento = borrador.get("seguimiento") or {}
        anterior = RoadmapAprendido.get(doc_id=seguimiento.get("doc_id")) if seguimiento.get("doc_id") else None
        if anterior is not None and seguimiento.get("pasos"):
            anterior.resultado_json = json.dumps(seguimiento["pasos"], ensure_ascii=False)
            anterior.resultado_en = datetime.utcnow()


def registrar_edicion(doc: RoadmapDoc) -> None:
    """El coach editó un roadmap ya guardado (dentro de una db_session abierta): también se aprende."""
    r = RoadmapAprendido.get(doc_id=doc.id)
    if r is None:
        return
    final = _j(r.final_json, {}) or {}
    final.update(titulo=doc.titulo, pasos=[{"texto": p["texto"], "quien": p["quien"]} for p in _j(doc.pasos_json, [])])
    r.final_json = json.dumps(final, ensure_ascii=False)
    r.cambios_json = json.dumps(comparar(_j(r.borrador_json, {}), final), ensure_ascii=False)
    r.editado_despues = True


# ---------------------------------------------------------------- usar lo aprendido

def anterior_del_cliente(cliente_id: int) -> dict | None:
    """El último roadmap con pasos del cliente, con lo que tildó: la próxima llamada lo revisa."""
    with db_session:
        docs = list(RoadmapDoc.select_by_sql(
            f'SELECT * FROM "{DB_SCHEMA}"."roadmap_docs" WHERE cliente_id = $cliente_id AND pasos_json IS NOT NULL ORDER BY fecha DESC, id DESC LIMIT 1'
        ))
        if not docs:
            return None
        d = docs[0]
        return {"doc_id": d.id, "titulo": d.titulo, "fecha": d.fecha.isoformat(), "pasos": _j(d.pasos_json, [])}


def contexto(coach_id: int, cliente_id: int, nicho: str | None) -> dict:
    """Lo que la IA tiene que tener en cuenta para el próximo borrador de este coach."""
    from src.services.aprendizaje_service import perfil_de

    with db_session:
        mios = list(RoadmapAprendido.select_by_sql(
            f'SELECT * FROM "{DB_SCHEMA}"."cerebro_roadmaps" WHERE coach_id = $coach_id AND final_json IS NOT NULL ORDER BY guardado_en DESC LIMIT 12'
        ))
        ejemplos = [_j(r.final_json, {}) for r in mios[:3]]
        sacados, agregados, reescritos = [], [], []
        for r in mios:
            c = _j(r.cambios_json, {}) or {}
            sacados += c.get("sacados") or []
            agregados += c.get("agregados") or []
            reescritos += c.get("reescritos") or []
        con_resultado = list(RoadmapAprendido.select_by_sql(
            f'SELECT * FROM "{DB_SCHEMA}"."cerebro_roadmaps" WHERE resultado_json IS NOT NULL AND cliente_id <> $cliente_id ORDER BY resultado_en DESC LIMIT 60'
        ))
    funciono = []
    for r in con_resultado:
        if nicho and ((perfil_de(r.cliente_id).get("perfil") or {}).get("nicho") != nicho):
            continue
        for p in _j(r.resultado_json, []) or []:
            if p.get("estado") == "hecho" and p.get("resultado"):
                funciono.append({"paso": p.get("paso"), "resultado": p["resultado"]})
    return {
        "ejemplos": ejemplos,
        "sacados": sacados[:8],
        "agregados": agregados[:8],
        "reescritos": reescritos[:6],
        "funciono": funciono[:8],
    }


def texto_para_prompt(ctx: dict, coach: str) -> str:
    """El contexto aprendido, como instrucciones concretas (vacío si todavía no hay nada)."""
    partes = []
    if ctx.get("ejemplos"):
        bloques = []
        for e in ctx["ejemplos"]:
            pasos = "\n".join(f"  - {p['texto']}" + (" (ATV)" if p.get("quien") == "atv" else "") for p in e.get("pasos") or [])
            bloques.append(f"Título: {e.get('titulo')}\nPasos:\n{pasos}\nMensaje: {e.get('mensaje') or '(no se mandó)'}")
        partes.append(f"Así quedaron los últimos roadmaps de {coach} después de corregirlos (es el estilo a seguir):\n" + "\n---\n".join(bloques))
    if ctx.get("sacados"):
        partes.append(f"Pasos que {coach} SACÓ de borradores anteriores (no propongas cosas así):\n" + "\n".join(f"- {s}" for s in ctx["sacados"]))
    if ctx.get("agregados"):
        partes.append(f"Pasos que {coach} AGREGÓ porque faltaban (fijate si aplica algo así):\n" + "\n".join(f"- {s}" for s in ctx["agregados"]))
    if ctx.get("reescritos"):
        partes.append(f"Cómo {coach} reescribe los pasos:\n" + "\n".join(f"- «{r['antes']}» → «{r['despues']}»" for r in ctx["reescritos"]))
    if ctx.get("funciono"):
        partes.append("Pasos que dieron resultado con clientes parecidos:\n" + "\n".join(f"- {f['paso']} → {f['resultado']}" for f in ctx["funciono"]))
    return "\n\n".join(partes)


# ---------------------------------------------------------------- para el Cerebro

def de_cliente(cliente_id: int) -> list[dict]:
    """Los roadmaps del cliente con su avance y lo que pasó con cada paso."""
    with db_session:
        docs = list(RoadmapDoc.select_by_sql(
            f'SELECT * FROM "{DB_SCHEMA}"."roadmap_docs" WHERE cliente_id = $cliente_id AND pasos_json IS NOT NULL ORDER BY fecha DESC, id DESC'
        ))
        salida = []
        for d in docs:
            pasos = _j(d.pasos_json, [])
            r = RoadmapAprendido.get(doc_id=d.id)
            coach = Admin.get(id=d.coach_id) if d.coach_id else None
            salida.append({
                "titulo": d.titulo,
                "fecha": d.fecha.isoformat(),
                "coach": (coach.nombre or coach.email) if coach else None,
                "hechos": sum(1 for p in pasos if p.get("hecho")),
                "total": len(pasos),
                "resultado": _j(r.resultado_json, None) if r else None,
            })
        return salida


def de_coach(admin_id: int) -> dict | None:
    """Cómo arma sus roadmaps: cuántos, cuánto corrige y qué tan bien se cumplen."""
    with db_session:
        filas = list(RoadmapAprendido.select_by_sql(
            f'SELECT * FROM "{DB_SCHEMA}"."cerebro_roadmaps" WHERE coach_id = $admin_id ORDER BY creado_en DESC'
        ))
        if not filas:
            return None
        guardados = [r for r in filas if r.final_json]
        cambios = [_j(r.cambios_json, {}) or {} for r in guardados]
        hechos = total = 0
        for r in guardados:
            d = RoadmapDoc.get(id=r.doc_id) if r.doc_id else None
            pasos = _j(d.pasos_json, []) if d else []
            hechos += sum(1 for p in pasos if p.get("hecho"))
            total += len(pasos)
        ultimos = []
        for r, c in zip(guardados[:5], cambios[:5]):
            cli = ClienteExterno.get(id=r.cliente_id)
            ultimos.append({
                "cliente": (cli.nombre or cli.email) if cli else "Cliente",
                "sin_cambios": c.get("sin_cambios"),
                "sacados": c.get("sacados") or [],
                "agregados": c.get("agregados") or [],
                "reescritos": c.get("reescritos") or [],
            })
        return {
            "borradores": len(filas),
            "guardados": len(guardados),
            "enviados": sum(1 for r in guardados if r.enviado),
            "sin_cambios": sum(1 for c in cambios if c.get("sin_cambios")),
            "pasos_sacados": sum(len(c.get("sacados") or []) for c in cambios),
            "pasos_agregados": sum(len(c.get("agregados") or []) for c in cambios),
            "pasos_reescritos": sum(len(c.get("reescritos") or []) for c in cambios),
            "cumplimiento": round(100 * hechos / total) if total else None,
            "ultimos": ultimos,
        }
