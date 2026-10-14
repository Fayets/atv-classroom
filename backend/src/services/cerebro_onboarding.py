"""El cerebro lee el formulario de onboarding de cada cliente (49 preguntas de atv-onboarding).

- La ficha la arma el CÓDIGO copiando las respuestas: oferta, precio, avatar, facturación, canales,
  equipo, objetivo a 4 meses, qué probó antes, por qué entró… (son datos que el cliente escribió).
- La IA solo hace lo que el código no puede: ubicar el nicho en la lista del cerebro y sacar dolores,
  objeciones y logros, cada uno con la cita textual del formulario (el código verifica que la cita esté).
- El perfil del cliente solo se completa donde está vacío: lo que dijo después en el chat es más nuevo.
- Los hechos del onboarding entran al cerebro como los de las conversaciones (alimentan los nichos).
"""

import json
import logging
import re
from datetime import datetime
from pathlib import Path

from decouple import config
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.models import Canal, ClienteExterno, HechoCerebro, OnboardingCerebro, PerfilCliente
from src.services import gasto_ia
from src.services.aprendizaje_service import ETAPAS, NICHOS, _norm, leer_json
from src.services.auth_service import _emails_del_cliente

logger = logging.getLogger(__name__)

MODELO = config("ONBOARDING_CEREBRO_MODEL", default="claude-haiku-5-5")
PREGUNTAS = {q["id"]: q["pregunta"] for q in json.loads((Path(__file__).resolve().parent.parent / "data" / "onboarding_preguntas.json").read_text(encoding="utf-8"))["preguntas"]}
MARCA = "onboarding"  # HechoCerebro.modelo de los hechos que salen del formulario

# Qué pregunta va a cada campo de la ficha (si cambian los números en atv-onboarding, se toca acá).
CAMPOS = {
    "negocio": "2", "rol": "3", "redes": "4", "oferta": "5", "nicho_y_diferencial": "6", "avatar": "7", "precio": "8",
    "canales": "9", "metricas": "11", "chats_por_mes": "12", "facturacion": "13", "agenda_asistencia": "14",
    "cierre": "15", "funnel": "16", "herramientas": "19", "equipo": "20", "decisiones": "21", "programa": "22",
    "clientes_activos": "23", "capacidad": "25", "casos_exito": "27", "probo_antes": "28", "problemas": "29",
    "freno": "30", "objetivo": "31", "nos_conocio": "32", "por_que_entro": "40", "que_lo_freno": "47", "programa_atv": "48",
}

_SISTEMA = """Leés el formulario de onboarding de un cliente de ATV (mentoría para creadores y expertos que venden
infoproductos y servicios). Respondés solo con JSON válido. No interpretás ni opinás: solo registrás lo que el
cliente escribió. Si algo no está, va null o no va."""

_PEDIDO = """Devolvé:
{{"nicho": uno de {nichos} o null,
 "nicho_texto": "a qué se dedica, con sus palabras, en una línea" o null,
 "que_vende": "qué vende, en una línea" o null,
 "etapa": uno de {etapas} o null (solo si se desprende de lo que factura o de cuántos clientes tiene),
 "hechos": [{{"tipo": "dolor" | "objecion" | "logro" | "tema", "texto": "en tercera persona, corto", "cita": "fragmento EXACTO de una respuesta", "pregunta": "número de la pregunta"}}]}}
- Todo es sobre el CLIENTE de ATV (el dueño del negocio), NO sobre su avatar ni sus clientes: lo que
  describe en la pregunta 7 (a quién le habla) no es un dolor suyo.
- dolor: un problema que tiene hoy su negocio (preguntas 29 y 30 sobre todo). objecion: lo que le impedía comprar (47).
- logro: un resultado que YA consiguió (casos de éxito, facturación). tema: algo que quiere trabajar.
- Hasta 12 hechos. La cita tiene que estar copiada tal cual de la respuesta.

Formulario de {nombre}:
{respuestas}"""


def _texto(v) -> str:
    if isinstance(v, list):
        v = ", ".join(str(x) for x in v)
    return " ".join(str(v or "").split())


def ficha_de(respuestas: dict) -> dict:
    """La ficha del onboarding: las respuestas que importan, con su nombre (sin IA)."""
    ficha = {}
    for campo, pid in CAMPOS.items():
        t = _texto(respuestas.get(pid))
        if t and t.lower() not in ("-", "no", "n/a", "na", "."):
            ficha[campo] = t[:600]
    return ficha


def _llamar(sistema: str, usuario: str) -> dict | None:
    from anthropic import Anthropic

    r = Anthropic(api_key=config("ANTHROPIC_API_KEY", default=""), timeout=60).messages.create(
        model=MODELO, max_tokens=2500, thinking={"type": "disabled"}, system=sistema, messages=[{"role": "user", "content": usuario}],
    )
    try:
        gasto_ia.registrar("onboarding", r.usage)
    except Exception:
        pass
    return leer_json("".join(b.text for b in r.content if getattr(b, "type", "") == "text"))


def _pendientes(limite: int) -> list[tuple]:
    """Formularios completos de clientes que existen en atv-clients y que el cerebro todavía no leyó
    (o que se volvieron a mandar después de leerlos)."""
    return db.select(
        f"""SELECT DISTINCT ON (k.id) k.id, s.id::text, s.client_name, f.form_data, f.submitted_at
            FROM onboarding.sessions s
            JOIN onboarding.forms f ON f.session_id = s.id
            JOIN clients.clientes k ON lower(k.email) = lower(s.client_email)
                 OR coalesce(k.emails_json, '') ILIKE '%' || lower(s.client_email) || '%'
            LEFT JOIN "{DB_SCHEMA}"."cerebro_onboarding" o ON o.cliente_id = k.id
            WHERE coalesce(s.client_email, '') <> ''
              AND (o.cliente_id IS NULL OR (f.submitted_at IS NOT NULL AND f.submitted_at > o.respondido_en))
            ORDER BY k.id, f.submitted_at DESC NULLS LAST
            LIMIT $limite""",
        {"limite": limite},
    )


def importar(cliente_id: int, session_id: str, nombre: str, form_data, respondido_en, llamar=_llamar) -> dict:
    respuestas = form_data if isinstance(form_data, dict) else json.loads(form_data or "{}")
    respuestas = {str(k): v for k, v in respuestas.items()}
    ficha = ficha_de(respuestas)
    texto = "\n".join(f"{pid}. {PREGUNTAS.get(pid, '')}\n→ {_texto(v)[:1200]}" for pid, v in sorted(respuestas.items(), key=lambda x: int(x[0]) if x[0].isdigit() else 999) if _texto(v))
    datos = llamar(_SISTEMA, _PEDIDO.format(nichos=json.dumps(NICHOS), etapas=json.dumps(ETAPAS), nombre=nombre or "el cliente", respuestas=texto)) or {}
    if datos.get("nicho") in NICHOS:
        ficha["nicho"] = datos["nicho"]
    for campo in ("nicho_texto", "que_vende"):
        if isinstance(datos.get(campo), str) and datos[campo].strip():
            ficha[campo] = datos[campo].strip()[:200]
    if datos.get("etapa") in ETAPAS:
        ficha["etapa"] = datos["etapa"]

    todo = _norm(" ".join(_texto(v) for v in respuestas.values()))
    hechos = []
    for h in datos.get("hechos") or []:
        if not isinstance(h, dict) or h.get("tipo") not in ("dolor", "objecion", "logro", "tema"):
            continue
        cita, texto_h = _texto(h.get("cita"))[:300], _texto(h.get("texto"))[:300]
        if cita and texto_h and _norm(cita) in todo:  # la cita tiene que estar de verdad en el formulario
            hechos.append({"tipo": h["tipo"], "texto": texto_h, "cita": cita})

    with db_session:
        canal = Canal.get(cliente_id=cliente_id)
        o = OnboardingCerebro.get(cliente_id=cliente_id)
        valores = {"session_id": session_id, "respondido_en": respondido_en, "respuestas_json": json.dumps(respuestas, ensure_ascii=False), "ficha_json": json.dumps(ficha, ensure_ascii=False), "importado_en": datetime.utcnow()}
        if o is None:
            OnboardingCerebro(cliente_id=cliente_id, **valores)
        else:
            o.set(**valores)
        # El perfil se completa solo donde está vacío (lo que dijo después en el chat es más nuevo).
        p = PerfilCliente.get(cliente_id=cliente_id) or PerfilCliente(cliente_id=cliente_id)
        for campo, valor in (("nicho", ficha.get("nicho")), ("nicho_texto", ficha.get("nicho_texto")), ("que_vende", ficha.get("que_vende")),
                             ("etapa", ficha.get("etapa")), ("facturacion", ficha.get("facturacion", "")[:120] or None), ("objetivo", ficha.get("objetivo", "")[:200] or None)):
            if valor and not getattr(p, campo):
                setattr(p, campo, valor)
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."cerebro_hechos" WHERE cliente_id = $c AND modelo = $m', {"c": cliente_id, "m": MARCA})
        for h in hechos:
            HechoCerebro(cliente_id=cliente_id, canal_id=canal.id if canal else 0, tipo=h["tipo"], texto=h["texto"], cita=h["cita"],
                         mensaje_id=0, autor_tipo="cliente", autor_id=cliente_id, dicho_en=respondido_en or datetime.utcnow(), modelo=MARCA)
    return {"cliente_id": cliente_id, "nicho": ficha.get("nicho"), "hechos": len(hechos)}


def importar_pendientes(limite: int = 5, llamar=_llamar) -> list[dict]:
    """Para el ciclo del cerebro: lee los formularios nuevos (de a pocos por pasada)."""
    with db_session:
        filas = _pendientes(limite)
    hechos = []
    for cliente_id, session_id, nombre, form_data, enviado in filas:
        try:
            hechos.append(importar(cliente_id, session_id, nombre, form_data, enviado, llamar=llamar))
        except Exception:
            logger.exception("Cerebro: no se pudo leer el onboarding del cliente %s", cliente_id)
    return hechos


def de_cliente(cliente_id: int) -> dict | None:
    with db_session:
        o = OnboardingCerebro.get(cliente_id=cliente_id)
        if o is None:
            return None
        return {"respondido_en": o.respondido_en.isoformat() + "Z" if o.respondido_en else None, "ficha": json.loads(o.ficha_json)}
