"""El contexto del cliente para el coach que toma la próxima 1 a 1 ("pase de guardia").

En 10 segundos: dónde está el cliente, qué le falta entregar, qué le debemos y qué se trabó. Arriba lo
pendiente (compromisos con su estado); abajo el historial, solo con lo que cambia el estado del cliente:
entró, se reunió, recibió o completó un roadmap, un logro, una objeción, un compromiso, un silencio o la
migración del Discord. La coordinación de agenda no es historia: queda adentro de la llamada.

Todo lo arma el código con lo que el cerebro ya guardó (hechos con cita, onboarding, roadmaps). La IA
solo resume cada llamada de Fathom una vez (temas, decisiones y compromisos, con la cita verificada) y
eso queda guardado en la llamada.
"""

import json
import logging
import re
import threading
from collections import OrderedDict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.models import Admin, AltaCliente, Canal, CierreCompromiso, ClienteExterno, HechoCerebro, Llamada, MensajeCanal, OnboardingCerebro, PerfilCliente, RoadmapDoc
from src.services import gasto_ia
from src.services.auth_service import es_equipo

logger = logging.getLogger(__name__)

MODELO = config("CONTEXTO_MODEL", default="claude-haiku-5-5")
DIAS = 120  # hasta dónde mira para atrás el timeline
_resumiendo = threading.Lock()

# Lo que dice un cliente que se quiere ir: lo detecta el código, no la IA.
_RIESGO = re.compile(
    r"reembols|devoluci[oó]n (de|del) (la plata|dinero|mi (pago|dinero|plata)|lo (que )?pagu)|me devuelvan|devuelvan (la plata|el dinero|mi)|cancelar (mi (inscripci|incorporaci|lugar|plan)|el programa|la mentor)|"
    r"dar(me)? de baja|no (quiero|voy a) (seguir|continuar)|no continuar con el prog|dejar el programa|abandonar el programa|"
    r"no me (est[aá]|va a) (sirviendo|servir)|estafa|me arrepent",
    re.I,
)


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


# ---------- reglas de la vista (sin IA) ----------
_AR = ZoneInfo("America/Argentina/Buenos_Aires")
_UTC = ZoneInfo("UTC")
SILENCIO_DIAS = 7  # tantos días sin mensaje del cliente ni llamada = "se quedó callado"
VENTANA_TRABADO = 30  # los vencidos más viejos quedan en el historial, no arriba
PEDIDOS_SIN_FECHA_DIAS = 30  # pedidos a ATV sin plazo que siguen en "Lo que le debe ATV"

# Coordinar una reunión no es historia del cliente: la reunión es el evento.
_AGENDA = re.compile(r"reuni|llamad|horario|agend|reprogram|posterg|almuerzo|a las \d|meet\.google|zoom\.us|calendly", re.I)
# Con plazo, "a las 3" o "después del almuerzo" no lo vuelven agenda; hablar de la reunión misma sí.
_REUNION = re.compile(r"reuni|llamad|horario|agend|reprogram|posterg|meet\.google|zoom\.us|calendly", re.I)
# El extractor escribe "se compromete" cuando la promesa es del cliente y no un pedido a ATV.
_PROMETE = re.compile(r"\bse compromet|\bva a (mandar|enviar|pasar)|\bmandar[aá]\b|\benviar[aá]\b", re.I)
_SEMANA = {"lunes": 0, "martes": 1, "miercoles": 2, "jueves": 3, "viernes": 4, "sabado": 5, "domingo": 6}
_NUMEROS = {"un": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5}
_VACIAS = set("que con para por una uno los las del sus como pero mas este esta esto eso ese sobre entre hacer tiene cliente equipo pide quiere".split())


def _dia(momento) -> date:
    """El día en Argentina (en la base las horas están en UTC)."""
    if isinstance(momento, datetime):
        return momento.replace(tzinfo=_UTC).astimezone(_AR).date() if momento.tzinfo is None else momento.astimezone(_AR).date()
    return momento


def _sin_tildes(t: str) -> str:
    import unicodedata

    return unicodedata.normalize("NFD", t or "").encode("ascii", "ignore").decode().lower()


def plazo_de(texto: str, dicho: date) -> date | None:
    """La fecha límite que trae el texto, relativa al día en que se dijo. Lo que no reconoce: sin plazo."""
    t = _sin_tildes(texto)
    m = re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", t)
    if m:
        dia, mes, anio = int(m.group(1)), int(m.group(2)), m.group(3)
        try:
            if anio:
                return date(int(anio) + (2000 if len(anio) == 2 else 0), mes, dia)
            f = date(dicho.year, mes, dia)
            return f if f >= dicho else date(dicho.year + 1, mes, dia)
        except ValueError:
            return None
    if re.search(r"\bpasado manana\b", t):
        return dicho + timedelta(days=2)
    if re.search(r"(?<!la )\bmanana\b", t):  # "por la mañana" es un horario, no un plazo
        return dicho + timedelta(days=1)
    if re.search(r"\besta semana\b", t):
        return dicho + timedelta(days=6 - dicho.weekday())
    if re.search(r"\b(la semana que viene|la proxima semana|la semana proxima)\b", t):
        return dicho + timedelta(days=13 - dicho.weekday())
    m = re.search(r"\ben (\d+|un|una|dos|tres|cuatro|cinco) (dias?|semanas?)\b", t)
    if m:
        n = int(m.group(1)) if m.group(1).isdigit() else _NUMEROS[m.group(1)]
        return dicho + timedelta(days=n * (7 if m.group(2).startswith("semana") else 1))
    if re.search(r"\bfin de mes\b", t):
        siguiente = date(dicho.year + (dicho.month == 12), dicho.month % 12 + 1, 1)
        return siguiente - timedelta(days=1)
    m = re.search(r"\bantes del (\d{1,2})\b", t)
    if m:
        try:
            f = date(dicho.year, dicho.month, int(m.group(1)))
            return f if f >= dicho else date(dicho.year + (dicho.month == 12), dicho.month % 12 + 1, int(m.group(1)))
        except ValueError:
            return None
    m = re.search(r"(?<!los )\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b", t)
    if m:
        # Siempre la próxima ocurrencia estricta: "el viernes" dicho un viernes es el de la semana siguiente.
        return dicho + timedelta(days=((_SEMANA[m.group(1)] - dicho.weekday()) % 7) or 7)
    return None


def _palabras(t: str) -> set[str]:
    return {w for w in _norm(t).split() if len(w) >= 3 and w not in _VACIAS}


def similitud(a: str, b: str) -> float:
    pa, pb = _palabras(a), _palabras(b)
    return len(pa & pb) / min(len(pa), len(pb)) if pa and pb else 0.0


def silencios(senales: set[date], hoy: date) -> list[dict]:
    """Tramos de SILENCIO_DIAS o más sin mensaje del cliente ni llamada (el último puede seguir abierto)."""
    dias = sorted(senales)
    salida = []
    for a, b in zip(dias, dias[1:]):
        if (b - a).days >= SILENCIO_DIAS:
            salida.append({"desde": a, "dias": (b - a).days, "abierto": False})
    if dias and (hoy - dias[-1]).days >= SILENCIO_DIAS:
        salida.append({"desde": dias[-1], "dias": (hoy - dias[-1]).days, "abierto": True})
    return salida


def estado_compromiso(c: dict, hoy: date) -> str:
    if c.get("cerrado"):
        return "cerrado"
    if c.get("plazo") and c["plazo"] < hoy:
        return "vencido"
    return "abierto"


def en_panel(c: dict, hoy: date) -> bool:
    """Arriba (Trabado y paneles) va lo abierto y lo vencido hace poco; lo vencido viejo queda en el historial."""
    return c["estado"] == "abierto" or (c["estado"] == "vencido" and (hoy - c["plazo"]).days <= VENTANA_TRABADO)


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


def _paso_hecho_en(p: dict) -> date | None:
    try:
        return _dia(datetime.fromisoformat(str(p.get("hecho_en")).replace("Z", "+00:00")))
    except (TypeError, ValueError):
        return None


def armar(cliente_id: int, llamar=_llamar, ahora: datetime | None = None) -> dict:
    ahora = ahora or datetime.utcnow()
    hoy = _dia(ahora)
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
        riesgo_msgs, dias_cliente, ultimo_cliente, del_equipo, migracion = [], set(), None, [], None
        if canal is not None:
            cid = canal.id
            for m in MensajeCanal.select_by_sql(
                f'SELECT * FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = $cid AND autor_tipo = \'cliente\' AND NOT borrado AND creado_en >= $desde ORDER BY creado_en'
            ):
                dias_cliente.add(_dia(m.creado_en))
                ultimo_cliente = m.creado_en
                if m.texto and _RIESGO.search(m.texto):
                    riesgo_msgs.append(m)
            del_equipo = [int(x) for x in db.select(
                f'SELECT DISTINCT autor_id FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = $cid AND autor_tipo = \'admin\' AND autor_id > 0 AND NOT borrado AND creado_en >= $desde'
            )]
            # Pasó del Discord al classroom: tiene mensajes importados (id < 0) y propios (id > 0).
            fila = db.select(
                f'SELECT bool_or(id < 0), min(creado_en) FILTER (WHERE id > 0) FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = $cid AND NOT borrado'
            )
            if fila and fila[0][0] and fila[0][1]:
                migracion = fila[0][1]
        llamadas = sorted(_llamadas_de(cliente_id), key=lambda x: x.inicio or x.creado_en)
        llamadas_info = [(ll.id, ll.admin_id, ll.inicio or ll.creado_en, ll.duracion_min, ll.share_url or ll.url, bool(ll.puntos_json), bool((ll.transcripcion or "").strip()), ll.titulo) for ll in llamadas]
        docs = list(RoadmapDoc.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."roadmap_docs" WHERE cliente_id = $cliente_id ORDER BY fecha, id'))
        roadmaps = [
            {"id": d.id, "titulo": d.titulo, "fecha": d.fecha, "coach": equipo.get(d.coach_id) if d.coach_id else None, "area": d.area,
             "pasos": [p for p in (_j(d.pasos_json, []) or []) if isinstance(p, dict)], "fathom_url": d.fathom_url}
            for d in docs
        ]
        cierres = {
            x.clave: {"por": equipo.get(x.admin_id, "Equipo"), "en": _iso(x.cerrado_en)}
            for x in CierreCompromiso.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."contexto_cierres" WHERE cliente_id = $cliente_id')
        }
        datos_cliente = {
            "id": c.id, "nombre": c.nombre or c.email, "plan": c.plan_actual, "vence": _iso(c.fecha_vencimiento),
            "desde": _iso(alta.creado_en if alta else (onb.respondido_en if onb else None)),
        }
        perfil_d = None if perfil is None else {k: getattr(perfil, k) for k in ("nicho_texto", "que_vende", "etapa", "facturacion", "objetivo", "tono_cliente")}

    # Las llamadas que todavía no se resumieron (una por pedido, para no demorar la apertura).
    pendientes = [i for i, _, _, _, _, tiene, trans, _ in llamadas_info if not tiene and trans]
    if pendientes and config("ANTHROPIC_API_KEY", default="") and _resumiendo.acquire(blocking=False):
        try:
            resumir_llamada(pendientes[-1], llamar)
        except Exception:
            logger.exception("Contexto: no se pudo resumir la llamada %s", pendientes[-1])
        finally:
            _resumiendo.release()
    with db_session:
        puntos_por_llamada = {ll.id: _j(ll.puntos_json) for ll in _llamadas_de(cliente_id)}

    atendieron: OrderedDict[str, None] = OrderedDict()
    eventos: list[dict] = []

    # Llamadas: el evento real. La coordinación que la armó queda adentro (coordinacion).
    llamadas_ev = []
    for lid, admin_id, inicio, duracion, url, _, _, _titulo in llamadas_info:
        quien = equipo.get(admin_id, "Equipo")
        atendieron[quien] = None
        p = puntos_por_llamada.get(lid) or {}
        ev = {
            "id": f"ll:{lid}", "tipo": "llamada", "fecha": _dia(inicio).isoformat(), "momento": _iso(inicio),
            "titulo": f"1 a 1 con {quien}", "quien": quien, "duracion": duracion, "url": url,
            "temas": p.get("temas") or [], "decisiones": p.get("decisiones") or [], "inquietudes": p.get("inquietudes") or [],
            "resumida": bool(p), "coordinacion": 0, "fuente": ["llamada"],
            "adjuntos": [{"tipo": "fathom", "url": url, "etiqueta": "Grabación"}] if url else [],
        }
        llamadas_ev.append(ev)
        eventos.append(ev)
    dia_ll = lambda ev: date.fromisoformat(ev["fecha"])  # noqa: E731

    # Del chat sobreviven logros, objeciones y pedidos que son compromisos (R1–R4).
    compromisos: list[dict] = []
    for h in hechos:
        if h.mensaje_id == 0 or h.autor_tipo != "cliente":
            continue  # los del onboarding ya están en el alta; los del equipo no son historia del cliente
        d = _dia(h.dicho_en)
        completo = f"{h.texto} {h.cita}"
        base = {
            "id": f"ch:{h.id}", "fecha": d.isoformat(), "momento": _iso(h.dicho_en), "titulo": h.texto,
            "cita": [h.cita[:220]], "fuente": ["chat"], "adjuntos": [{"tipo": "mensaje", "mensaje_id": h.mensaje_id, "etiqueta": "Mensaje"}],
        }
        if h.tipo in ("logro", "objecion"):
            ev = {**base, "tipo": h.tipo, "riesgo": h.tipo == "objecion" and bool(_RIESGO.search(completo))}
            # Lo mismo dicho en el chat y en una llamada cercana es un solo evento (R5–R6).
            for ll in llamadas_ev:
                if abs((dia_ll(ll) - d).days) <= 14:
                    for x in ll["inquietudes"] if h.tipo == "objecion" else ll["decisiones"]:
                        if similitud(h.texto, x["texto"]) >= 0.6:
                            ev["fuente"] = ["chat", "llamada"]
                            ev["cita"].append(x["cita"][:220])
            eventos.append(ev)
            continue
        if h.tipo != "pedido":
            continue
        plazo = None if _REUNION.search(completo) else plazo_de(completo, d)
        lado = "cliente" if _PROMETE.search(h.texto) else "atv"
        if plazo:  # R4 antes que R1: con plazo es compromiso aunque diga la hora
            compromisos.append({"clave": f"ch:{h.id}", "lado": lado, "texto": h.texto, "cita": [h.cita[:220]], "plazo": plazo, "desde": d, "fuente": ["chat"], "cerrable": True})
        elif _AGENDA.search(completo):
            ll = next((x for x in llamadas_ev if -1 <= (dia_ll(x) - d).days <= 7), None)
            if ll is not None:
                ll["coordinacion"] += 1
        else:
            resuelto = any(
                0 <= (dia_ll(ll) - d).days <= 14 and any(similitud(h.texto, t) >= 0.5 for t in ll["temas"] + [x["texto"] for x in ll["decisiones"]])
                for ll in llamadas_ev
            )
            if not resuelto and (hoy - d).days <= PEDIDOS_SIN_FECHA_DIAS:
                compromisos.append({"clave": f"ch:{h.id}", "lado": lado, "texto": h.texto, "cita": [h.cita[:220]], "plazo": None, "desde": d, "fuente": ["chat"], "cerrable": True})

    # Compromisos del roadmap vigente y de la última llamada si es posterior (el lado ya viene marcado).
    ultimo = roadmaps[-1] if roadmaps else None
    de_fuera: list[dict] = []
    if ultimo:
        for i, p in enumerate(ultimo["pasos"]):
            if not (p.get("texto") or "").strip():
                continue
            de_fuera.append({
                "clave": f"rm:{ultimo['id']}:{p.get('id', i)}", "lado": "atv" if p.get("quien") == "atv" else "cliente", "texto": p["texto"],
                "cita": [], "plazo": plazo_de(p["texto"], ultimo["fecha"]), "desde": ultimo["fecha"],
                "fuente": ["roadmap"], "origen": f"Roadmap «{ultimo['titulo']}»", "cerrado": bool(p.get("hecho")), "cerrable": False,
            })
    if llamadas_ev:
        ll = llamadas_ev[-1]
        lid = int(ll["id"].split(":")[1])
        if not ultimo or dia_ll(ll) > ultimo["fecha"]:
            p = puntos_por_llamada.get(lid) or {}
            for lado in ("atv", "cliente"):
                for i, x in enumerate(p.get(lado) or []):
                    previo = next((y for y in de_fuera if y["lado"] == lado and y["fuente"] == ["llamada"] and similitud(y["texto"], x["texto"]) >= 0.6), None)
                    if previo is not None:  # la IA a veces anota dos veces lo mismo
                        previo["cita"].append(x["cita"][:220])
                        continue
                    de_fuera.append({
                        "clave": f"ll:{lid}:{lado}:{i}", "lado": lado, "texto": x["texto"], "cita": [x["cita"][:220]],
                        "plazo": plazo_de(f"{x['texto']} {x['cita']}", dia_ll(ll)), "desde": dia_ll(ll),
                        "fuente": ["llamada"], "origen": f"Llamada con {ll['quien']}", "cerrable": True,
                    })
    # Un pedido del chat que es lo mismo que un compromiso de la llamada o el roadmap se fusiona en ese.
    for ch in list(compromisos):
        par = next((x for x in de_fuera if abs((x["desde"] - ch["desde"]).days) <= 14 and similitud(ch["texto"], x["texto"]) >= 0.6), None)
        if par is not None:
            par["fuente"] = par["fuente"] + ["chat"]
            par["cita"] = par["cita"] + ch["cita"]
            compromisos.remove(ch)
    for ch in compromisos:
        ch["origen"] = "Pedido en el chat"
    compromisos += de_fuera
    for x in compromisos:
        if x.get("cerrable") and x["clave"] in cierres:
            x["cerrado"], x["cerrado_por"], x["cerrado_en"] = True, cierres[x["clave"]]["por"], cierres[x["clave"]]["en"]
        x["estado"] = estado_compromiso(x, hoy)
        x["en_panel"] = en_panel(x, hoy)
        eventos.append({
            "id": f"cp:{x['clave']}", "tipo": "compromiso", "fecha": x["desde"].isoformat(), "titulo": x["texto"], "lado": x["lado"],
            "plazo": x["plazo"].isoformat() if x["plazo"] else None, "estado": x["estado"], "cita": x["cita"], "fuente": x["fuente"], "adjuntos": [],
        })

    if datos_cliente["desde"]:
        resumen_onb = [v for v in (ficha.get("que_vende") or ficha.get("oferta"), ficha.get("facturacion"), ficha.get("equipo")) if v]
        eventos.append({"id": "alta", "tipo": "alta", "fecha": datos_cliente["desde"][:10], "momento": datos_cliente["desde"], "titulo": "Entró a ATV y completó el onboarding" if onb else "Entró a ATV", "items": [x[:220] for x in resumen_onb[:3]], "fuente": ["onboarding"], "adjuntos": []})

    for r in roadmaps:
        if r["coach"]:
            atendieron[r["coach"]] = None
        eventos.append({
            "id": f"rm:{r['id']}", "tipo": "roadmap", "fecha": r["fecha"].isoformat(), "titulo": f"Roadmap «{r['titulo']}»", "quien": r["coach"], "area": r["area"],
            "hechos": sum(1 for p in r["pasos"] if p.get("hecho")), "total": len(r["pasos"]), "fuente": ["roadmap"],
            "adjuntos": [{"tipo": "fathom", "url": r["fathom_url"], "etiqueta": "Grabación"}] if r["fathom_url"] else [],
        })
        # Entregó o completó: los pasos tildados, juntos por día.
        por_dia: OrderedDict[date, list] = OrderedDict()
        for p in r["pasos"]:
            cuando = _paso_hecho_en(p) if p.get("hecho") else None
            if cuando and cuando >= _dia(desde):
                por_dia.setdefault(cuando, []).append(p.get("texto") or "")
        for cuando, textos in por_dia.items():
            eventos.append({
                "id": f"en:{r['id']}:{cuando.isoformat()}", "tipo": "entrega", "fecha": cuando.isoformat(),
                "titulo": f"Completó {len(textos)} {'paso' if len(textos) == 1 else 'pasos'} de «{r['titulo']}»", "items": textos[:6], "fuente": ["roadmap"], "adjuntos": [],
            })

    for q in del_equipo:
        if q in equipo:
            atendieron[equipo[q]] = None

    # Se quedó callado: ni mensajes del cliente ni llamadas (R9).
    senales = set(dias_cliente) | {dia_ll(ll) for ll in llamadas_ev if dia_ll(ll) >= _dia(desde)}
    for s in silencios(senales, hoy):
        eventos.append({
            "id": f"si:{s['desde'].isoformat()}", "tipo": "silencio", "fecha": s["desde"].isoformat(), "dias": s["dias"],
            "titulo": f"Sin señales hace {s['dias']} días" if s["abierto"] else f"Sin señales {s['dias']} días",
            "estado": "abierto" if s["abierto"] else "cerrado", "fuente": ["sistema"], "adjuntos": [],
        })
    if migracion is not None:
        eventos.append({"id": "mig", "tipo": "migracion", "fecha": _dia(migracion).isoformat(), "momento": _iso(migracion), "titulo": "Pasó del Discord al classroom", "fuente": ["sistema"], "adjuntos": []})

    # Lo más nuevo arriba.
    eventos.sort(key=lambda e: (e["fecha"], e.get("momento") or ""), reverse=True)

    # Arriba de todo, solo lo rojo: habló de irse o de pedir la plata. Las objeciones van al historial.
    alertas = [{"nivel": "rojo", "texto": f"El {_dia(m.creado_en).strftime('%d/%m')} habló de irse o de pedir la plata", "cita": _frase(m.texto, _RIESGO), "fecha": _iso(m.creado_en)} for m in riesgo_msgs[-2:]]

    ult_ll = llamadas_ev[-1] if llamadas_ev else None
    no_repetir = [{"texto": h.texto, "cita": h.cita[:200]} for h in hechos if h.tipo == "no_le_funciono"][-4:]
    orden = {"vencido": 0, "abierto": 1, "cerrado": 2}
    compromisos.sort(key=lambda x: (orden[x["estado"]], x["plazo"] or date.max, x["desde"]))
    return {
        "cliente": {
            **datos_cliente, "perfil": perfil_d, "atendieron": list(atendieron),
            "ultima_llamada": None if ult_ll is None else {"fecha": ult_ll["fecha"], "quien": ult_ll["quien"], "duracion": ult_ll["duracion"]},
            "ultimo_mensaje": _iso(ultimo_cliente),
        },
        "alertas": alertas,
        "compromisos": [
            {**{k: v for k, v in x.items() if k not in ("plazo", "desde")}, "plazo": x["plazo"].isoformat() if x["plazo"] else None, "desde": x["desde"].isoformat()}
            for x in compromisos
        ],
        "no_repetir": no_repetir,
        "roadmap": None if not ultimo else {"titulo": ultimo["titulo"], "hechos": sum(1 for p in ultimo["pasos"] if p.get("hecho")), "total": len(ultimo["pasos"])},
        "eventos": eventos,
        "llamadas_sin_resumir": max(0, len(pendientes) - 1),
    }


_CLAVE = re.compile(r"^(ch:\d+|ll:\d+:(atv|cliente):\d+)$")


class ContextoServices:
    def de_cliente(self, sesion: dict, cliente_id: int) -> dict:
        if not es_equipo(sesion):
            raise HTTPException(status_code=403, detail="Solo el equipo.")
        return armar(cliente_id)

    def cerrar_compromiso(self, sesion: dict, cliente_id: int, clave: str, cerrado: bool) -> dict:
        """El botón "Cumplido" (o deshacer) de un compromiso del chat o de una llamada."""
        if not es_equipo(sesion):
            raise HTTPException(status_code=403, detail="Solo el equipo.")
        if not _CLAVE.match(clave or ""):
            raise HTTPException(status_code=422, detail="Ese compromiso no se cierra a mano (los del roadmap se tildan en el roadmap).")
        with db_session:
            fila = CierreCompromiso.get(clave=clave)
            if cerrado and fila is None:
                fila = CierreCompromiso(clave=clave, cliente_id=cliente_id, admin_id=sesion["usuario_id"])
            elif not cerrado and fila is not None:
                fila.delete()
                fila = None
            equipo = _nombres_equipo()
            return {
                "clave": clave, "cerrado": fila is not None,
                "cerrado_por": equipo.get(fila.admin_id, "Equipo") if fila else None, "cerrado_en": _iso(fila.cerrado_en) if fila else None,
            }
