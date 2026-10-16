"""Pizarra del onboarding: el formulario de 49 preguntas convertido en un diagnóstico a lápiz para el coach
que va a tener el 1 a 1. No es un resumen: por cada cuello de botella del negocio muestra el síntoma (con
la evidencia del formulario), la causa raíz, lo que le cuesta y cómo se resuelve; cuál se ataca primero y
qué hay que decidir en la llamada. El framework lo propuso Jeremy (la IA de Juan) el 16-10-2026.

Hechos e interpretación van separados. Los hechos llevan el número de la pregunta de donde salen y el
código descarta lo que no se puede comprobar (citas que no están tal cual, preguntas sin responder): un
cuello de botella sin evidencia en el formulario no se dibuja. La causa, el impacto y la solución son la
lectura del consultor y así se muestran. Lo que se lee directo del formulario sale sin IA.
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
# Diagnosticar es juicio, no extracción: Haiku sirve para sacar datos pero acá erraba en la lectura.
MODELO = config("PIZARRA_MODEL", default="claude-sonnet-5-5")
VERSION = 3  # si cambia lo que se le pide a la IA, las pizarras viejas se rearman al abrirlas

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

_SISTEMA = """Sos consultor de ATV (mentoría high ticket para creadores, coaches, consultores y agencias que venden
infoproductos y servicios). Leés el formulario de onboarding de un cliente antes de su llamada 1 a 1 con Juan.
No resumís el formulario: lo diagnosticás. Buscás los cuellos de botella reales del negocio cruzando todas las
respuestas, no solo lo que el cliente dice que le pasa. El cuello de botella casi nunca es lo que el cliente
nombra: profundizá hasta la causa estructural.
Respondés solo con JSON válido. Usás solo información del formulario: no inventás números. Todo dato o cita
lleva "p": el número de la pregunta de donde sale; las citas van copiadas tal cual. Tono directo, de
consultor, sin adornos."""

_PEDIDO = """Si el formulario habla de más de un negocio (por ejemplo, una pareja que responde "Oscar / … Lina / …"),
separalos: un elemento de "negocios" por cada uno. Si es uno solo, un único elemento.

Devolvé:
{{"negocios": [{{
   "persona": "nombre de pila de quien lleva ese negocio",
   "marca": "nombre del negocio o de su método, si lo dio" o null,
   "rubro": "nicho, en 2 a 5 palabras",
   "que_vende": {{"texto": "qué vende, en una línea", "p": "5"}},
   "contexto": [{{"texto": "un dato duro por renglón: quién es, de dónde viene, en qué etapa está hoy, a dónde quiere llegar y en cuánto tiempo", "p": "…"}}],
   "cuellos": [{{
      "titulo": "el cuello de botella en 2 a 6 palabras",
      "sintoma": {{"texto": "qué se está viendo, en una frase", "evidencia": [{{"cita": "fragmento EXACTO de una respuesta" o null, "dato": "un dato con número del formulario" o null, "p": "…"}}]}},
      "causa": "por qué pasa realmente; puede ser distinto a lo que el cliente cree. 1 o 2 frases",
      "impacto": "qué le está costando al negocio: plata, tiempo o dependencia. 1 frase",
      "solucion": "cómo se resuelve, accionable. 1 o 2 frases",
      "su_frase": {{"cita": "si el cliente nombró este problema con otras palabras y en realidad es un síntoma: su frase EXACTA", "p": "…"}} o null,
      "falta": "el dato que no está en el formulario y hace falta para confirmar este diagnóstico, para preguntar en la llamada" o null
   }}],
   "embudo": [{{"etapa": "nombre corto de la etapa (leads, chats, agendas, asistieron, compraron…)", "valor": número tal como aparece en la respuesta, "p": "…"}}],
   "prioridad": {{"cuello": número del cuello que se ataca primero (1, 2…), "por_que": "por qué ese primero, en 2 líneas; si hay uno que bloquea a los demás, es ese"}},
   "decidir": ["3 a 5 preguntas concretas que Juan tiene que cerrar con el cliente en la llamada, escritas como preguntas accionables"],
   "freno": {{"cita": "fragmento EXACTO de su respuesta sobre su principal freno", "p": "30"}} o null,
   "hoy": [{{"texto": "dónde está hoy, con números si los dio", "p": "…"}}],
   "meta": {{"titular": "su objetivo a 4 meses en 2 a 5 palabras, con el número si lo dio", "detalle": ["hasta 3 renglones"], "p": "31"}} o null
 }}],
 "termometro": [{{"nombre": uno de {termometro}, "estado": "nada" | "algo" | "listo", "nota": "hasta 5 palabras", "p": "…"}}],
 "alertas": [{{"texto": "un riesgo que Juan no puede dejar pasar: dependencia de una sola persona o plataforma, métricas que no existen, promesas sin datos. Una frase corta", "p": "…" o null}}]}}

Reglas:
- Todo es sobre el CLIENTE de ATV (el dueño del negocio), NO sobre su avatar ni sus clientes.
- cuellos: entre 2 y 4 por negocio. Cada síntoma necesita al menos una evidencia del formulario (cita exacta o dato con su "p"). Si no la hay, ese cuello no va.
- La causa, el impacto y la solución son tu lectura de consultor: concretas, nada genérico ("mejorar el marketing" no sirve). No inventes números.
- Las citas van copiadas tal cual, sin corregir ortografía. Una respuesta "NA" o vacía no es un dato.
- embudo: solo si el formulario da los números de su proceso comercial (de 3 a 6 etapas, de la más grande a la más chica, del mismo período). Si no los da, lista vacía.
- contexto: hasta 5. hoy: hasta 3. decidir: 3 a 5. alertas: 2 o 3 en total. termometro: uno por cada nombre, solo si el formulario lo dice.

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


def _num(v) -> float | None:
    try:
        return float(str(v).replace(".", "").replace(",", ".")) if isinstance(v, str) else float(v)
    except (TypeError, ValueError):
        return None


def _embudo(xs, hechas: dict) -> list[dict]:
    """Las etapas de su proceso comercial con números. Cada número tiene que estar escrito en esa respuesta
    y tienen que ir achicándose: un embudo que crece es un dato mal leído, y no se dibuja."""
    etapas = []
    for e in (xs or [])[:8] if isinstance(xs, list) else []:
        if not isinstance(e, dict):
            continue
        p, valor, nombre = _p_valida(e.get("p"), hechas), _num(e.get("valor")), _corto(e.get("etapa"), 28)
        if not (p and nombre and valor and valor > 0):
            continue
        cifra = str(int(valor)) if valor == int(valor) else str(valor)
        texto = re.sub(r"(?<=\d)[.,](?=\d{3}\b)", "", hechas[p])  # 1.700 → 1700
        if not re.search(rf"(?<!\d){re.escape(cifra)}(?!\d)", texto):
            continue
        etapas.append({"etapa": nombre, "valor": valor, "p": p})
    if len(etapas) < 3 or any(b["valor"] > a["valor"] for a, b in zip(etapas, etapas[1:])):
        return []
    return etapas[:6]


def _cuello(c, hechas: dict) -> dict | None:
    """Un cuello de botella entra solo si su síntoma tiene evidencia que se puede comprobar en el formulario."""
    if not isinstance(c, dict):
        return None
    sintoma = c.get("sintoma") if isinstance(c.get("sintoma"), dict) else {}
    evidencia = []
    for e in (sintoma.get("evidencia") or [])[:5] if isinstance(sintoma.get("evidencia"), list) else []:
        if not isinstance(e, dict):
            continue
        p = _p_valida(e.get("p"), hechas)
        if not p:
            continue
        cita = _cita_valida(e.get("cita"), p, hechas) if e.get("cita") else None
        dato = _corto(e.get("dato"), 120)
        if cita or dato:
            evidencia.append({"cita": cita, "dato": None if cita else dato, "p": p})
    titulo, texto = _corto(c.get("titulo"), 60), _corto(sintoma.get("texto"), 180)
    causa, solucion = _corto(c.get("causa"), 260), _corto(c.get("solucion"), 260)
    if not (titulo and texto and causa and solucion and evidencia):
        return None
    su_frase = c.get("su_frase") if isinstance(c.get("su_frase"), dict) else None
    if su_frase:
        p = _p_valida(su_frase.get("p"), hechas)
        cita = _cita_valida(su_frase.get("cita"), p, hechas)
        su_frase = {"cita": cita, "p": p} if p and cita else None
    return {"titulo": titulo, "sintoma": {"texto": texto, "evidencia": evidencia[:3]}, "causa": causa,
            "impacto": _corto(c.get("impacto"), 200), "solucion": solucion, "su_frase": su_frase,
            "falta": _corto(c.get("falta"), 140)}


def validar(crudo: dict | None, respuestas: dict) -> dict:
    """Lo que dijo la IA pasa por el código: sin número de pregunta respondida o sin cita literal, no entra."""
    hechas = respondidas(respuestas)
    crudo = crudo if isinstance(crudo, dict) else {}
    negocios = []
    for n in (crudo.get("negocios") or [])[:3]:
        if not isinstance(n, dict):
            continue
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
        cuellos, mapa = [], {}
        for k, c in enumerate((n.get("cuellos") or [])[:6] if isinstance(n.get("cuellos"), list) else []):
            c = _cuello(c, hechas)
            if c and len(cuellos) < 4:
                mapa[k + 1] = len(cuellos) + 1
                cuellos.append(c)
        prioridad = n.get("prioridad") if isinstance(n.get("prioridad"), dict) else None
        if prioridad:
            try:
                cual = mapa.get(int(prioridad.get("cuello")))
            except (TypeError, ValueError):
                cual = None
            prioridad = {"cuello": cual, "por_que": _corto(prioridad.get("por_que"), 260)} if cual and _corto(prioridad.get("por_que"), 260) else None
        preguntas = n.get("decidir") if isinstance(n.get("decidir"), list) else []
        decidir = [q for q in (_corto(x, 170) for x in preguntas[:6]) if q][:5]
        negocio = {
            "embudo": _embudo(n.get("embudo"), hechas),
            "persona": _corto(n.get("persona"), 30) or "Cliente",
            "marca": _corto(n.get("marca"), 40),
            "rubro": _corto(n.get("rubro"), 50),
            "que_vende": _dato(n.get("que_vende"), hechas, 200),
            "contexto": _lista(n.get("contexto"), hechas, 5, 130),
            "cuellos": cuellos,
            "prioridad": prioridad,
            "decidir": decidir,
            "freno": freno,
            "hoy": _lista(n.get("hoy"), hechas, 3, 90),
            "meta": meta,
        }
        if negocio["que_vende"] or negocio["cuellos"] or negocio["contexto"]:
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

    alertas = []
    for a in (crudo.get("alertas") or [])[:5] if isinstance(crudo.get("alertas"), list) else []:
        if not isinstance(a, dict) or not _corto(a.get("texto"), 150):
            continue
        # Con número de pregunta, tiene que ser una respondida; sin número, es algo que falta.
        p = _p_valida(a.get("p"), hechas) if a.get("p") else None
        if a.get("p") and not p:
            continue
        alertas.append({"texto": _corto(a.get("texto"), 150), "p": p})

    return {
        "negocios": negocios,
        "termometro": [termometro[n] for n in TERMOMETRO if n in termometro],
        "alertas": alertas[:3],
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

    # Sin pensamiento extendido: con él la respuesta usaba 4 a 5 veces más tokens de salida (el razonamiento se
    # cobra) y tardaba 2 minutos, para llegar a los mismos cuellos de botella. Medido con el formulario de Consu
    # el 16-10-2026: ~9.700 de entrada, ~3.500 de salida, 25 s. En este modelo "apagarlo" es "between_tools".
    with Anthropic(api_key=config("ANTHROPIC_API_KEY", default=""), timeout=300).messages.stream(
        model=MODELO, max_tokens=12000, thinking={"type": "between_tools"}, system=sistema, messages=[{"role": "user", "content": usuario}],
    ) as flujo:
        r = flujo.get_final_message()
    if r.stop_reason == "max_tokens":
        logger.warning("Pizarra: la respuesta se cortó por largo (%s tokens)", getattr(r.usage, "output_tokens", "?"))
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
_candado = threading.Lock()


_en_curso: dict[str, dict] = {}   # session_id -> {"desde": datetime, "error": str | None}


class PizarraServices:
    """El diagnóstico tarda entre 25 segundos y un minuto, cerca de lo que aguanta el proxy. Por eso se arma en segundo plano: el primer pedido lo lanza y contesta "armando", y la
    pantalla vuelve a preguntar hasta que está."""

    def ver(self, sesion: dict, session_id: str, rearmar: bool = False, llamar=_llamar, esperar: bool = False) -> dict:
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
        with _candado:
            curso = _en_curso.get(session_id)
        if curso and not curso.get("error") and not esperar:
            # Se está armando (o rearmando): hasta que termine no se muestra la vieja.
            return {"estado": "armando", "desde": curso["desde"].isoformat() + "Z"}
        if not rearmar:
            with db_session:
                guardada = PizarraOnboarding.get(session_id=session_id)
                if guardada and guardada.respondido_en == enviado:
                    datos = json.loads(guardada.datos_json)
                    if datos.get("version") == VERSION:
                        return {**datos, "armada_en": guardada.creado_en.isoformat() + "Z"}
        if esperar:
            return self._armar(session_id, nombre, plan, respuestas, enviado, llamar)
        with _candado:
            curso = _en_curso.get(session_id)
            if curso and curso.get("error") and not rearmar:
                error = curso.pop("error")
                _en_curso.pop(session_id, None)
                raise HTTPException(status_code=502, detail=error)
            if not curso:
                _en_curso[session_id] = {"desde": datetime.utcnow(), "error": None}
                threading.Thread(target=self._en_fondo, args=(session_id, nombre, plan, respuestas, enviado, llamar),
                                 daemon=True, name=f"pizarra-{session_id[:8]}").start()
            desde = _en_curso[session_id]["desde"]
        return {"estado": "armando", "desde": desde.isoformat() + "Z"}

    def _en_fondo(self, session_id, nombre, plan, respuestas, enviado, llamar):
        try:
            self._armar(session_id, nombre, plan, respuestas, enviado, llamar)
            with _candado:
                _en_curso.pop(session_id, None)
        except HTTPException as e:
            with _candado:
                _en_curso[session_id] = {"desde": datetime.utcnow(), "error": e.detail}

    def _armar(self, session_id, nombre, plan, respuestas, enviado, llamar) -> dict:
        try:
            datos = armar(nombre or "Cliente", plan, respuestas or {}, llamar=llamar)
        except Exception:
            logger.exception("Pizarra: no se pudo armar la del onboarding %s", session_id)
            raise HTTPException(status_code=502, detail="No se pudo dibujar la pizarra. Probá de nuevo en un rato.")
        if not datos.get("negocios"):
            raise HTTPException(status_code=502, detail="La IA no devolvió un diagnóstico que se pueda comprobar. Probá «Volver a dibujar».")
        ahora = datetime.utcnow()
        with db_session:
            guardada = PizarraOnboarding.get(session_id=session_id)
            if guardada is None:
                guardada = PizarraOnboarding(session_id=session_id, datos_json="{}")
            guardada.datos_json = json.dumps(datos, ensure_ascii=False)
            guardada.respondido_en, guardada.modelo, guardada.creado_en = enviado, MODELO, ahora
        return {**datos, "armada_en": ahora.isoformat() + "Z"}
