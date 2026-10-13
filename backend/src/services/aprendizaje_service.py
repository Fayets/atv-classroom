"""El cerebro aprende de cada conversación con clientes.

Cada ciclo (cada 10 minutos en producción) toma los mensajes nuevos de cada canal de cliente y:
1. Le pide a Haiku DATOS, no conclusiones: qué nicho dijo tener, qué vende, qué le duele, qué
   objetó, qué le recomendó el equipo, qué dijo explícitamente que le funcionó o no. Cada dato
   viene con la cita textual y el id del mensaje.
2. El código valida todo: la cita tiene que estar literalmente en ese mensaje, el tipo tiene que
   corresponder a quien habló (una recomendación es del equipo; un dolor, del cliente). Lo que no
   pasa se descarta. Así el cerebro no se llena de cosas inventadas.
3. Mide la voz de cada persona del equipo en código (largo, preguntas, voseo, emojis, cómo abre y
   cómo cierra) y guarda mensajes reales de ejemplo.

Todo eso es la base para lo que viene: completar con Tab en la voz de cada coach, seguimientos
automáticos y la base de conocimiento por nicho (ver contexto_para_responder y por_nicho).
"""

import json
import logging
import re
import unicodedata
from collections import Counter
from datetime import datetime

from decouple import config
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.services import gasto_ia
from src.models import (
    Admin,
    Canal,
    ClienteExterno,
    EstadoAprendizaje,
    HechoCerebro,
    MensajeCanal,
    PerfilCliente,
    VozEquipo,
)
from src.services.cerebro_service import CONCEPTOS, conceptos_en

logger = logging.getLogger(__name__)

MODELO = config("APRENDIZAJE_MODEL", default="claude-haiku-5-5")
LOTE = 60  # mensajes nuevos por llamada
CONTEXTO = 8  # mensajes ya aprendidos que se mandan para que entienda la charla
MAX_CANALES_POR_CICLO = 30
# Tope de gasto por día para el historial importado de Discord. Los chats con mensajes nuevos del
# classroom se aprenden siempre; lo viejo avanza solo mientras no se pase el tope.
TOPE_DIARIO_USD = config("APRENDIZAJE_TOPE_DIARIO_USD", default=0.5, cast=float)
DESDE_EL_PRINCIPIO = -(2**31)  # el historial de Discord tiene ids negativos: también se aprende

TIPOS = {
    "tema": "un tema concreto del negocio que trajo el cliente",
    "dolor": "un problema o frustración que el cliente dice tener",
    "objecion": "una duda o resistencia del cliente ante algo que se le propuso (precio, tiempo, miedo)",
    "pedido": "algo concreto que el cliente pide (una clase, una revisión, una llamada, un material)",
    "recomendacion": "algo concreto que alguien del equipo le recomendó hacer o mirar (una acción, una clase, un recurso)",
    "le_funciono": "el cliente dice explícitamente que algo le funcionó o le dio resultado",
    "no_le_funciono": "el cliente dice explícitamente que algo no le funcionó",
    "logro": "un resultado que el cliente YA consiguió (ventas, seguidores, clientes, plata). Lo que quiere lograr no es logro: va al perfil como objetivo",
}
DEL_EQUIPO = {"recomendacion"}
NICHOS = [
    "fitness", "nutricion", "salud", "salud-mental", "desarrollo-personal", "espiritualidad", "idiomas",
    "educacion", "marketing-digital", "ventas", "negocios-online", "ecommerce", "finanzas-trading",
    "inmobiliaria", "arquitectura-diseno", "belleza-estetica", "moda", "tecnologia-programacion",
    "contenido-creadores", "musica-arte", "gastronomia", "deportes", "relaciones", "oficios", "otro",
]
ETAPAS = ["arrancando", "validando", "vendiendo", "escalando"]
_IDS_CONCEPTO = {c["id"] for c in CONCEPTOS["conceptos"]}
_OBJETIVO = re.compile(r"\b(mi objetivo|mi meta|quiero llegar|quiero lograr|me gustaria llegar|me gustaria lograr)\b")

_SISTEMA = (
    "Extraés datos de conversaciones entre un cliente y el equipo de ATV (una mentoría para "
    "creadores y expertos que venden infoproductos). Respondés solo con JSON válido, sin texto "
    "antes ni después y sin bloques de código. No interpretás ni opinás: solo registrás lo que "
    "alguien dijo de forma explícita. Si algo no se dijo, va null o no va."
)


def _norm(t: str) -> str:
    t = unicodedata.normalize("NFD", t or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s$%]", " ", t)).strip()


def _instrucciones() -> str:
    """La parte fija del pedido (formato, tipos, conceptos, reglas). Va en el system con caché:
    es igual en cada llamada, así que se cobra entera una vez y después a una décima parte."""
    tipos = "\n".join(f'- "{k}": {v}' for k, v in TIPOS.items())
    conceptos = ", ".join(f'{c["id"]} ({c["nombre"]})' for c in CONCEPTOS["conceptos"])
    return f"""{_SISTEMA}

Te paso un cliente, lo que ya sabemos de él y su conversación con el equipo (cada mensaje con su id entre corchetes).
Devolvé este JSON:
{{
  "perfil": {{
    "nicho": uno de {json.dumps(NICHOS)} o null,
    "nicho_texto": "cómo describe el cliente a qué se dedica, con sus palabras" o null,
    "que_vende": "qué producto o servicio vende" o null,
    "etapa": uno de {json.dumps(ETAPAS)} o null,
    "facturacion": "lo que dijo que factura, textual" o null,
    "objetivo": "lo que dijo que quiere lograr" o null,
    "tono_cliente": "2 o 3 palabras sobre cómo escribe el cliente" o null
  }},
  "hechos": [
    {{"mensaje_id": 123, "tipo": "...", "texto": "resumen de una línea en tercera persona", "cita": "fragmento COPIADO textual del mensaje", "concepto": "id del concepto que mejor le corresponde o null"}}
  ]
}}

Tipos de hecho:
{tipos}

Conceptos posibles (id y nombre): {conceptos}

Reglas:
- Solo hechos de mensajes SIN la marca [ya procesado]. Los marcados son contexto.
- Cada mensaje del EQUIPO que sugiere hacer, probar o mirar algo es al menos un hecho "recomendacion".
- "cita" tiene que ser un fragmento copiado letra por letra de ese mensaje, de 3 a 25 palabras.
- "recomendacion" sale solo de mensajes del EQUIPO; todos los demás tipos, solo del CLIENTE.
- "le_funciono" y "no_le_funciono" solo si el cliente lo dice explícitamente.
- En el perfil, solo lo que el cliente dijo en esta conversación; si no lo dijo, null.
- Saludos, agradecimientos y charla sin contenido no son hechos. Si no hay nada, "hechos": []."""


def _prompt(cliente: str, mensajes: list[dict], nuevos_desde: int, perfil: dict) -> str:
    """La parte que cambia en cada llamada: quién es el cliente y la conversación."""
    lineas = []
    for m in mensajes:
        quien = "CLIENTE" if m["autor_tipo"] == "cliente" else f"EQUIPO ({m['autor']})"
        marca = "" if m["id"] >= nuevos_desde else " [ya procesado, solo contexto]"
        lineas.append(f"[{m['id']}] {quien}{marca}: {m['texto']}")
    return f"""Cliente: {cliente}
Perfil que ya sabemos (puede estar vacío): {json.dumps(perfil, ensure_ascii=False)}

Conversación:
{chr(10).join(lineas)}"""


def _llamar(prompt: str) -> dict | None:
    from anthropic import Anthropic

    clave = config("ANTHROPIC_API_KEY", default="")
    if not clave:
        return None
    cliente = Anthropic(api_key=clave, timeout=60)
    r = cliente.messages.create(
        model=MODELO,
        max_tokens=4000,
        # Extraer datos no necesita razonar: sin "thinking" sale más barato y no corta el JSON.
        thinking={"type": "disabled"},
        system=[{"type": "text", "text": _instrucciones(), "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": prompt}],
    )
    gasto_ia.registrar("aprendizaje", r.usage)
    texto = "".join(b.text for b in r.content if b.type == "text").strip()
    return leer_json(texto)


def leer_json(texto: str) -> dict | None:
    """El primer objeto JSON completo de la respuesta, aunque venga con texto antes o después."""
    texto = re.sub(r"^```(?:json)?|```$", "", texto.strip()).strip()
    inicio = texto.find("{")
    if inicio < 0:
        return None
    try:
        objeto, _ = json.JSONDecoder().raw_decode(texto[inicio:])
        return objeto if isinstance(objeto, dict) else None
    except ValueError:
        logger.warning("Aprendizaje: respuesta que no es JSON: %r", texto[:200])
        return None


def validar(respuesta: dict, mensajes: list[dict], nuevos_desde: int) -> tuple[dict, list[dict]]:
    """Lo que dijo el modelo pasa por el código: lo que no tiene evidencia literal se descarta."""
    por_id = {m["id"]: m for m in mensajes if m["id"] >= nuevos_desde}
    hechos, vistos = [], set()
    for h in (respuesta or {}).get("hechos") or []:
        if not isinstance(h, dict):
            continue
        try:
            mid = int(h.get("mensaje_id"))
        except (TypeError, ValueError):
            continue
        m = por_id.get(mid)
        tipo = h.get("tipo")
        cita = str(h.get("cita") or "").strip().strip('"“”')
        texto = str(h.get("texto") or "").strip()
        if not m or tipo not in TIPOS or not cita or not texto:
            continue
        if (tipo in DEL_EQUIPO) != (m["autor_tipo"] == "admin"):
            continue
        if len(_norm(cita).split()) < 2 or _norm(cita) not in _norm(m["texto"]):
            continue
        if tipo != "recomendacion" and _OBJETIVO.search(_norm(cita)):
            continue  # lo que quiere lograr va al perfil (objetivo), no es un hecho
        clave = (mid, tipo, _norm(cita))
        if clave in vistos:
            continue
        vistos.add(clave)
        # El concepto lo propone el modelo; si no es uno de la lista, se busca por palabras en código.
        concepto = h.get("concepto") if h.get("concepto") in _IDS_CONCEPTO else None
        if concepto is None:
            encontrados = conceptos_en(f"{texto} {cita}")
            concepto = encontrados[0] if encontrados else None
        hechos.append({**h, "mensaje_id": mid, "tipo": tipo, "cita": cita[:300], "texto": texto[:300], "concepto": concepto, "mensaje": m})

    perfil = {}
    p = (respuesta or {}).get("perfil") or {}
    del_cliente = " ".join(_norm(m["texto"]) for m in mensajes if m["autor_tipo"] == "cliente" and m["id"] >= nuevos_desde)
    if p.get("nicho") in NICHOS:
        perfil["nicho"] = p["nicho"]
    for campo in ("nicho_texto", "que_vende", "objetivo", "tono_cliente"):
        if isinstance(p.get(campo), str) and p[campo].strip():
            perfil[campo] = p[campo].strip()[:200]
    if p.get("etapa") in ETAPAS:
        perfil["etapa"] = p["etapa"]
    fact = p.get("facturacion")
    if isinstance(fact, str) and re.search(r"\d", fact) and any(n in del_cliente for n in re.findall(r"\d+", fact)):
        perfil["facturacion"] = fact.strip()[:120]
    if not del_cliente:
        perfil = {}  # sin mensajes nuevos del cliente no hay perfil que aprender
    return perfil, hechos


def _del_canal(canal_id: int) -> list:
    return list(MensajeCanal.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = $canal_id AND NOT borrado ORDER BY id'))


def _mensajes_de(canal_id: int, desde_id: int) -> tuple[list[dict], int]:
    """Los nuevos (id > desde_id) y unos cuantos anteriores como contexto."""
    nombres = {a.id: (a.nombre or a.email) for a in list(Admin.select())}
    todos = [m for m in _del_canal(canal_id) if (m.texto or "").strip()]
    previos = [m for m in todos if m.id <= desde_id][-CONTEXTO:]
    nuevos = [m for m in todos if m.id > desde_id][:LOTE]
    lista = [
        {"id": m.id, "autor_tipo": m.autor_tipo, "autor_id": m.autor_id, "autor": nombres.get(m.autor_id) or m.autor_nombre or "Equipo", "texto": m.texto, "creado_en": m.creado_en}
        for m in previos + nuevos
    ]
    return lista, (nuevos[0].id if nuevos else desde_id + 1)


def aprender_canal(canal_id: int, llamar=_llamar) -> dict:
    """Procesa un lote de mensajes nuevos de un canal. Devuelve qué aprendió."""
    with db_session:
        # Un candado por canal: si dos procesos corren el ciclo, cada canal lo aprende uno solo.
        if not db.select("SELECT pg_try_advisory_xact_lock(7300000 + $c)", {"c": canal_id})[0]:
            return {"canal": canal_id, "omitido": "otro proceso lo está aprendiendo"}
        canal = Canal.get(id=canal_id)
        if canal is None or canal.tipo != "cliente" or not canal.cliente_id:
            return {"canal": canal_id, "omitido": "no es un canal de cliente"}
        estado = EstadoAprendizaje.get(canal_id=canal_id) or EstadoAprendizaje(canal_id=canal_id, ultimo_mensaje_id=DESDE_EL_PRINCIPIO)
        mensajes, nuevos_desde = _mensajes_de(canal_id, estado.ultimo_mensaje_id)
        nuevos = [m for m in mensajes if m["id"] >= nuevos_desde]
        if not nuevos:
            return {"canal": canal_id, "hechos": 0}
        perfil_obj = PerfilCliente.get(cliente_id=canal.cliente_id)
        perfil_previo = {}
        if perfil_obj:
            for campo in ("nicho", "nicho_texto", "que_vende", "etapa", "facturacion", "objetivo", "tono_cliente"):
                if getattr(perfil_obj, campo):
                    perfil_previo[campo] = getattr(perfil_obj, campo)
        cliente = ClienteExterno.get(id=canal.cliente_id)
        respuesta = llamar(_prompt(cliente.nombre if cliente else canal.nombre, mensajes, nuevos_desde, perfil_previo))
        if respuesta is None:
            return {"canal": canal_id, "error": "sin respuesta del modelo"}
        perfil, hechos = validar(respuesta, mensajes, nuevos_desde)
        for h in hechos:
            m = h["mensaje"]
            HechoCerebro(
                cliente_id=canal.cliente_id, canal_id=canal_id, tipo=h["tipo"], texto=h["texto"], cita=h["cita"],
                concepto=h["concepto"], mensaje_id=m["id"], autor_tipo=m["autor_tipo"], autor_id=m["autor_id"],
                dicho_en=m["creado_en"], modelo=MODELO,
            )
        if perfil:
            if perfil_obj is None:
                perfil_obj = PerfilCliente(cliente_id=canal.cliente_id)
            for campo, valor in perfil.items():
                setattr(perfil_obj, campo, valor)
            perfil_obj.actualizado_en = datetime.utcnow()
        estado.ultimo_mensaje_id = nuevos[-1]["id"]
        estado.actualizado_en = datetime.utcnow()
        descartados = len((respuesta or {}).get("hechos") or []) - len(hechos)
    return {"canal": canal_id, "mensajes": len(nuevos), "hechos": len(hechos), "descartados": descartados, "perfil": perfil}


# ---------- voz del equipo (todo en código, sin IA) ----------
_EMOJI = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF]")
_VOSEO = re.compile(r"\b(vos|tenes|podes|queres|sabes|sos|fijate|mira|deci|contame|avisame|mandame|pasame|hace|decime)\b")
_PALABRA = re.compile(r"[a-záéíóúüñ]+", re.I)
_ALARGADA = re.compile(r"([a-záéíóúñ])\1{2,}", re.I)
_RISA = re.compile(r"\b(?:j[aeijs]){2,}j?\b|\bxd+\b", re.I)
MULETILLAS = [
    "dale", "che", "genial", "buenisimo", "buenisima", "joya", "barbaro", "crack", "capo", "rey", "reyy", "hermano", "bro",
    "tranqui", "obvio", "literal", "onda", "re", "posta", "mal", "tal cual", "de una", "perfecto", "excelente", "vamos",
    "a full", "un golazo", "espectacular", "increible", "fijate", "mira", "ojo", "igual", "basicamente", "sinceramente",
]
ABREVIATURAS = {"q": "q", "xq": "xq", "pq": "pq", "porq": "porq", "tmb": "tmb", "tb": "tb", "x": "x", "d": "d", "k": "k",
                "bn": "bn", "pls": "pls", "porfa": "porfa", "msj": "msj", "info": "info", "tqm": "tqm", "finde": "finde"}
_NO_SON_PROPIAS = set("""a al algo algun alguna ante antes aca ahi asi aun bien cada como con cual cuando de del desde
donde dos el ella ellos en entre era es esa ese eso esta este esto estoy fue hay hace la las le les lo los mas me mi mis
mucho muy nada ni no nos o otra otro para pero poco por porque que se si sin sobre solo son su sus tambien te tenes
tengo ti tiene todo tu tus un una uno unos ya yo vos voy va van ser estar hacer tener puede puedo podes eso sea
the hola gracias buen dia buenas tardes noches""".split())


def _palabras(t: str) -> list[str]:
    return [_norm(w) for w in _PALABRA.findall(t)]


def rasgos_de(textos: list[str], base: Counter | None = None, fechas: list | None = None) -> dict:
    """Cómo escribe alguien, medido en código sobre sus mensajes reales.
    base: frecuencia de palabras de todo el equipo, para encontrar las que son propias de esta persona.
    fechas: cuándo mandó cada mensaje, para ver si suele mandar varios cortos seguidos."""
    # Lo que no es estilo se saca antes de medir: links, menciones al principio y plantillas repetidas.
    limpios, vistos_txt, fechas_ok = [], set(), []
    for i, t in enumerate(textos):
        t2 = re.sub(r"https?://\S+", " ", t)
        t2 = re.sub(r"^(\s*@\S+(\s+\S+)?\s*[,:]?\s*)+", "", t2) if t2.lstrip().startswith("@") else t2
        t2 = t2.strip()
        clave = _norm(t2)
        if not t2 or clave in vistos_txt:
            continue
        vistos_txt.add(clave)
        limpios.append(t2)
        if fechas and len(fechas) == len(textos):
            fechas_ok.append(fechas[i])
    textos, fechas = limpios, (fechas_ok or None)
    if not textos:
        return {}
    n = len(textos)
    palabras = [len(t.split()) for t in textos]
    normal = [_norm(t) for t in textos]
    con_letras = [t for t in textos if re.search(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]", t)]
    aperturas = Counter(" ".join(x.split()[:2]) for x in normal if x)
    cierres = Counter(" ".join(x.split()[-2:]) for x in normal if len(x.split()) > 3)
    emojis = Counter(e for t in textos for e in _EMOJI.findall(t))
    pct = lambda k: round(100 * k / n)

    # Vocabulario: muletillas, abreviaturas y palabras que usa más que el resto del equipo.
    tokens = Counter(w for t in textos for w in _palabras(t))
    unidos = " " + " ".join(normal) + " "
    muletillas = {m: unidos.count(f" {m} ") for m in MULETILLAS}
    # Abreviaturas: solo como palabra suelta (en "50k" o "3x" la letra es parte de un número).
    sueltas = Counter(w for x in normal for w in x.split())
    abreviaturas = {a: sueltas[a] for a in ABREVIATURAS if sueltas[a] >= 2}
    # Nombres propios: palabras que casi siempre aparecen con mayúscula (no son estilo, son personas).
    mayus = Counter(_norm(w) for t in textos for w in re.findall(r"\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+", t))
    propias = []
    if base:
        total_base = sum(base.values()) or 1
        total = sum(tokens.values()) or 1
        candidatas = []
        for w, c in tokens.items():
            if c < 3 or len(w) < 3 or len(w) > 14 or w in _NO_SON_PROPIAS or not re.search(r"[aeiou]", w):
                continue
            if mayus[w] >= 0.5 * c:
                continue
            ratio = (c / total) / ((base.get(w, 0) + 1) / total_base)
            candidatas.append((ratio * min(c, 20), w))
        propias = [w for _, w in sorted(candidatas, reverse=True)[:12]]
    risas = Counter(_norm(r) for t in textos for r in _RISA.findall(t))

    rasgos = {
        "mensajes": n,
        "palabras_promedio": round(sum(palabras) / n, 1),
        "mensajes_cortos_pct": pct(sum(1 for p in palabras if p <= 8)),
        # Mayúsculas
        "mayuscula_inicial_pct": pct(sum(1 for t in textos if t[:1].isupper())),
        "todo_minuscula_pct": round(100 * sum(1 for t in con_letras if t == t.lower()) / max(1, len(con_letras))),
        "grita_pct": pct(sum(1 for t in textos if re.search(r"\b[A-ZÁÉÍÓÚÑ]{4,}\b", t))),
        # Puntuación
        "punto_final_pct": pct(sum(1 for t in textos if t.rstrip().endswith("."))),
        "preguntas_pct": pct(sum(1 for t in textos if "?" in t)),
        "abre_pregunta_pct": round(100 * sum(1 for t in textos if "¿" in t) / max(1, sum(1 for t in textos if "?" in t))),
        "exclamaciones_pct": pct(sum(1 for t in textos if "!" in t)),
        "abre_exclamacion_pct": round(100 * sum(1 for t in textos if "¡" in t) / max(1, sum(1 for t in textos if "!" in t))),
        "exclamacion_doble_pct": pct(sum(1 for t in textos if "!!" in t)),
        "suspensivos_pct": pct(sum(1 for t in textos if "..." in t or "…" in t)),
        # Tono
        "voseo_pct": pct(sum(1 for x in normal if _VOSEO.search(x))),
        "emojis_pct": pct(sum(1 for t in textos if _EMOJI.search(t))),
        "emojis_top": [e for e, _ in emojis.most_common(6)],
        "risas_pct": pct(sum(1 for t in textos if _RISA.search(t))),
        "risa_tipica": risas.most_common(1)[0][0] if risas else None,
        "alarga_palabras_pct": pct(sum(1 for t in textos if _ALARGADA.search(t))),
        "muletillas": [m for m, c in sorted(muletillas.items(), key=lambda kv: -kv[1]) if c >= max(2, n * 0.03)][:8],
        "abreviaturas": sorted(abreviaturas, key=lambda a: -abreviaturas[a])[:6],
        "palabras_propias": propias,
        "aperturas_top": [a for a, c in aperturas.most_common(5) if c > 1],
        "cierres_top": [c for c, k in cierres.most_common(5) if k > 1],
    }
    if fechas and len(fechas) == n:
        seguidos = sum(1 for a, b in zip(fechas, fechas[1:]) if (b - a).total_seconds() <= 60)
        rasgos["varios_seguidos_pct"] = round(100 * seguidos / max(1, n - 1))
    return rasgos


def actualizar_voces() -> int:
    """Rasgos y mensajes de ejemplo de cada persona del equipo que escribió a clientes
    (incluye el historial traído de Discord de quienes tienen cuenta)."""
    with db_session:
        canales_cliente = {c.id for c in list(Canal.select()) if c.tipo == "cliente"}
        por_admin: dict[int, list] = {}
        for m in MensajeCanal.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."mensajes_canal" WHERE autor_tipo = \'admin\' AND autor_id > 0 AND NOT borrado ORDER BY id'):
            if m.canal.id in canales_cliente and (m.texto or "").strip():
                por_admin.setdefault(m.autor_id, []).append(m)
        base = Counter(w for ms in por_admin.values() for m in ms[-1500:] for w in _palabras(m.texto))
        for admin_id, ms in por_admin.items():
            ms.sort(key=lambda m: (m.creado_en, m.id))
            recientes = ms[-1500:]
            textos = [m.texto for m in recientes]
            # Ejemplos: los más recientes con contenido real, variados en largo (cortos, medios y largos).
            utiles = [m for m in reversed(recientes) if len(m.texto.split()) >= 4 and not re.fullmatch(r"\s*https?://\S+\s*", m.texto) and "Discord (no quedó" not in m.texto]
            cortos = [m.id for m in utiles if len(m.texto.split()) <= 12][:8]
            medios = [m.id for m in utiles if 12 < len(m.texto.split()) <= 40][:10]
            largos = [m.id for m in utiles if len(m.texto.split()) > 40][:6]
            v = VozEquipo.get(admin_id=admin_id) or VozEquipo(admin_id=admin_id)
            v.rasgos_json = json.dumps(rasgos_de(textos, base, [m.creado_en for m in recientes]), ensure_ascii=False)
            v.muestras_json = json.dumps(cortos + medios + largos)
            v.mensajes_analizados = len(ms)
            v.actualizado_en = datetime.utcnow()
        return len(por_admin)


def ciclo(llamar=_llamar) -> dict:
    """Una pasada: primero los chats con mensajes nuevos del classroom, después el historial de Discord
    (lo más reciente primero) mientras no se pase el tope diario. Al final, las voces del equipo."""
    with db_session:
        pendientes = db.select(
            f'SELECT c.id, bool_or(m.id > 0) FROM "{DB_SCHEMA}"."canales" c '
            f'JOIN "{DB_SCHEMA}"."mensajes_canal" m ON m.canal = c.id '
            f'LEFT JOIN "{DB_SCHEMA}"."cerebro_estado" e ON e.canal_id = c.id '
            f"WHERE c.tipo = 'cliente' AND NOT m.borrado AND m.id > COALESCE(e.ultimo_mensaje_id, {DESDE_EL_PRINCIPIO}) "
            "GROUP BY c.id ORDER BY bool_or(m.id > 0) DESC, max(m.creado_en) DESC"
        )
    resultados = []
    frenado = False
    for canal_id, vivo in pendientes[:MAX_CANALES_POR_CICLO]:
        if not vivo and gasto_ia.gastado_hoy("aprendizaje") >= TOPE_DIARIO_USD:
            frenado = True
            break
        try:
            resultados.append(aprender_canal(canal_id, llamar))
        except Exception:
            logger.exception("Aprendizaje: falló el canal %s", canal_id)
            resultados.append({"canal": canal_id, "error": "excepción"})
    voces = actualizar_voces()
    return {"canales": resultados, "voces": voces, "pendientes": max(0, len(pendientes) - len(resultados)), "tope_alcanzado": frenado}


# ---------- lo que va a usar la IA (Tab, seguimientos) y la base por nicho ----------
def _hecho_dict(h: HechoCerebro) -> dict:
    return {"tipo": h.tipo, "texto": h.texto, "cita": h.cita, "concepto": h.concepto, "mensaje_id": h.mensaje_id, "dicho_en": h.dicho_en.isoformat(timespec="seconds") + "Z"}


def perfil_de(cliente_id: int) -> dict:
    with db_session:
        p = PerfilCliente.get(cliente_id=cliente_id)
        hechos = list(HechoCerebro.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."cerebro_hechos" WHERE cliente_id = $cliente_id ORDER BY mensaje_id DESC LIMIT 200'))
        return {
            "perfil": None if p is None else {k: getattr(p, k) for k in ("nicho", "nicho_texto", "que_vende", "etapa", "facturacion", "objetivo", "tono_cliente")},
            "hechos": [_hecho_dict(h) for h in hechos[:60]],
        }


def voz_de(admin_id: int) -> dict:
    with db_session:
        v = VozEquipo.get(admin_id=admin_id)
        if v is None:
            return {"rasgos": {}, "ejemplos": []}
        ids = [int(i) for i in json.loads(v.muestras_json or "[]")]
        if not ids:
            return {"rasgos": json.loads(v.rasgos_json or "{}"), "ejemplos": []}
        lista = ",".join(str(i) for i in ids)
        por_id = {m.id: m for m in MensajeCanal.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."mensajes_canal" WHERE id IN ({lista}) AND NOT borrado')}
        ejemplos = [por_id[i].texto for i in ids if i in por_id]
        return {"rasgos": json.loads(v.rasgos_json or "{}"), "ejemplos": ejemplos}


def por_nicho(nicho: str | None = None) -> list[dict]:
    """Base de conocimiento por nicho: quiénes son, qué les duele, qué objetan, qué les funcionó."""
    with db_session:
        perfiles = {p.cliente_id: p for p in list(PerfilCliente.select()) if p.nicho}
        hechos = [h for h in list(HechoCerebro.select()) if h.cliente_id in perfiles]
        nombres = {c.id: (c.nombre or c.email) for c in list(ClienteExterno.select()) if c.id in perfiles}
    grupos: dict[str, dict] = {}
    for cid, p in perfiles.items():
        if nicho and p.nicho != nicho:
            continue
        g = grupos.setdefault(p.nicho, {"nicho": p.nicho, "clientes": [], "dolores": Counter(), "objeciones": Counter(), "le_funciono": [], "no_le_funciono": [], "recomendaciones": Counter()})
        g["clientes"].append({"id": cid, "nombre": nombres.get(cid), "que_vende": p.que_vende, "etapa": p.etapa})
    nombre_concepto = {c["id"]: c["nombre"] for c in CONCEPTOS["conceptos"]}
    for h in hechos:
        g = grupos.get(perfiles[h.cliente_id].nicho)
        if g is None:
            continue
        clave = nombre_concepto.get(h.concepto) or h.texto
        if h.tipo == "dolor":
            g["dolores"][clave] += 1
        elif h.tipo == "objecion":
            g["objeciones"][clave] += 1
        elif h.tipo == "recomendacion":
            g["recomendaciones"][clave] += 1
        elif h.tipo in ("le_funciono", "no_le_funciono"):
            g[h.tipo].append({"cliente": nombres.get(h.cliente_id), "texto": h.texto, "cita": h.cita})
    salida = []
    for g in sorted(grupos.values(), key=lambda g: -len(g["clientes"])):
        for k in ("dolores", "objeciones", "recomendaciones"):
            g[k] = [{"que": q, "veces": n} for q, n in g[k].most_common(10)]
        salida.append(g)
    return salida


def contexto_para_responder(canal_id: int, admin_id: int, incluir_nicho: bool = True) -> dict:
    """Todo lo que la IA necesita para escribir como esta persona del equipo a este cliente:
    quién es el cliente, qué se habló, qué le funcionó a otros de su nicho y cómo escribe el coach.
    Es la entrada única para completar con Tab y para los seguimientos automáticos."""
    with db_session:
        canal = Canal.get(id=canal_id)
        if canal is None or canal.tipo != "cliente":
            return {}
        cliente_id = canal.cliente_id
        c = ClienteExterno.get(id=cliente_id)
        ultimos = _del_canal(canal_id)[-20:]
        conversacion = [{"de": "cliente" if m.autor_tipo == "cliente" else "equipo", "autor_id": m.autor_id, "texto": m.texto, "cuando": m.creado_en.isoformat(timespec="seconds") + "Z"} for m in ultimos]
        ficha = None if c is None else {"nombre": c.nombre, "plan": c.plan_actual, "vence": c.fecha_vencimiento.isoformat() if c.fecha_vencimiento else None}
    aprendido = perfil_de(cliente_id)
    nicho = (aprendido["perfil"] or {}).get("nicho")
    return {
        "cliente": ficha,
        "perfil": aprendido["perfil"],
        "hechos": aprendido["hechos"][:30],
        "nicho": (por_nicho(nicho) or [None])[0] if nicho and incluir_nicho else None,
        "voz": voz_de(admin_id),
        "conversacion": conversacion,
    }
