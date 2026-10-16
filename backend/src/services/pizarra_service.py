"""Pizarra del onboarding: el formulario de 49 preguntas convertido en un tablero a lápiz para el coach
que va a tener el 1 a 1 (qué vende, qué tiene a favor, su freno, a dónde quiere llegar, qué espera de ATV).

La IA solo saca datos, cada uno con el número de la pregunta de donde sale. El código descarta lo que no
se pueda comprobar (citas que no están tal cual, datos que apuntan a preguntas sin responder) y arma lo que
se lee directo del formulario sin IA: las preguntas sin responder, los problemas marcados y cómo llegó.
"""

import json
import logging
import re
import threading
from datetime import datetime

from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.db import db
from src.models import PizarraOnboarding
from src.services import gasto_ia
from src.services.aprendizaje_service import leer_json
from src.services.auth_service import es_equipo
from src.services.cerebro_onboarding import PREGUNTAS

logger = logging.getLogger("pizarra")
MODELO = config("PIZARRA_MODEL", default="claude-haiku-5-5")
VERSION = 1  # si cambia lo que se le pide a la IA, las pizarras viejas se rearman al abrirlas

_VACIAS = {"", "-", ".", "na", "n/a", "no aplica", "ninguno", "ninguna", "nada", "no"}
# Cada medidor sale solo de sus preguntas; si están todas sin responder, se muestra como "no lo dijo".
TERMOMETRO = {
    "Contenido publicado": ("9", "10"),
    "Leads medidos": ("9", "11", "12", "17"),
    "Precio definido": ("8",),
    "Proceso de ventas": ("14", "15", "16", "18"),
    "Equipo": ("20", "21"),
}
# "Qué esperan de ATV" sale de lo que contaron sobre por qué entraron, no de sus metas.
PREGUNTAS_ESPERAN = {"41", "46", "49"}
ESTADOS = ("nada", "algo", "listo")  # más "sin_dato", que lo pone el código

_SISTEMA = """Leés el formulario de onboarding de un cliente de ATV (mentoría para creadores y expertos que venden
infoproductos y servicios) para que el coach que lo atiende en la primera llamada entienda rápido su negocio.
Respondés solo con JSON válido. No opinás ni aconsejás: solo ordenás lo que el cliente escribió.
Cada dato lleva "p": el número de la pregunta de donde sale. Si algo no está en el formulario, no va."""

_PEDIDO = """Si el formulario habla de más de un negocio (por ejemplo, una pareja que responde "Oscar / … Lina / …"),
separalos: un elemento de "negocios" por cada uno. Si es uno solo, un único elemento.

Devolvé:
{{"negocios": [{{
   "persona": "nombre de pila de quien lleva ese negocio",
   "marca": "nombre del negocio o de su método, si lo dio" o null,
   "rubro": "a qué se dedica, en 2 a 5 palabras",
   "que_vende": {{"texto": "qué vende, en una línea", "p": "5"}},
   "activos": [{{"texto": "lo que ya tiene a favor: experiencia, audiencia, logros. Con el número si lo dio", "p": "…"}}],
   "oferta": [{{"nombre": "nombre corto de cada producto o nivel", "precio": "el precio como lo escribió" o null, "definido": true o false, "para": "para quién es, corto" o null, "p": "8"}}],
   "metodo": {{"nombre": "…", "etapas": ["2 a 3 palabras cada una"], "p": "…"}} o null,
   "freno": {{"cita": "fragmento EXACTO de su respuesta sobre su principal freno", "p": "30"}} o null,
   "hoy": [{{"texto": "dónde está hoy, un dato por renglón", "p": "…"}}],
   "meta": {{"titular": "lo más concreto de su objetivo a 4 meses en 2 a 5 palabras, con el número si lo dio", "detalle": ["hasta 4 renglones"], "p": "31"}} o null
 }}],
 "termometro": [{{"nombre": uno de {termometro}, "estado": "nada" | "algo" | "listo", "nota": "hasta 5 palabras", "p": "…"}}],
 "esperan": [{{"texto": "qué espera de ATV, con sus palabras (solo de las preguntas 41, 46 y 49)", "p": "…"}}],
 "citas": [{{"cita": "frase EXACTA y reveladora de lo que escribió, distinta de su freno (mejor si es de por qué compró o qué le costó entender)", "quien": "nombre", "contexto": "de qué hablaba, 2 a 5 palabras", "p": "…"}}]}}

Reglas:
- Todo es sobre el CLIENTE de ATV (el dueño del negocio), NO sobre su avatar ni sus clientes.
- Las citas van copiadas tal cual, sin corregir ortografía. Si no hay una frase exacta, no pongas la cita.
- Una respuesta "NA" o vacía no es un dato: no la uses.
- activos: hasta 4. oferta: hasta 4. hoy: hasta 3. esperan: hasta 3. citas: hasta 2. termometro: uno por cada nombre, solo si el formulario lo dice.

Formulario de {nombre} (programa {plan}):
{respuestas}"""


def _texto(v) -> str:
    if isinstance(v, list):
        v = ", ".join(str(x) for x in v)
    return " ".join(str(v or "").split())


def _norm(t: str) -> str:
    t = (t or "").lower()
    t = re.sub(r"[“”\"«»'’…]", " ", t)
    return " ".join(re.sub(r"[^\w\s]", " ", t).split())


def respondidas(respuestas) -> dict[str, str]:
    if isinstance(respuestas, str):
        respuestas = json.loads(respuestas or "{}")
    return {str(k): _texto(v) for k, v in (respuestas or {}).items() if _texto(v).lower().strip(" .") not in _VACIAS}


def sin_responder(respuestas: dict) -> list[str]:
    hechas = respondidas(respuestas)
    return [pid for pid in PREGUNTAS if pid not in hechas]


def _corto(t, n: int) -> str | None:
    t = _texto(t)
    if not t:
        return None
    return t if len(t) <= n else t[: n - 1].rsplit(" ", 1)[0] + "…"


def _p_valida(p, hechas: dict) -> str | None:
    p = str(p or "").strip().lstrip("Pp")
    return p if p in hechas else None


def _cita_valida(cita, p: str | None, hechas: dict) -> str | None:
    """Una cita sirve solo si está tal cual en la respuesta de esa pregunta (o en alguna, si no dijo cuál)."""
    cita = _texto(cita).strip(" \"“”")
    if len(cita) < 8:
        return None
    buscar = _norm(cita)
    fuentes = [hechas[p]] if p else list(hechas.values())
    return _corto(cita, 260) if any(buscar in _norm(f) for f in fuentes) else None


def _dato(d, hechas: dict, n: int = 160) -> dict | None:
    if not isinstance(d, dict):
        return None
    p, texto = _p_valida(d.get("p"), hechas), _corto(d.get("texto"), n)
    return {"texto": texto, "p": p} if p and texto else None


def _lista(xs, hechas: dict, tope: int, n: int = 160) -> list[dict]:
    return [x for x in (_dato(d, hechas, n) for d in (xs or [])[: tope * 2] if isinstance(xs, list)) if x][:tope]


def validar(crudo: dict | None, respuestas: dict) -> dict:
    """Lo que dijo la IA pasa por el código: sin número de pregunta respondida o sin cita literal, no entra."""
    hechas = respondidas(respuestas)
    crudo = crudo if isinstance(crudo, dict) else {}
    negocios = []
    for n in (crudo.get("negocios") or [])[:3]:
        if not isinstance(n, dict):
            continue
        oferta = []
        for o in (n.get("oferta") or [])[:4]:
            p = _p_valida((o or {}).get("p"), hechas) if isinstance(o, dict) else None
            if p and _corto(o.get("nombre"), 40):
                oferta.append({"nombre": _corto(o["nombre"], 40), "precio": _corto(o.get("precio"), 40),
                               "definido": bool(o.get("definido")), "para": _corto(o.get("para"), 90), "p": p})
        metodo = n.get("metodo") if isinstance(n.get("metodo"), dict) else None
        if metodo:
            p = _p_valida(metodo.get("p"), hechas)
            etapas = [e for e in (_corto(x, 30) for x in (metodo.get("etapas") or [])[:6]) if e]
            metodo = {"nombre": _corto(metodo.get("nombre"), 40), "etapas": etapas, "p": p} if p and len(etapas) >= 2 else None
        freno = n.get("freno") if isinstance(n.get("freno"), dict) else None
        if freno:
            p = _p_valida(freno.get("p"), hechas)
            cita = _cita_valida(freno.get("cita"), p, hechas)
            freno = {"cita": cita, "p": p} if p and cita else None
        meta = n.get("meta") if isinstance(n.get("meta"), dict) else None
        if meta:
            p = _p_valida(meta.get("p"), hechas)
            detalle = [d for d in (_corto(x, 110) for x in (meta.get("detalle") or [])[:4]) if d]
            meta = {"titular": _corto(meta.get("titular"), 40), "detalle": detalle, "p": p} if p and _corto(meta.get("titular"), 40) else None
        negocio = {
            "persona": _corto(n.get("persona"), 30) or "Cliente",
            "marca": _corto(n.get("marca"), 40),
            "rubro": _corto(n.get("rubro"), 50),
            "que_vende": _dato(n.get("que_vende"), hechas, 200),
            "activos": _lista(n.get("activos"), hechas, 4),
            "oferta": oferta,
            "metodo": metodo,
            "freno": freno,
            "hoy": _lista(n.get("hoy"), hechas, 3, 90),
            "meta": meta,
        }
        if negocio["que_vende"] or negocio["activos"] or negocio["oferta"]:
            negocios.append(negocio)

    termometro = {}
    for t in crudo.get("termometro") or []:
        if not isinstance(t, dict) or t.get("nombre") not in TERMOMETRO or t.get("estado") not in ESTADOS:
            continue
        p = _p_valida(t.get("p"), hechas)
        if p and p in TERMOMETRO[t["nombre"]] and t["nombre"] not in termometro:
            termometro[t["nombre"]] = {"nombre": t["nombre"], "estado": t["estado"], "nota": _corto(t.get("nota"), 40), "p": p}
    for nombre, pids in TERMOMETRO.items():
        if nombre not in termometro and not any(p in hechas for p in pids):
            termometro[nombre] = {"nombre": nombre, "estado": "sin_dato", "nota": "no lo respondió", "p": f"{pids[0]}–{pids[-1]}" if len(pids) > 1 else pids[0]}

    frenos = [_norm(n["freno"]["cita"].rstrip("…")) for n in negocios if n["freno"]]
    citas = []
    for c in (crudo.get("citas") or [])[:4]:
        if not isinstance(c, dict):
            continue
        p = _p_valida(c.get("p"), hechas)
        cita = _cita_valida(c.get("cita"), p, hechas)
        repetida = cita and any(_norm(cita.rstrip("…")) in f or f in _norm(cita) for f in frenos)
        if p and cita and not repetida and all(_norm(cita) != _norm(x["cita"]) for x in citas):
            citas.append({"cita": cita, "quien": _corto(c.get("quien"), 30), "contexto": _corto(c.get("contexto"), 50), "p": p})

    return {
        "negocios": negocios,
        "termometro": [termometro[n] for n in TERMOMETRO if n in termometro],
        "esperan": [e for e in _lista(crudo.get("esperan"), hechas, 6) if e["p"] in PREGUNTAS_ESPERAN][:3],
        "citas": citas[:2],
    }


def del_formulario(respuestas: dict) -> dict:
    """Lo que se lee directo del formulario, sin IA."""
    hechas = respondidas(respuestas)
    problemas = [p.strip() for p in re.split(r",|\n", hechas.get("29", "")) if p.strip()][:5]
    por_que = [p.strip() for p in re.split(r",|\n", hechas.get("40", "")) if p.strip()][:5]
    llegada = []
    for pid, etiqueta in (("32", "Nos conoció por"), ("42", "Tardó en decidir"), ("45", "Convencido antes de la llamada"), ("47", "Lo que le impedía comprar")):
        if pid in hechas:
            valor = hechas[pid] + ("/10" if pid == "45" and hechas[pid].isdigit() else "")
            llegada.append({"etiqueta": etiqueta, "valor": _corto(valor, 70), "p": pid})
    faltan = sin_responder(respuestas)
    return {"problemas": [{"texto": _corto(p, 50), "p": "29"} for p in problemas], "llegada": llegada,
            "por_que_entro": [{"texto": _corto(p, 60), "p": "40"} for p in por_que],
            "sin_responder": faltan, "total_preguntas": len(PREGUNTAS)}


def _llamar(sistema: str, usuario: str) -> dict | None:
    from anthropic import Anthropic

    r = Anthropic(api_key=config("ANTHROPIC_API_KEY", default=""), timeout=90).messages.create(
        model=MODELO, max_tokens=4000, thinking={"type": "disabled"}, system=sistema, messages=[{"role": "user", "content": usuario}],
    )
    try:
        gasto_ia.registrar("pizarra", r.usage)
    except Exception:
        pass
    return leer_json("".join(b.text for b in r.content if getattr(b, "type", "") == "text"))


def armar(nombre: str, plan: str | None, respuestas: dict, llamar=_llamar) -> dict:
    hechas = respondidas(respuestas)
    texto = "\n".join(f"[{pid}] {PREGUNTAS.get(pid, '')}\n{hechas[pid]}" for pid in PREGUNTAS if pid in hechas)
    pedido = _PEDIDO.format(termometro=" | ".join(f'"{t}" (preguntas {", ".join(p)})' for t, p in TERMOMETRO.items()), nombre=nombre, plan=plan or "sin plan", respuestas=texto)
    datos = validar(llamar(_SISTEMA, pedido), respuestas)
    datos.update(del_formulario(respuestas))
    datos.update({"nombre": nombre, "plan": plan, "version": VERSION})
    return datos


_FORM = """SELECT s.client_name, s.plan, f.form_data, f.submitted_at FROM onboarding.sessions s
JOIN onboarding.forms f ON f.session_id = s.id WHERE s.id::text = $sid ORDER BY f.submitted_at DESC NULLS LAST LIMIT 1"""
_armando: dict[str, threading.Lock] = {}
_candado = threading.Lock()


class PizarraServices:
    def ver(self, sesion: dict, session_id: str, rearmar: bool = False, llamar=_llamar) -> dict:
        if not es_equipo(sesion):
            raise HTTPException(status_code=403, detail="Solo para el equipo.")
        if rearmar and sesion.get("rol") != "admin":
            raise HTTPException(status_code=403, detail="Solo un admin la vuelve a dibujar.")
        with db_session:
            filas = db.select(_FORM, {"sid": session_id})
        if not filas:
            raise HTTPException(status_code=404, detail="Todavía no completó el formulario.")
        nombre, plan, respuestas, enviado = filas[0]
        if isinstance(respuestas, str):
            respuestas = json.loads(respuestas)
        # Una sola armada a la vez por onboarding: si dos la abren juntos, el segundo espera y la lee.
        with _candado:
            lock = _armando.setdefault(session_id, threading.Lock())
        with lock:
            with db_session:
                guardada = PizarraOnboarding.get(session_id=session_id)
                if guardada and not rearmar and guardada.respondido_en == enviado:
                    datos = json.loads(guardada.datos_json)
                    if datos.get("version") == VERSION:
                        return {**datos, "armada_en": guardada.creado_en.isoformat() + "Z"}
            try:
                datos = armar(nombre or "Cliente", plan, respuestas or {}, llamar=llamar)
            except Exception:
                logger.exception("Pizarra: no se pudo armar la del onboarding %s", session_id)
                raise HTTPException(status_code=502, detail="No se pudo dibujar la pizarra. Probá de nuevo en un rato.")
            ahora = datetime.utcnow()
            with db_session:
                guardada = PizarraOnboarding.get(session_id=session_id)
                if guardada is None:
                    guardada = PizarraOnboarding(session_id=session_id, datos_json="{}")
                guardada.datos_json = json.dumps(datos, ensure_ascii=False)
                guardada.respondido_en, guardada.modelo, guardada.creado_en = enviado, MODELO, ahora
            return {**datos, "armada_en": ahora.isoformat() + "Z"}
