"""Cuellos de botella: el cliente manda un Loom con su traba y el equipo le arma el diagnóstico y el roadmap.

El recorrido (Franco y Juan, 01-11-2026):
1. Desde la carpeta "Cuellos de botella" alguien del equipo elige al cliente y pega el Loom.
2. El classroom lee la transcripción del Loom, junta lo que el cerebro sabe del cliente (hechos, chat,
   llamadas, último cierre de mes) y las lecciones que ya dejó Juan, y se lo manda a Jeremy (trigger
   "ATV Bottleneck"). Jeremy tarda unos minutos y devuelve el borrador a /api/cuellos/jeremy/<token>.
3. Al mismo tiempo el cerebro arma su propia versión con lo mismo, en silencio: nadie la ve hasta que Juan
   aprueba, para no influirlo.
4. Juan corrige el borrador y lo aprueba. Se mide cuánto se parece a su versión final lo de Jeremy y lo del
   cerebro (código, no IA), y de cada sección que cambió sale una lección que Juan confirma o reescribe.
5. La neurona: con el tiempo el cerebro se tiene que parecer a Juan tanto como para reemplazar a Jeremy.
"""

import json
import logging
import re
import secrets
import threading
import unicodedata
from datetime import datetime, timedelta
from difflib import SequenceMatcher

import httpx
from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.models import Admin, Canal, ClienteExterno, CuelloDiagnostico, CuelloLeccion, Llamada, MensajeCanal
from src.services import cuellos_capturas, cuellos_tono, gasto_ia, google_docs_service

logger = logging.getLogger(__name__)

JEREMY_URL = config("JEREMY_BOTTLENECK_URL", default="")
JEREMY_SECRET = config("JEREMY_BOTTLENECK_SECRET", default="")
CLASSROOM_URL = config("CLASSROOM_URL", default="https://classroom.atvos.io").rstrip("/")
MODELO = config("CUELLO_MODEL", default="claude-sonnet-5-5")
MODELO_LECCION = config("CUELLO_MODEL_LECCION", default="claude-haiku-5-5")

# El formato del documento de Juan (Diagnóstico HAR PROGRAM, 01-11-2026).
SECCIONES = ["Diagnóstico", "Causas", "Causa vs potenciadores", "Qué no hacer", "Solución", "Métricas a mirar", "Expectativas", "Cierre"]
# Nombres viejos o como los escribe la IA → la sección de ahora (los diagnósticos anteriores se siguen leyendo).
_ALIAS = {"roadmap": "Expectativas", "meta": "Expectativas", "frame: causa vs potenciadores": "Causa vs potenciadores",
          "frame": "Causa vs potenciadores", "metricas": "Métricas a mirar", "que no hacer ahora": "Qué no hacer"}
# Para pasar de fase: el cerebro se parece a la final de Juan al menos esto, tres semanas seguidas (supuesto).
UMBRAL_FASE = 0.85
TOPE_TRANSCRIPCION = 60_000

# Las mismas instrucciones que tiene el trigger "ATV Bottleneck" en Jeremy: si se cambia allá, se cambia acá,
# así el cerebro y Jeremy compiten con la misma consigna.
INSTRUCCIONES = """Sos parte del equipo de coaches de ATV (Aumenta Tu Valor). Un cliente nos contó una traba de su negocio: con un Loom, con su reporte de cierre de mes o escribiéndola. Tu trabajo es armar el diagnóstico de su cuello de botella, como lo escribe Juan. Este documento lo revisa y corrige Juan antes de que llegue al cliente.

Reglas:
- Un solo cuello de botella: el que más frena la plata hoy. Nombralo sin vueltas, separando lo que NO es el problema de lo que sí ("El problema no es el tráfico: ...").
- Usá los números del cliente y decí qué significan. Si un dato no está en lo que te pasamos, no lo inventes: decí qué falta medir.
- Explicá el mecanismo: qué trabajo no está haciendo nadie y por eso pasa lo que pasa.
- Diferenciá la causa de los potenciadores: lo que amplifica resultados no sirve si falta la causa.
- La solución es concreta y usa lo que el cliente ya tiene. Con ejemplos listos para usar (un CTA, un guion, un creativo), escritos entre comillas en una línea que empieza con "> ".
- Si hay una clase o un SOP de ATV que aplica, nombralo.
- Respetá siempre las lecciones que Juan ya corrigió en otros diagnósticos.
- Si lo que mandó el cliente es un Loom, mostrá lo que dice con capturas del video: debajo del párrafo o la viñeta donde se habla o se prueba algo, agregá una línea sola "[captura MM:SS]" con el minuto de la transcripción donde se ve en pantalla (un número, un anuncio, su perfil, su embudo). Entre 2 y 4 en todo el documento, solo en Diagnóstico y Causas. Si no es un Loom, no pongas capturas.
- Tono directo, en español rioplatense, con voseo, hablándole al cliente. Que se lea como armado por el equipo, no por una IA.

Formato de salida: texto plano, sin HTML ni tablas. Podés usar **negrita**, viñetas con "- ", subtítulos con "### " y ejemplos con "> ". Respetá exactamente estas secciones y este orden:

# Diagnóstico
Una frase que nombra el cuello de botella.
Números:
- Cada número que lo muestra, con qué significa.
Un párrafo que explica el mecanismo.

# Causas
### Causa 1: título corto
Un párrafo con la evidencia.
(de 2 a 4 causas)

# Causa vs potenciadores
Un párrafo: cuál es la causa de fondo y qué cosas son potenciadores que hoy no alcanzan.

# Qué no hacer
- **No hacer tal cosa.** Por qué no.

# Solución
### 5.1 Título
Qué hacer y cómo, con un ejemplo concreto en una línea "> ".
(de 2 a 4 subsecciones: 5.1, 5.2, ...)

# Métricas a mirar
- **Métrica:** qué mide, cuánto da hoy y cuál es el objetivo.

# Expectativas
- **Semana 1:** qué tiene que estar hecho.
- **Semana 2:** ...
- **Objetivo:** el resultado al final.

# Cierre
Una o dos frases con la idea de fondo que el cliente se tiene que llevar."""


# ---------- texto ----------

def _norm(t: str) -> str:
    t = unicodedata.normalize("NFD", (t or "").lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn").strip()


_CLAVES = {**{_norm(s): s for s in SECCIONES}, **{_norm(k): v for k, v in _ALIAS.items()}}


def _clave(titulo: str) -> str | None:
    """El título de una sección sin número ("2. Causas") ni dos puntos."""
    t = re.sub(r"^\d+(\.\d+)*[.)]?\s*", "", _norm(titulo)).rstrip(":").strip()
    return _CLAVES.get(t)


def secciones(texto: str, con_marcas: bool = False) -> dict[str, str]:
    """El documento partido por sus "# Sección". Lo que no cae en una sección conocida se ignora."""
    salida: dict[str, list[str]] = {}
    actual = None
    for linea in (texto if con_marcas else cuellos_capturas.sin_marcas(texto)).splitlines():
        m = re.match(r"^\s*#\s+(?!#)(.+?)\s*$", linea)
        if m:
            actual = _clave(m.group(1))
            if actual:
                salida.setdefault(actual, [])
            continue
        if actual:
            salida[actual].append(linea)
    return {k: "\n".join(v).strip() for k, v in salida.items()}


def _palabras(t: str) -> list[str]:
    return re.findall(r"\w+", _norm(t))


def parecido(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    return SequenceMatcher(None, _palabras(a), _palabras(b), autojunk=False).ratio()


def coincidencia(version: str, final: str) -> float:
    """Cuánto se parece una versión a la final de Juan: sección por sección, pesado por lo largo de la final."""
    sv, sf = secciones(version), secciones(final)
    total = peso = 0.0
    for s in SECCIONES:
        f = sf.get(s, "")
        w = max(len(_palabras(f)), 1) if (f or sv.get(s)) else 0
        if not w:
            continue
        total += w * parecido(sv.get(s, ""), f)
        peso += w
    return round(total / peso, 3) if peso else 0.0


def cambios(jeremy: str, final: str) -> list[dict]:
    """Las secciones que Juan cambió de verdad (no un retoque de una palabra)."""
    sj, sf = secciones(jeremy), secciones(final)
    salida = []
    for s in SECCIONES:
        a, b = sj.get(s, ""), sf.get(s, "")
        p = parecido(a, b)
        if p < 0.97:
            salida.append({"seccion": s, "antes": a, "despues": b, "parecido": round(p, 2)})
    return salida


# ---------- Loom ----------

def id_loom(url: str) -> str | None:
    m = re.search(r"loom\.com/(?:share|embed)/([0-9a-f]{32})", url or "")
    return m.group(1) if m else None


def transcripcion_loom(url: str) -> str:
    """La transcripción de un Loom público con la marca de tiempo de cada frase ("07:40 …")."""
    vid = id_loom(url)
    if not vid:
        raise ValueError("Ese link no es de un Loom (tiene que ser loom.com/share/…).")
    q = ("query FetchVideoTranscript($videoId: ID!, $password: String) { fetchVideoTranscript(videoId: $videoId, password: $password) "
         "{ ... on VideoTranscriptDetails { source_url } ... on GenericError { message } } }")
    with httpx.Client(timeout=30) as c:
        r = c.post("https://www.loom.com/graphql", json={"operationName": "FetchVideoTranscript", "variables": {"videoId": vid, "password": None}, "query": q},
                   headers={"x-loom-request-source": "loom_web"})
        r.raise_for_status()
        fuente = ((r.json().get("data") or {}).get("fetchVideoTranscript") or {}).get("source_url")
        if not fuente:
            raise ValueError("Loom no devolvió la transcripción (¿el video es privado o todavía se está procesando?).")
        frases = c.get(fuente).json().get("phrases") or []
    texto = "\n".join(f"{int(p['ts'] // 60):02d}:{int(p['ts'] % 60):02d} {p['value']}" for p in frases if p.get("value"))
    if not texto:
        raise ValueError("El Loom no tiene transcripción.")
    if len(texto) > TOPE_TRANSCRIPCION:
        mitad = TOPE_TRANSCRIPCION // 2
        texto = texto[:mitad] + "\n[…]\n" + texto[-mitad:]
    return texto


# ---------- contexto del cliente ----------

def _fecha(d) -> str:
    return d.strftime("%d-%m") if d else "s/f"


def _cliente(cliente_id: int) -> ClienteExterno:
    c = ClienteExterno.get(id=cliente_id)
    if c is None:
        raise HTTPException(status_code=404, detail="No existe ese cliente.")
    return c


def contexto_cliente(cliente_id: int) -> dict:
    """Lo que se le pasa a Jeremy y al cerebro: datos con fecha y fuente, nada interpretado."""
    from src.services.aprendizaje_service import perfil_de

    p = perfil_de(cliente_id)
    with db_session:
        c = _cliente(cliente_id)
        nombre, plan = c.nombre or c.email, c.plan_actual
        canal = Canal.get(cliente_id=cliente_id)
        mensajes = []
        if canal is not None:
            cid = canal.id
            mensajes = list(MensajeCanal.select_by_sql(
                f'SELECT * FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = $cid AND NOT borrado AND texto <> \'\' ORDER BY id DESC LIMIT 80'))[::-1]
        equipo = {a.id: (a.nombre or a.email or "Equipo").split(" ")[0] for a in list(Admin.select())}
        chat = "\n".join(
            f"[{_fecha(m.creado_en)}] {'Cliente' if m.autor_tipo == 'cliente' else equipo.get(m.autor_id, 'Equipo')}: {(m.texto or '').strip()[:600]}"
            for m in mensajes)
        llamadas = sorted([l for l in list(Llamada.select()) if l.cliente_id == cliente_id], key=lambda l: l.inicio or l.creado_en, reverse=True)[:5]
        textos_ll = []
        for l in llamadas:
            puntos = ""
            try:
                datos = json.loads(l.puntos_json or "null") or {}
                puntos = "; ".join(str(x.get("texto") if isinstance(x, dict) else x) for k in ("temas", "decisiones", "compromisos") for x in (datos.get(k) or []))
            except (ValueError, AttributeError):
                puntos = ""
            textos_ll.append(f"[llamada {_fecha(l.inicio)}] {l.titulo or ''}: {(puntos or l.resumen or '').strip()[:1500]}")
        cierre = db.select(
            f'SELECT periodo, respuestas_json FROM "{DB_SCHEMA}"."cierres_respuestas" WHERE cliente_id = $c ORDER BY completado_en DESC LIMIT 1',
            {"c": cliente_id})
    perfil = p.get("perfil") or {}
    hechos = "\n".join(f"- [{h['tipo']}] {h['texto']} ({h['dicho_en'][:10]})" for h in p.get("hechos", [])[:40])
    texto_cierre = ""
    if cierre:
        periodo, rj = cierre[0]
        r = json.loads(rj or "{}")
        campos = [("conversaciones", "Conversaciones"), ("agendas", "Agendas"), ("llamadas", "Llamadas"), ("ventas", "Ventas"),
                  ("cash", "Cash collected (USD)"), ("facturacion", "Facturación (USD)"), ("cuello", "Cuello de botella que marcó"),
                  ("cuello_por_que", "Por qué"), ("oferta", "Oferta"), ("avatar", "Avatar")]
        texto_cierre = f"Cierre {periodo}:\n" + "\n".join(f"- {n}: {r[k]}" for k, n in campos if r.get(k) not in (None, ""))
    return {
        "cliente": nombre,
        "plan": plan or "",
        "perfil": perfil,
        "hechos": hechos or "(sin hechos registrados)",
        "chat": chat or "(sin mensajes)",
        "llamadas": "\n".join(textos_ll) or "(sin llamadas registradas)",
        "cierre": texto_cierre or "(no completó cierres de mes)",
    }


_CAMPOS_CIERRE = [
    ("oferta", "Oferta"), ("avatar", "Avatar"),
    ("reels", "Reels"), ("historias", "Secuencias de historias"), ("youtube", "Videos de YouTube"),
    ("cta_historias", "CTAs en historias"), ("cta_reels", "CTAs en reels"),
    ("conversaciones", "Conversaciones"), ("agendas", "Agendas"), ("llamadas", "Llamadas"), ("ventas", "Ventas"),
    ("cash", "Cash collected (USD)"), ("facturacion", "Facturación (USD)"),
    ("cuello", "Su principal cuello de botella"), ("cuello_por_que", "Por qué"),
    ("satisfaccion", "Conformidad con ATV (1 a 10)"), ("satisfaccion_por_que", "Por qué esa nota"),
    ("propuesta", "Qué agregaría en ATV"),
]


def texto_cierre(cliente_id: int, periodo: str) -> str:
    """El reporte de cierre de mes que completó el cliente, como texto para Jeremy y el cerebro."""
    from src.services.cierre_service import tasas

    with db_session:
        filas = db.select(
            f'SELECT creador, respuestas_json FROM "{DB_SCHEMA}"."cierres_respuestas" WHERE cliente_id = $cliente_id AND periodo = $periodo ORDER BY completado_en',
            {"cliente_id": cliente_id, "periodo": periodo})
    if not filas:
        raise HTTPException(status_code=404, detail="Ese cliente no completó el cierre de ese mes.")
    bloques = []
    for creador, rj in filas:
        r = json.loads(rj or "{}")
        cab = f"Reporte de cierre de mes {periodo}" + (f" (creador {creador})" if creador else "") + " que completó el cliente:"
        if isinstance(r.get("typeform"), list):  # importado del Typeform viejo: pregunta y respuesta tal cual
            lineas = [f"- {preg}: {val}" for preg, val in r["typeform"] if val not in (None, "")]
        else:
            lineas = [f"- {nombre}: {r[k]}" for k, nombre in _CAMPOS_CIERRE if r.get(k) not in (None, "")]
            t = tasas(r)
            lineas += [f"- Tasa de {k}: {v}%" for k, v in t.items() if v is not None]
        bloques.append(cab + "\n" + "\n".join(lineas))
    return "\n\n".join(bloques)


def lecciones_texto() -> str:
    with db_session:
        filas = list(CuelloLeccion.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."cuellos_lecciones" WHERE activa ORDER BY id DESC LIMIT 40'))
    return "\n".join(f"- {l.texto}" for l in filas) or "(todavía ninguna)"


def armar_payload(d: dict, ctx: dict, lecciones: str) -> dict:
    perfil = ctx["perfil"]
    contexto = d.get("contexto") or perfil.get("que_vende") or perfil.get("nicho_texto") or ""
    return {
        "diagnostico_id": str(d["id"]),
        "cliente": ctx["cliente"],
        "plan": ctx["plan"],
        "contexto": contexto,
        "transcripcion": d["transcripcion"],
        "hechos": ctx["hechos"],
        "chat": ctx["chat"],
        "llamadas": ctx["llamadas"],
        "cierre": ctx["cierre"],
        "lecciones": lecciones,
        "fecha": datetime.utcnow().strftime("%d-%m-%Y"),
        "callback_url": f"{CLASSROOM_URL}/api/cuellos/jeremy/{d['token']}",
    }


def _mensaje_cerebro(p: dict) -> str:
    return (f"Cliente: {p['cliente']}\nPlan en ATV: {p['plan']}\nQué hace y a quién le vende: {p['contexto']}\n\n"
            f"Lo que mandó el cliente (transcripción de su Loom, su reporte de cierre de mes o lo que escribió):\n{p['transcripcion']}\n\nLo que ya sabemos de este cliente (hechos con fecha y fuente):\n{p['hechos']}\n\n"
            f"Su chat con el equipo (últimos mensajes):\n{p['chat']}\n\nSus llamadas con el equipo (resúmenes):\n{p['llamadas']}\n\n"
            f"Su último cierre de mes (números que reportó):\n{p['cierre']}\n\nLecciones que Juan ya corrigió en otros diagnósticos (respetalas siempre):\n{p['lecciones']}\n\n"
            f"Hoy es {p['fecha']}.")


# ---------- IA ----------

def _llamar(sistema: str, usuario: str, modelo: str = MODELO, max_tokens: int = 3000) -> str:
    from anthropic import Anthropic

    r = Anthropic(api_key=config("ANTHROPIC_API_KEY", default=""), timeout=240).messages.create(
        model=modelo, max_tokens=max_tokens, system=sistema, messages=[{"role": "user", "content": usuario}])
    try:
        gasto_ia.registrar("cuellos", r.usage)
    except Exception:  # el registro nunca corta el diagnóstico
        pass
    return "".join(b.text for b in r.content if getattr(b, "type", "") == "text").strip()


def _mandar_a_jeremy(payload: dict) -> None:
    if not (JEREMY_URL and JEREMY_SECRET):
        raise RuntimeError("Falta configurar Juan AI (JEREMY_BOTTLENECK_URL y JEREMY_BOTTLENECK_SECRET).")
    r = httpx.post(JEREMY_URL, json=payload, headers={"x-webhook-secret": JEREMY_SECRET}, timeout=30)
    if r.status_code >= 300:
        raise RuntimeError(f"Juan AI respondió {r.status_code}.")


# ---------- recorrido ----------

def _poner(diag_id: int, **campos) -> None:
    with db_session:
        d = CuelloDiagnostico.get(id=diag_id)
        for k, v in campos.items():
            setattr(d, k, v)


def procesar(diag_id: int, llamar=_llamar, mandar=_mandar_a_jeremy, leer_loom=transcripcion_loom) -> None:
    """Transcripción → contexto → Jeremy, y la versión del cerebro en silencio. Corre en segundo plano."""
    try:
        with db_session:
            d = CuelloDiagnostico.get(id=diag_id)
            datos = {"id": d.id, "cliente_id": d.cliente_id, "loom_url": d.loom_url, "contexto": d.contexto, "transcripcion": d.transcripcion, "token": d.token}
        if not datos["transcripcion"]:
            if not datos["loom_url"]:
                raise ValueError("Falta el Loom o el texto del cliente.")
            datos["transcripcion"] = leer_loom(datos["loom_url"])
            _poner(diag_id, transcripcion=datos["transcripcion"])
        payload = armar_payload(datos, contexto_cliente(datos["cliente_id"]), lecciones_texto())
        mandar(payload)
        _poner(diag_id, estado="esperando", error=None)
    except Exception as e:  # noqa: BLE001 — el error queda a la vista en la carpeta, con "Reintentar"
        logger.exception("Cuello %s: no se pudo pedir a Jeremy", diag_id)
        _poner(diag_id, estado="error", error=str(e)[:500])
        return
    armar_cerebro(diag_id, llamar, payload)


def armar_cerebro(diag_id: int, llamar=_llamar, payload: dict | None = None) -> bool:
    """La versión del cerebro, en silencio. Si falla, se vuelve a intentar cuando vuelve Jeremy."""
    try:
        if payload is None:
            with db_session:
                d = CuelloDiagnostico.get(id=diag_id)
                if d is None or d.version_cerebro or not d.transcripcion:
                    return False
                datos = {"id": d.id, "cliente_id": d.cliente_id, "contexto": d.contexto, "transcripcion": d.transcripcion, "token": d.token}
            payload = armar_payload(datos, contexto_cliente(datos["cliente_id"]), lecciones_texto())
        _poner(diag_id, version_cerebro=llamar(INSTRUCCIONES, _mensaje_cerebro(payload)))
        return True
    except Exception:  # noqa: BLE001 — sin la versión del cerebro el caso igual sirve para Juan
        logger.exception("Cuello %s: el cerebro no pudo armar su versión", diag_id)
        return False


def _mensajes_largos(admin_id: int) -> list[str]:
    """Sus explicaciones largas a clientes: se parecen más a un documento que los mensajes cortos de la voz."""
    from src.services.aprendizaje_service import _nombres_ajenos, ocultar_nombres

    with db_session:
        textos = list(db.select(
            f'SELECT m.texto FROM "{DB_SCHEMA}"."mensajes_canal" m JOIN "{DB_SCHEMA}"."canales" c ON c.id = m.canal '
            "WHERE m.autor_tipo = 'admin' AND m.autor_id = $admin_id AND NOT m.borrado AND c.tipo = 'cliente' "
            "AND length(m.texto) BETWEEN 150 AND 900 ORDER BY m.creado_en DESC LIMIT 18"
        ))
    nombres, _ = _nombres_ajenos()
    return [ocultar_nombres(t, nombres) for t in textos]


def _con_voz(texto: str, admin_id: int, llamar) -> tuple[str, list[str]]:
    """El documento reescrito con la voz de un coach, y las secciones que quedaron como estaban."""
    from src.services.aprendizaje_service import voz_de, voz_para_ia
    from src.services.sugerencias_service import _describir_voz

    with db_session:
        coach = Admin.get(id=admin_id)
        if coach is None:
            raise HTTPException(status_code=404, detail="No existe ese coach.")
        nombre = coach.nombre or coach.email
    voz = voz_para_ia(voz_de(admin_id))
    if not voz.get("ejemplos"):
        raise HTTPException(status_code=409, detail=f"Todavía no hay mensajes de {nombre} para aprender su voz.")
    rasgos = voz.get("rasgos") or {}
    ejemplos = _mensajes_largos(admin_id) + voz["ejemplos"]
    partes, sin_cambiar = cuellos_tono.reescribir(secciones(texto, con_marcas=True), nombre, _describir_voz(rasgos), ejemplos, rasgos, llamar)
    return "\n\n".join(f"# {s}\n{partes[s].strip()}" for s in SECCIONES if partes.get(s)), sin_cambiar


def _no_vacio(texto: str) -> None:
    """Un documento sin texto en ninguna sección nunca pisa al borrador (pasó con la ventana abierta esperando a Jeremy)."""
    if not any(secciones(texto).values()):
        raise HTTPException(status_code=422, detail="El documento quedó vacío: cerrá y volvé a abrir el diagnóstico antes de guardar.")


def cuello(texto: str) -> str:
    """El cuello de botella en una frase: la primera del Diagnóstico ("El problema no es el tráfico. ...")."""
    primera = next((l.strip() for l in secciones(texto).get("Diagnóstico", "").splitlines() if l.strip()), "")
    primera = re.sub(r"\*\*|^[-•>]\s*", "", primera)
    return primera if len(primera) <= 140 else primera[:139].rsplit(" ", 1)[0] + "…"


def para_roadmap(diag_id: int, cliente_id: int) -> str:
    """El diagnóstico aprobado de ese cliente, como texto para la IA del roadmap (sin las capturas)."""
    with db_session:
        d = CuelloDiagnostico.get(id=diag_id)
        if d is None or d.cliente_id != cliente_id or d.estado != "aprobado":
            raise HTTPException(status_code=404, detail="Ese diagnóstico no es de este cliente o todavía no se aprobó.")
        return cuellos_capturas.sin_marcas(d.version_final or "").strip()


def _en_segundo_plano(diag_id: int) -> None:
    threading.Thread(target=procesar, args=(diag_id,), daemon=True).start()


def _nombres_clientes(ids: set[int]) -> dict[int, str]:
    if not ids:
        return {}
    return {c.id: c.nombre or c.email for c in list(ClienteExterno.select(lambda c: c.id in ids))}


def _resumen(d: CuelloDiagnostico, nombres: dict) -> dict:
    return {
        "id": d.id, "cliente_id": d.cliente_id, "cliente": nombres.get(d.cliente_id, f"Cliente {d.cliente_id}"),
        "estado": d.estado, "error": d.error, "loom_url": d.loom_url,
        "creado_en": d.creado_en.isoformat() + "Z", "respondido_en": d.respondido_en.isoformat() + "Z" if d.respondido_en else None,
        "aprobado_en": d.aprobado_en.isoformat() + "Z" if d.aprobado_en else None,
        "coincidencia_jeremy": d.coincidencia_jeremy, "coincidencia_cerebro": d.coincidencia_cerebro,
    }


class CuellosServices:
    def pedir(self, sesion: dict, cliente_id: int, loom_url: str | None, texto: str | None, contexto: str | None, en_fondo=_en_segundo_plano,
              cierre_periodo: str | None = None) -> dict:
        """El cliente cuenta su traba de una de tres formas: un Loom, su reporte de cierre de mes o escrita."""
        loom_url, texto = (loom_url or "").strip() or None, (texto or "").strip() or None
        if cierre_periodo:
            texto = texto_cierre(cliente_id, cierre_periodo) + (f"\n\nLo que agrega el equipo:\n{texto}" if texto else "")
            loom_url = None
        elif texto and not loom_url:
            texto = f"Lo que contó el cliente sobre su traba:\n{texto}"
        if not loom_url and not texto:
            raise HTTPException(status_code=422, detail="Pegá el Loom, elegí un cierre de mes o contá su problema.")
        if loom_url and not id_loom(loom_url):
            raise HTTPException(status_code=422, detail="Ese link no es de un Loom (tiene que ser loom.com/share/…).")
        with db_session:
            _cliente(cliente_id)
            d = CuelloDiagnostico(cliente_id=cliente_id, admin_id=sesion["usuario_id"], loom_url=loom_url, transcripcion=texto,
                                  contexto=(contexto or "").strip()[:500] or None, token=secrets.token_urlsafe(24))
            d.flush()
            diag_id = d.id
        en_fondo(diag_id)
        return self.detalle(diag_id)

    def reintentar(self, diag_id: int, en_fondo=_en_segundo_plano) -> dict:
        with db_session:
            d = CuelloDiagnostico.get(id=diag_id)
            if d is None:
                raise HTTPException(status_code=404, detail="No existe ese diagnóstico.")
            if d.estado not in ("error", "esperando"):
                raise HTTPException(status_code=409, detail="Este diagnóstico ya volvió de Juan AI.")
            d.estado, d.error = "pidiendo", None
        en_fondo(diag_id)
        return self.detalle(diag_id)

    def recibir(self, token: str, cuerpo: dict) -> dict:
        """Lo que devuelve Jeremy. La dirección lleva el token: no hace falta otra clave."""
        salida = (cuerpo or {}).get("output")
        if not isinstance(salida, str) or not salida.strip():
            raise HTTPException(status_code=422, detail="Falta output.")
        with db_session:
            d = CuelloDiagnostico.get(token=token)
            if d is None:
                raise HTTPException(status_code=404, detail="No existe.")
            if d.estado == "aprobado":
                return {"ok": True}
            salida = cuellos_capturas.separar(salida.strip())
            d.version_jeremy = salida
            if not d.version_final:
                d.version_final = d.version_jeremy
            d.estado, d.error, d.respondido_en = "borrador", None, datetime.utcnow()
            falta_cerebro = not d.version_cerebro
            loom, token = id_loom(d.loom_url), d.token
        if loom and cuellos_capturas.marcas(salida):
            threading.Thread(target=cuellos_capturas.preparar, args=(loom, token, salida), daemon=True).start()
        if falta_cerebro:
            threading.Thread(target=armar_cerebro, args=(d.id,), daemon=True).start()
        return {"ok": True}

    def captura(self, token: str, segundo: int):
        with db_session:
            d = CuelloDiagnostico.get(token=token)
            loom = id_loom(d.loom_url) if d else None
        if not loom or not 0 <= segundo <= 6 * 3600:
            raise HTTPException(status_code=404, detail="No hay captura.")
        try:
            return cuellos_capturas.sacar(loom, token, segundo)
        except Exception as e:  # noqa: BLE001
            logger.exception("Cuello %s: captura %s", token[:6], segundo)
            raise HTTPException(status_code=502, detail="No se pudo sacar la captura del Loom.") from e

    def guardar(self, diag_id: int, texto: str) -> dict:
        _no_vacio(texto)
        with db_session:
            d = CuelloDiagnostico.get(id=diag_id)
            if d is None:
                raise HTTPException(status_code=404, detail="No existe ese diagnóstico.")
            if d.estado != "borrador":
                raise HTTPException(status_code=409, detail="Solo se corrige el borrador que devolvió Jeremy.")
            d.version_final = texto
        return self.detalle(diag_id)

    def aprobar(self, sesion: dict, diag_id: int, texto: str | None = None, llamar=_llamar) -> dict:
        """Cierra la versión final, mide a Jeremy y al cerebro contra ella y propone una lección por cada sección
        que Juan cambió (Juan la confirma, la reescribe o la descarta)."""
        with db_session:
            d = CuelloDiagnostico.get(id=diag_id)
            if d is None:
                raise HTTPException(status_code=404, detail="No existe ese diagnóstico.")
            if d.estado != "borrador":
                raise HTTPException(status_code=409, detail="Solo se aprueba el borrador que devolvió Jeremy.")
            if texto is not None:
                _no_vacio(texto)
                d.version_final = texto
            # Con tono, la base es el borrador ya reescrito: el cambio de voz no cuenta como corrección de Juan.
            final, jeremy, cerebro, voz_id = d.version_final or "", d.version_tono or d.version_jeremy or "", d.version_cerebro, d.tono_admin_id
            d.coincidencia_jeremy = coincidencia(jeremy, final)
            d.coincidencia_cerebro = coincidencia(cerebro, final) if cerebro else None
            d.estado, d.aprobado_por, d.aprobado_en = "aprobado", sesion["usuario_id"], datetime.utcnow()
        if cerebro and voz_id:
            # Para que la comparación sea justa, el cerebro se mide con la misma voz.
            try:
                cerebro_con_voz, _ = _con_voz(cerebro, voz_id, llamar)
                _poner(diag_id, coincidencia_cerebro=coincidencia(cerebro_con_voz, final))
            except HTTPException:
                pass
        propuestas = []
        for c in cambios(jeremy, final):
            propuestas.append({**c, "propuesta": _proponer_leccion(c, llamar)})
        return {**self.detalle(diag_id), "cambios": propuestas}

    def guardar_lecciones(self, diag_id: int, lecciones: list[dict]) -> dict:
        with db_session:
            d = CuelloDiagnostico.get(id=diag_id)
            if d is None or d.estado != "aprobado":
                raise HTTPException(status_code=409, detail="Primero se aprueba el diagnóstico.")
            for l in lecciones:
                texto = (l.get("texto") or "").strip()
                if texto and l.get("seccion") in SECCIONES:
                    CuelloLeccion(diagnostico_id=diag_id, seccion=l["seccion"], antes=(l.get("antes") or "")[:4000],
                                  despues=(l.get("despues") or "")[:4000], texto=texto[:400])
        return self.neurona()

    def borrar(self, diag_id: int) -> dict:
        """Click derecho → Borrar en la carpeta (Franco, 02-11-2026). Las lecciones que dejó quedan: ya son de la neurona.
        Si Jeremy vuelve tarde con uno borrado, la vuelta da 404 y no pasa nada."""
        with db_session:
            d = CuelloDiagnostico.get(id=diag_id)
            if d is None:
                raise HTTPException(status_code=404, detail="No existe ese diagnóstico.")
            token = d.token
            d.delete()
        for f in cuellos_capturas.CAPTURAS_DIR.glob(f"{token}-*.jpg"):
            f.unlink(missing_ok=True)
        return {"ok": True}

    def desactivar_leccion(self, leccion_id: int) -> dict:
        with db_session:
            l = CuelloLeccion.get(id=leccion_id)
            if l is None:
                raise HTTPException(status_code=404, detail="No existe esa lección.")
            l.activa = False
        return self.neurona()

    def clientes(self) -> list[dict]:
        """Para elegir a quién se le hace el diagnóstico: los clientes con canal en el classroom."""
        with db_session:
            ids = {c.cliente_id for c in list(Canal.select()) if c.cliente_id and not c.inactivo}
            filas = list(ClienteExterno.select(lambda c: c.id in ids)) if ids else []
            return sorted(({"id": c.id, "nombre": c.nombre or c.email, "plan": c.plan_actual} for c in filas), key=lambda x: _norm(x["nombre"]))

    def de_cliente(self, cliente_id: int, admin_id: int | None = None) -> dict:
        """Para la acción rápida del chat: el último diagnóstico del cliente, si tiene. Uno sin enviar es de quien lo
        pidió (Franco, 02-11-2026): si Juan dejó el suyo a medias, a otro coach no le aparece."""
        with db_session:
            _cliente(cliente_id)
            ultimo = CuelloDiagnostico.select_by_sql(
                f'SELECT * FROM "{DB_SCHEMA}"."cuellos_diagnosticos" WHERE cliente_id = $cliente_id'
                f' AND (estado = \'aprobado\' OR admin_id = $admin_id) ORDER BY id DESC LIMIT 1')
            cierres = db.select(
                f'SELECT periodo, creador, respuestas_json FROM "{DB_SCHEMA}"."cierres_respuestas" WHERE cliente_id = $cliente_id ORDER BY periodo DESC, completado_en')
            lista, vistos = [], set()
            for periodo, creador, rj in cierres:
                if periodo in vistos:
                    continue
                vistos.add(periodo)
                r = json.loads(rj or "{}")
                lista.append({"periodo": periodo, "cuello": r.get("cuello"), "typeform": isinstance(r.get("typeform"), list)})
            aprobados = list(CuelloDiagnostico.select_by_sql(
                f'SELECT * FROM "{DB_SCHEMA}"."cuellos_diagnosticos" WHERE cliente_id = $cliente_id AND estado = \'aprobado\' ORDER BY aprobado_en DESC LIMIT 10'))
            return {"ultimo": ultimo[0].id if ultimo else None, "jeremy": bool(JEREMY_URL and JEREMY_SECRET), "cierres": lista,
                    # Para "Crear roadmap": el roadmap puede salir de un diagnóstico ya aprobado, para resolverlo.
                    "aprobados": [{"id": d.id, "aprobado_en": d.aprobado_en.isoformat() + "Z", "cuello": cuello(d.version_final)} for d in aprobados]}

    def lista(self) -> dict:
        with db_session:
            filas = list(CuelloDiagnostico.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."cuellos_diagnosticos" ORDER BY id DESC LIMIT 200'))
            nombres = _nombres_clientes({d.cliente_id for d in filas})
            return {"diagnosticos": [_resumen(d, nombres) for d in filas], "jeremy": bool(JEREMY_URL and JEREMY_SECRET)}

    def detalle(self, diag_id: int) -> dict:
        with db_session:
            d = CuelloDiagnostico.get(id=diag_id)
            if d is None:
                raise HTTPException(status_code=404, detail="No existe ese diagnóstico.")
            nombres = _nombres_clientes({d.cliente_id})
            aprobado = d.estado == "aprobado"
            return {
                **_resumen(d, nombres),
                "contexto": d.contexto,
                "transcripcion": d.transcripcion,
                "version_jeremy": d.version_jeremy,
                "version_final": d.version_final,
                # La del cerebro recién se muestra aprobado: Juan corrige sin verla.
                "version_cerebro": d.version_cerebro if aprobado else None,
                "cerebro_listo": bool(d.version_cerebro),
                "secciones": SECCIONES,
                # Las capturas del Loom: <base>/<segundo>.jpg, sin sesión (la dirección lleva el token).
                "captura_base": f"/api/cuellos/captura/{d.token}" if id_loom(d.loom_url) else None,
                "doc_activo": google_docs_service.activo(),
                "doc_url": d.doc_url,
                "version_tono": d.version_tono,
                "tono_admin_id": d.tono_admin_id,  # None: todavía no se eligió · 0: como lo escribió Juan AI
                "lecciones": [{"id": l.id, "seccion": l.seccion, "texto": l.texto} for l in list(CuelloLeccion.select(lambda l: l.diagnostico_id == diag_id))],
            }

    def tono(self, diag_id: int, admin_id: int | None = None, texto: str | None = None, llamar=_llamar) -> dict:
        """Lo primero al abrir el borrador: con qué voz sale. Reescribe lo que hay (texto: lo que venía corrigiendo Juan)
        y eso es lo que se corrige y se aprueba. Sin admin_id queda como lo escribió Juan AI."""
        with db_session:
            d = CuelloDiagnostico.get(id=diag_id)
            if d is None:
                raise HTTPException(status_code=404, detail="No existe ese diagnóstico.")
            if d.estado != "borrador":
                raise HTTPException(status_code=409, detail="El tono se elige antes de aprobar.")
            if texto is not None:
                _no_vacio(texto)
            base = texto if texto is not None else (d.version_final or d.version_jeremy or "")
            if admin_id is None:
                d.version_final, d.tono_admin_id = base, 0
                return {**self.detalle(diag_id), "sin_cambiar": []}
        nuevo, sin_cambiar = _con_voz(base, admin_id, llamar)
        with db_session:
            d = CuelloDiagnostico[diag_id]
            # version_tono es el punto de partida: lo que Juan cambie desde acá es lo que aprende la neurona.
            d.version_final, d.version_tono, d.tono_admin_id = nuevo, nuevo, admin_id
        return {**self.detalle(diag_id), "sin_cambiar": sin_cambiar}

    def reabrir(self, diag_id: int) -> dict:
        """Atrás desde el aprobado: vuelve a borrador con lo que tenía, para seguir corrigiendo."""
        with db_session:
            d = CuelloDiagnostico.get(id=diag_id)
            if d is None:
                raise HTTPException(status_code=404, detail="No existe ese diagnóstico.")
            if d.estado != "aprobado":
                raise HTTPException(status_code=409, detail="Ese diagnóstico no está aprobado.")
            d.estado, d.aprobado_por, d.aprobado_en = "borrador", None, None
            d.coincidencia_jeremy = d.coincidencia_cerebro = None
            d.doc_url = None
        return self.detalle(diag_id)

    def google_doc(self, diag_id: int, html: str, editor: str | None = None) -> dict:
        """El diagnóstico aprobado como Google Doc. Si ya se creó, devuelve el mismo link."""
        with db_session:
            d = CuelloDiagnostico.get(id=diag_id)
            if d is None:
                raise HTTPException(status_code=404, detail="No existe ese diagnóstico.")
            if d.estado != "aprobado":
                raise HTTPException(status_code=409, detail="Primero hay que aprobar la versión final.")
            if d.doc_url:
                return {"url": d.doc_url}
            titulo = f"Diagnóstico {_nombres_clientes({d.cliente_id}).get(d.cliente_id, '')}".strip()
        url = google_docs_service.crear(titulo, html, editor)
        with db_session:
            CuelloDiagnostico[diag_id].doc_url = url
        return {"url": url}

    def neurona(self) -> dict:
        """La carpeta de Franco: cuánto se parece el cerebro (y Jeremy) a lo que deja Juan, semana a semana."""
        with db_session:
            aprobados = list(CuelloDiagnostico.select_by_sql(
                f'SELECT * FROM "{DB_SCHEMA}"."cuellos_diagnosticos" WHERE estado = \'aprobado\' ORDER BY aprobado_en'))
            lecciones = list(CuelloLeccion.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."cuellos_lecciones" ORDER BY id DESC'))
            pedidos = [d.creado_en for d in list(CuelloDiagnostico.select())]
            nombres = _nombres_clientes({d.cliente_id for d in aprobados})
            semanas: dict[str, dict] = {}
            for d in aprobados:
                lunes = (d.aprobado_en - timedelta(days=d.aprobado_en.weekday())).date().isoformat()
                s = semanas.setdefault(lunes, {"semana": lunes, "casos": 0, "jeremy": [], "cerebro": []})
                s["casos"] += 1
                if d.coincidencia_jeremy is not None:
                    s["jeremy"].append(d.coincidencia_jeremy)
                if d.coincidencia_cerebro is not None:
                    s["cerebro"].append(d.coincidencia_cerebro)
            prom = lambda xs: round(sum(xs) / len(xs), 3) if xs else None  # noqa: E731
            serie = [{"semana": s["semana"], "casos": s["casos"], "jeremy": prom(s["jeremy"]), "cerebro": prom(s["cerebro"])} for s in semanas.values()]
            ultimas = [s["cerebro"] for s in serie[-3:]]
            fase = 2 if len(ultimas) == 3 and all(x is not None and x >= UMBRAL_FASE for x in ultimas) else 1
            return {
                "fase": fase,
                "umbral": UMBRAL_FASE,
                "casos": len(aprobados),
                "pedidos": len(pedidos),
                "coincidencia_cerebro": prom([d.coincidencia_cerebro for d in aprobados if d.coincidencia_cerebro is not None]),
                "coincidencia_jeremy": prom([d.coincidencia_jeremy for d in aprobados if d.coincidencia_jeremy is not None]),
                "serie": serie,
                "casos_lista": [_resumen(d, nombres) for d in reversed(aprobados)],
                # Cada lección va en todos los pedidos que se hicieron después de escrita.
                "lecciones": [
                    {"id": l.id, "seccion": l.seccion, "texto": l.texto, "antes": l.antes, "despues": l.despues, "activa": l.activa,
                     "diagnostico_id": l.diagnostico_id, "creado_en": l.creado_en.isoformat() + "Z",
                     "usada": sum(1 for p in pedidos if p > l.creado_en)}
                    for l in lecciones
                ],
                "secciones_corregidas": {s: sum(1 for l in lecciones if l.seccion == s) for s in SECCIONES},
            }


_PEDIDO_LECCION = """Juan, el dueño de ATV, corrigió una sección de un diagnóstico de cuello de botella que armó una IA.
Te paso la sección como estaba y como la dejó Juan. Escribí en UNA línea la regla que la IA tiene que seguir de ahora
en adelante para no repetir el error, en general (para cualquier cliente), sin nombres ni números de este cliente.
Si la diferencia es solo de redacción y no deja ninguna regla, respondé exactamente: NINGUNA"""


def _proponer_leccion(c: dict, llamar) -> str:
    try:
        r = llamar(_PEDIDO_LECCION, f"Sección: {c['seccion']}\n\nComo estaba:\n{c['antes'] or '(vacía)'}\n\nComo la dejó Juan:\n{c['despues'] or '(la borró)'}",
                   MODELO_LECCION, 200)
    except Exception:  # noqa: BLE001 — sin propuesta, Juan la escribe
        return ""
    r = r.strip().strip('"').splitlines()[0] if r.strip() else ""
    return "" if r.upper().startswith("NINGUNA") else r[:300]
