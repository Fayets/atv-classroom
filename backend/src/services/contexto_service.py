"""El contexto del cliente para el coach que toma la próxima 1 a 1 ("pase de guardia").

El Miro dice qué hacer; esto cuenta qué pasó: un timeline con cada llamada, cada roadmap y lo que se
habló en el chat (quién dijo qué), más lo que no puede faltar arriba: si pidió la baja o el reembolso,
qué le prometió ATV y no está hecho, qué quedó de su lado y qué no repetir.

Todo lo arma el código con lo que el cerebro ya guardó (hechos con cita, onboarding, roadmaps). La IA
solo resume cada llamada de Fathom una vez (temas, decisiones y compromisos, con la cita verificada) y
eso queda guardado en la llamada.
"""

import json
import logging
import re
import threading
from collections import OrderedDict
from datetime import datetime, timedelta

from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA
from src.models import Admin, AltaCliente, Canal, ClienteExterno, HechoCerebro, Llamada, MensajeCanal, OnboardingCerebro, PerfilCliente, RoadmapDoc
from src.services import gasto_ia
from src.services.auth_service import es_equipo

logger = logging.getLogger(__name__)

MODELO = config("CONTEXTO_MODEL", default="claude-haiku-5-5")
DIAS = 120  # hasta dónde mira para atrás el timeline
MAX_EVENTOS = 40
_resumiendo = threading.Lock()

# Lo que dice un cliente que se quiere ir: lo detecta el código, no la IA.
_RIESGO = re.compile(
    r"reembols|devoluci[oó]n (de|del) (la plata|dinero|mi (pago|dinero|plata)|lo (que )?pagu)|me devuelvan|devuelvan (la plata|el dinero|mi)|cancelar (mi (inscripci|incorporaci|lugar|plan)|el programa|la mentor)|"
    r"dar(me)? de baja|no (quiero|voy a) (seguir|continuar)|no continuar con el prog|dejar el programa|abandonar el programa|"
    r"no me (est[aá]|va a) (sirviendo|servir)|estafa|me arrepent",
    re.I,
)
_ORDEN_TIPO = {"objecion": 0, "logro": 1, "pedido": 2, "recomendacion": 3, "le_funciono": 4, "no_le_funciono": 5, "dolor": 6, "tema": 7}
# Lo que va en la tarjeta del tablero: lo que dijo el cliente que cambia algo.
_IMPORTANTES = {"objecion", "logro", "pedido", "le_funciono", "no_le_funciono"}
_ETIQUETA = {
    "objecion": "Objeción", "logro": "Logro", "pedido": "Pidió", "recomendacion": "Se le recomendó", "le_funciono": "Le funcionó",
    "no_le_funciono": "No le funcionó", "dolor": "Le duele", "tema": "Tema",
}


def _j(texto, defecto=None):
    try:
        return json.loads(texto) if texto else defecto
    except (TypeError, ValueError):
        return defecto


def _iso(momento) -> str | None:
    if momento is None:
        return None
    if isinstance(momento, datetime):
        return momento.isoformat(timespec="seconds") + "Z"
    return momento.isoformat()


def _norm(t: str) -> str:
    import unicodedata

    t = unicodedata.normalize("NFD", t or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", t)).strip()


# ---------- lo que se habló en cada llamada (IA, una vez por llamada) ----------
_SISTEMA = """Leés la transcripción de una llamada 1 a 1 entre alguien del equipo de ATV (mentoría para creadores y
expertos que venden infoproductos y servicios) y un cliente. Respondés solo con JSON válido. No opinás ni
interpretás: registrás lo que se dijo. Cada cita tiene que estar copiada tal cual de la transcripción."""

_PEDIDO = """Devolvé:
{{"temas": ["de qué se habló, en una línea cada uno"],
 "decisiones": [{{"texto": "qué se decidió", "cita": "fragmento exacto"}}],
 "atv": [{{"texto": "lo que el equipo de ATV se comprometió a hacer o mandar", "cita": "fragmento exacto"}}],
 "cliente": [{{"texto": "lo que el cliente se comprometió a hacer", "cita": "fragmento exacto"}}],
 "inquietudes": [{{"texto": "una duda, queja o preocupación que dijo el CLIENTE", "cita": "fragmento exacto"}}]}}
- Hasta 5 temas, 5 decisiones, 5 de cada compromiso y 4 inquietudes. Si algo no está, lista vacía.
- Textos cortos, en tercera persona. Solo lo que se dijo en la llamada.

Llamada con {cliente} ({coach} de ATV):
{transcripcion}"""


def _llamar(sistema: str, usuario: str) -> dict | None:
    from anthropic import Anthropic

    from src.services.aprendizaje_service import leer_json

    r = Anthropic(api_key=config("ANTHROPIC_API_KEY", default=""), timeout=60).messages.create(
        model=MODELO, max_tokens=1800, thinking={"type": "disabled"}, system=sistema, messages=[{"role": "user", "content": usuario}],
    )
    try:
        gasto_ia.registrar("contexto", r.usage)
    except Exception:
        pass
    return leer_json("".join(b.text for b in r.content if getattr(b, "type", "") == "text"))


def _con_cita_real(items, transcripcion_norm: str) -> list[dict]:
    """Se queda con lo que trae una cita que está de verdad en la transcripción."""
    salida = []
    for it in items or []:
        if not isinstance(it, dict) or not str(it.get("texto") or "").strip():
            continue
        cita = str(it.get("cita") or "").strip()
        if cita and _norm(cita) and _norm(cita) in transcripcion_norm:
            salida.append({"texto": it["texto"].strip()[:240], "cita": cita[:240]})
    return salida


def resumir_llamada(llamada_id: int, llamar=_llamar) -> dict | None:
    """Lo que se habló en la llamada (se calcula una vez y queda guardado)."""
    with db_session:
        ll = Llamada.get(id=llamada_id)
        if ll is None:
            return None
        if ll.puntos_json:
            return _j(ll.puntos_json)
        if not (ll.transcripcion or "").strip():
            return None
        coach = Admin.get(id=ll.admin_id)
        cliente = ClienteExterno.get(id=ll.cliente_id) if ll.cliente_id else None
        transcripcion = ll.transcripcion
        nombres = ((cliente.nombre or "el cliente") if cliente else "el cliente", (coach.nombre or "el coach") if coach else "el coach")
    datos = llamar(_SISTEMA, _PEDIDO.format(cliente=nombres[0], coach=nombres[1], transcripcion=transcripcion[:60000])) or {}
    base = _norm(transcripcion)
    puntos = {
        "temas": [str(t).strip()[:200] for t in (datos.get("temas") or []) if str(t).strip()][:5],
        "decisiones": _con_cita_real(datos.get("decisiones"), base)[:5],
        "atv": _con_cita_real(datos.get("atv"), base)[:5],
        "cliente": _con_cita_real(datos.get("cliente"), base)[:5],
        "inquietudes": _con_cita_real(datos.get("inquietudes"), base)[:4],
    }
    with db_session:
        ll = Llamada.get(id=llamada_id)
        if ll is not None:
            ll.puntos_json = json.dumps(puntos, ensure_ascii=False)
    return puntos


# ---------- el contexto ----------
def _llamadas_de(cliente_id: int) -> list:
    return list(Llamada.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."llamadas" WHERE cliente_id = $cliente_id'))


def _frase(texto: str, patron: re.Pattern) -> str:
    """La oración del mensaje donde aparece lo que matcheó (no el saludo del principio)."""
    m = patron.search(texto)
    if not m:
        return texto.strip()[:220]
    inicio = max(texto.rfind(".", 0, m.start()), texto.rfind("\n", 0, m.start())) + 1
    fin = min([i for i in (texto.find(".", m.end()), texto.find("\n", m.end())) if i != -1] or [len(texto)])
    return " ".join(texto[inicio:fin].split())[:240]


def _nombres_equipo() -> dict[int, str]:
    return {a.id: (a.nombre or a.email).split()[0] if (a.nombre or a.email) else "Equipo" for a in list(Admin.select())}


def _autor(m: MensajeCanal | None, equipo: dict[int, str], cliente: str) -> tuple[str, str]:
    """(tipo, nombre) de quien escribió el mensaje. Los importados de Discord traen el nombre aparte."""
    if m is None:
        return ("cliente", cliente)
    if m.autor_tipo == "cliente":
        return ("cliente", cliente)
    nombre = equipo.get(m.autor_id) if m.autor_id else None
    return ("equipo", nombre or ((m.autor_nombre or "").split()[0] if m.autor_nombre else "Equipo"))


def armar(cliente_id: int, llamar=_llamar, ahora: datetime | None = None) -> dict:
    ahora = ahora or datetime.utcnow()
    desde = ahora - timedelta(days=DIAS)
    with db_session:
        c = ClienteExterno.get(id=cliente_id)
        if c is None:
            raise HTTPException(status_code=404, detail="No existe ese cliente.")
        nombre = (c.nombre or c.email or "Cliente").split()[0]
        equipo = _nombres_equipo()
        perfil = PerfilCliente.get(cliente_id=cliente_id)
        onb = OnboardingCerebro.get(cliente_id=cliente_id)
        ficha = _j(onb.ficha_json, {}) if onb else {}
        # Nada de select(lambda …): Pony no las entiende en Python 3.13.
        alta = next(iter(AltaCliente.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."altas_clientes" WHERE cliente_id = $cliente_id ORDER BY creado_en LIMIT 1')), None)
        canal = Canal.get(cliente_id=cliente_id)
        hechos = list(HechoCerebro.select_by_sql(
            f'SELECT * FROM "{DB_SCHEMA}"."cerebro_hechos" WHERE cliente_id = $cliente_id AND dicho_en >= $desde ORDER BY dicho_en'
        ))
        # Los ids de los mensajes importados de Discord son negativos: van tal cual.
        ids = sorted({int(h.mensaje_id) for h in hechos if h.mensaje_id})
        mensajes = {}
        if ids:
            lista = ",".join(str(i) for i in ids)
            mensajes = {m.id: m for m in MensajeCanal.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."mensajes_canal" WHERE id IN ({lista})')}
        # Lo que dijo el cliente con palabras de irse (aunque el cerebro no lo haya guardado como hecho).
        riesgo_msgs = []
        if canal is not None:
            cid = canal.id
            for m in MensajeCanal.select_by_sql(
                f'SELECT * FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = $cid AND autor_tipo = \'cliente\' AND NOT borrado AND creado_en >= $desde ORDER BY creado_en'
            ):
                if m.texto and _RIESGO.search(m.texto):
                    riesgo_msgs.append(m)
        llamadas = sorted(_llamadas_de(cliente_id), key=lambda x: x.inicio or x.creado_en)
        llamadas_info = [(ll.id, ll.admin_id, ll.inicio or ll.creado_en, ll.duracion_min, ll.share_url or ll.url, bool(ll.puntos_json), bool((ll.transcripcion or "").strip()), ll.titulo) for ll in llamadas]
        docs = list(RoadmapDoc.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."roadmap_docs" WHERE cliente_id = $cliente_id ORDER BY fecha, id'))
        roadmaps = [
            {"id": d.id, "titulo": d.titulo, "fecha": d.fecha, "coach": equipo.get(d.coach_id) if d.coach_id else None, "area": d.area,
             "pasos": [p for p in (_j(d.pasos_json, []) or []) if isinstance(p, dict)], "fathom_url": d.fathom_url, "creado_en": d.creado_en if hasattr(d, "creado_en") else None}
            for d in docs
        ]
        datos_cliente = {
            "id": c.id, "nombre": c.nombre or c.email, "plan": c.plan_actual, "vence": _iso(c.fecha_vencimiento),
            "desde": _iso(alta.creado_en if alta else (onb.respondido_en if onb else None)),
        }
        perfil_d = None if perfil is None else {k: getattr(perfil, k) for k in ("nicho_texto", "que_vende", "etapa", "facturacion", "objetivo", "tono_cliente")}

    # Las llamadas que todavía no se resumieron (una por pedido, para no demorar la apertura).
    pendientes = [i for i, _, _, _, _, tiene, trans, _ in llamadas_info if not tiene and trans]
    puntos_por_llamada = {}
    if pendientes and config("ANTHROPIC_API_KEY", default="") and _resumiendo.acquire(blocking=False):
        try:
            resumir_llamada(pendientes[-1], llamar)
        except Exception:
            logger.exception("Contexto: no se pudo resumir la llamada %s", pendientes[-1])
        finally:
            _resumiendo.release()
    with db_session:
        for ll in _llamadas_de(cliente_id):
            puntos_por_llamada[ll.id] = _j(ll.puntos_json)

    eventos: list[dict] = []
    atendieron: OrderedDict[str, None] = OrderedDict()

    if datos_cliente["desde"]:
        resumen_onb = [v for v in (ficha.get("que_vende") or ficha.get("oferta"), ficha.get("facturacion"), ficha.get("equipo")) if v]
        eventos.append({"tipo": "alta", "fecha": datos_cliente["desde"][:10], "momento": datos_cliente["desde"], "titulo": "Entró a ATV y completó el onboarding" if onb else "Entró a ATV", "quien": None, "items": [x[:220] for x in resumen_onb[:3]]})

    # El chat: una tarjeta por día. En la tarjeta va solo lo que pesa (lo que dijo el cliente: objeciones,
    # logros, pedidos, lo que le funcionó o no); el resto (recomendaciones y temas) queda en el detalle.
    grupos: OrderedDict = OrderedDict()
    for h in hechos:
        if h.mensaje_id == 0:
            continue  # los del onboarding ya están en el alta
        m = mensajes.get(h.mensaje_id)
        tipo_autor, quien = _autor(m, equipo, nombre) if m else (("cliente", nombre) if h.autor_tipo == "cliente" else ("equipo", equipo.get(h.autor_id, "Equipo")))
        if tipo_autor == "equipo":
            atendieron[quien] = None
        grupos.setdefault(h.dicho_en.date(), []).append((h, quien, tipo_autor))
    for dia, filas in grupos.items():
        filas.sort(key=lambda f: (f[2] != "cliente", _ORDEN_TIPO.get(f[0].tipo, 9)))
        destacados = [f for f in filas if f[2] == "cliente" and f[0].tipo in _IMPORTANTES]
        del_equipo = list(OrderedDict.fromkeys(q for _, q, t in filas if t == "equipo"))
        riesgo = any(_RIESGO.search(f"{h.texto} {h.cita}") for h, _, t in filas if t == "cliente")
        eventos.append({
            "tipo": "chat",
            "fecha": dia.isoformat(),
            "momento": _iso(filas[0][0].dicho_en),
            "titulo": f"{nombre} en el chat" if destacados else f"Seguimiento de {', '.join(del_equipo) or 'el equipo'}",
            "quien": ", ".join(del_equipo) or None,
            "de": "cliente" if destacados else "equipo",
            "importante": bool(destacados) or riesgo,
            "destacados": [{"tipo": h.tipo, "etiqueta": _ETIQUETA.get(h.tipo, h.tipo), "texto": h.texto} for h, _, _ in destacados[:3]],
            "items": [
                {"tipo": h.tipo, "etiqueta": _ETIQUETA.get(h.tipo, h.tipo), "texto": h.texto, "cita": h.cita[:200], "quien": q, "de": t}
                for h, q, t in filas[:10]
            ],
            "mas": max(0, len(filas) - 10),
            "riesgo": riesgo,
        })

    for lid, admin_id, inicio, duracion, url, _, _, titulo in llamadas_info:
        quien = equipo.get(admin_id, "Equipo")
        atendieron[quien] = None
        p = puntos_por_llamada.get(lid) or {}
        eventos.append({
            "tipo": "llamada", "fecha": inicio.date().isoformat(), "momento": _iso(inicio), "titulo": f"1 a 1 con {quien}",
            "quien": quien, "duracion": duracion, "url": url, "temas": p.get("temas") or [], "decisiones": p.get("decisiones") or [],
            "inquietudes": p.get("inquietudes") or [], "resumida": bool(p),
        })

    for r in roadmaps:
        if r["coach"]:
            atendieron[r["coach"]] = None
        hechos_rm = sum(1 for p in r["pasos"] if p.get("hecho"))
        eventos.append({
            "tipo": "roadmap", "fecha": r["fecha"].isoformat(), "titulo": f"Roadmap «{r['titulo']}»", "quien": r["coach"], "area": r["area"],
            "hechos": hechos_rm, "total": len(r["pasos"]),
        })

    # Lo más nuevo arriba: es lo que necesita el que agarra la próxima llamada.
    eventos.sort(key=lambda e: (e["fecha"], e.get("momento") or ""), reverse=True)

    # ---------- arriba de todo ----------
    alertas = []
    for m in riesgo_msgs[-2:]:
        alertas.append({"nivel": "rojo", "texto": f"El {m.creado_en.strftime('%d/%m')} habló de irse o de pedir la plata", "cita": _frase(m.texto, _RIESGO), "fecha": _iso(m.creado_en)})
    dias_riesgo = {m.creado_en.date() for m in riesgo_msgs}
    objeciones = [h for h in hechos if h.tipo == "objecion" and h.autor_tipo == "cliente" and h.dicho_en >= ahora - timedelta(days=45)]
    for h in objeciones[-2:]:
        if h.dicho_en.date() in dias_riesgo:
            continue  # es el mismo mensaje que ya está arriba en rojo
        alertas.append({"nivel": "ambar", "texto": h.texto, "cita": h.cita[:220], "fecha": _iso(h.dicho_en)})
    for ll_id, p in puntos_por_llamada.items():
        for q in ((p or {}).get("inquietudes") or [])[:1]:
            alertas.append({"nivel": "ambar", "texto": q["texto"], "cita": q["cita"], "fecha": None, "fuente": "llamada"})

    # Promesas: los pasos sin tildar del roadmap más nuevo y lo que quedó dicho en la última llamada.
    ultimo = roadmaps[-1] if roadmaps else None
    debe_atv = [{"texto": p.get("texto"), "desde": ultimo["fecha"].isoformat(), "fuente": f"Roadmap de {ultimo['coach'] or 'ATV'}"} for p in (ultimo["pasos"] if ultimo else []) if p.get("quien") == "atv" and not p.get("hecho")]
    debe_cliente = [{"texto": p.get("texto"), "desde": ultimo["fecha"].isoformat(), "fuente": "Roadmap"} for p in (ultimo["pasos"] if ultimo else []) if p.get("quien") != "atv" and not p.get("hecho")]
    if llamadas_info:
        ult_id, ult_admin, ult_inicio = llamadas_info[-1][0], llamadas_info[-1][1], llamadas_info[-1][2]
        if not ultimo or ult_inicio.date() > ultimo["fecha"]:
            p = puntos_por_llamada.get(ult_id) or {}
            debe_atv += [{"texto": x["texto"], "desde": ult_inicio.date().isoformat(), "fuente": f"Llamada con {equipo.get(ult_admin, 'ATV')}"} for x in p.get("atv") or []]
            debe_cliente += [{"texto": x["texto"], "desde": ult_inicio.date().isoformat(), "fuente": "Llamada"} for x in p.get("cliente") or []]

    no_repetir = [{"texto": h.texto, "cita": h.cita[:200]} for h in hechos if h.tipo == "no_le_funciono"][-4:]
    abrir = [p["texto"] for p in debe_cliente[:3]]

    return {
        "cliente": {**datos_cliente, "perfil": perfil_d, "atendieron": list(atendieron)},
        "alertas": alertas[:4],
        "debe_atv": debe_atv[:6],
        "debe_cliente": debe_cliente[:6],
        "no_repetir": no_repetir,
        "para_abrir": abrir,
        "roadmap": None if not ultimo else {"titulo": ultimo["titulo"], "hechos": sum(1 for p in ultimo["pasos"] if p.get("hecho")), "total": len(ultimo["pasos"])},
        "eventos": eventos[:MAX_EVENTOS],
        "llamadas_sin_resumir": max(0, len(pendientes) - 1),
    }


class ContextoServices:
    def de_cliente(self, sesion: dict, cliente_id: int) -> dict:
        if not es_equipo(sesion):
            raise HTTPException(status_code=403, detail="Solo el equipo.")
        return armar(cliente_id)
