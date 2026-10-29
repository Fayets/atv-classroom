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
from difflib import SequenceMatcher

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
    SugerenciaIA,
    VozEquipo,
)
from src.services.cerebro_service import CONCEPTOS, conceptos_en

logger = logging.getLogger(__name__)

MODELO = config("APRENDIZAJE_MODEL", default="claude-haiku-5-5")
LOTE = 60  # mensajes nuevos por llamada
CONTEXTO = 8  # mensajes ya aprendidos que se mandan para que entienda la charla
MAX_CANALES_POR_CICLO = 30
# Tope de gasto por día para el historial importado de Discord. Los chats con mensajes nuevos del
# classroom se aprenden siempre; lo viejo avanza solo mientras no se pase el tope. Con US$3 el
# historial (~16 mil mensajes al 16-10-2026, ~US$4 en total) se termina en un día y medio; después
# solo quedan los mensajes nuevos, que gastan bastante menos que el tope.
TOPE_DIARIO_USD = config("APRENDIZAJE_TOPE_DIARIO_USD", default=3.0, cast=float)
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
# Los nichos de lo que se aprende EN ATV: casi todos los clientes hablan de esto con nosotros, así que
# solo cuentan si es lo que el cliente vende.
NICHOS_DE_ATV = {"marketing-digital", "ventas", "contenido-creadores", "negocios-online"}
REGLA_NICHO = """El nicho es el mercado del NEGOCIO del cliente: a quién le vende y qué. No es lo que aprende ni lo que
conversa en ATV. Todos los clientes de ATV hablan de marketing, ventas, contenido, embudos, anuncios y redes porque
es lo que trabajan con nosotros: eso NO los hace de "marketing-digital", "ventas", "contenido-creadores" ni
"negocios-online". Esos cuatro son solo para quien VENDE eso (una agencia, un trafficker, un curso de ventas o de
closers, un servicio de edición o de contenido para otros).
El nicho sale del TEMA de lo que vende, no del formato: coaching, mentoría, programa o curso es el formato.
"desarrollo-personal" es solo para mentalidad, identidad, hábitos o propósito; si el tema es otro, va el nicho del tema.
Ejemplos: coach de running → "deportes"; inversión en propiedades → "inmobiliaria"; regulación hormonal → "salud";
bots y automatizaciones para pymes → "tecnologia-programacion"; agencia de funnels para creadores → "marketing-digital";
curso de inglés → "idiomas"; mentoría de mentalidad para mujeres → "desarrollo-personal".
El subnicho es a quién le vende y qué, en 2 a 6 palabras en minúscula (ej. "entrenamiento para mujeres postparto",
"agencia de anuncios para infoproductores", "inglés para profesionales de IT")."""
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
    "subnicho": "a quién le vende y qué, de 2 a 6 palabras en minúscula" o null,
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
- {REGLA_NICHO}
- Saludos, agradecimientos y charla sin contenido no son hechos. Si no hay nada, "hechos": []."""


def _prompt(cliente: str, mensajes: list[dict], nuevos_desde: int, perfil: dict) -> str:
    """La parte que cambia en cada llamada: quién es el cliente y la conversación."""
    lineas = []
    for m in mensajes:
        if m["autor_tipo"] != "cliente":
            quien = f"EQUIPO ({m['autor']})"
        elif m.get("de_su_equipo"):
            quien = f"CLIENTE ({m['de_su_equipo']}, de su equipo)"
        else:
            quien = "CLIENTE"
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
    sub = limpiar_subnicho(p.get("subnicho"))
    if sub:
        perfil["subnicho"] = sub
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


def limpiar_subnicho(texto) -> str | None:
    """El subnicho como etiqueta: minúscula, sin puntos ni comillas, de 2 a 10 palabras."""
    if not isinstance(texto, str):
        return None
    t = re.sub(r"[\"“”'.;:!¡?¿()]", "", texto).strip().lower()
    t = re.sub(r"\s+", " ", t)
    return t[:80] if 2 <= len(t.split()) <= 10 else None


_VACIAS_SUB = {"de", "para", "con", "y", "a", "en", "la", "el", "los", "las", "del", "que", "por", "e", "o", "u", "al", "su", "sus"}


def _llave_sub(t: str) -> set[str]:
    # Plurales simples afuera ("mujeres" y "mujer" son lo mismo para agrupar).
    return {re.sub(r"(es|s)$", "", w) for w in _norm(t).split() if w not in _VACIAS_SUB}


def unificar_subnicho(sub: str | None, existentes: list[str]) -> str | None:
    """Si ya hay un subnicho que dice lo mismo (casi las mismas palabras), se usa ese: así los clientes
    parecidos quedan juntos aunque cada uno lo haya dicho distinto."""
    if not sub:
        return None
    llave = _llave_sub(sub)
    mejor, puntaje = None, 0.0
    for e in existentes:
        otra = _llave_sub(e)
        if not llave or not otra:
            continue
        j = len(llave & otra) / len(llave | otra)
        if j > puntaje:
            mejor, puntaje = e, j
    return mejor if mejor and puntaje >= 0.75 else sub


def subnichos_de(nicho: str | None, sin: int | None = None) -> list[str]:
    """Los subnichos que ya existen en un nicho (sin contar al cliente `sin`). Va dentro de un db_session."""
    if not nicho:
        return []
    filas = db.select(
        f'SELECT DISTINCT subnicho FROM "{DB_SCHEMA}"."cerebro_perfil_cliente" WHERE nicho = $nicho AND subnicho IS NOT NULL AND cliente_id <> $sin',
        {"nicho": nicho, "sin": sin or 0},
    )
    return [f for f in filas if f]


def _del_canal(canal_id: int) -> list:
    return list(MensajeCanal.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = $canal_id AND NOT borrado ORDER BY id'))


def _mensajes_de(canal_id: int, desde_id: int) -> tuple[list[dict], int]:
    """Los nuevos (id > desde_id) y unos cuantos anteriores como contexto."""
    nombres = {a.id: (a.nombre or a.email) for a in list(Admin.select())}
    todos = [m for m in _del_canal(canal_id) if (m.texto or "").strip()]
    previos = [m for m in todos if m.id <= desde_id][-CONTEXTO:]
    nuevos = [m for m in todos if m.id > desde_id][:LOTE]
    lista = [
        {"id": m.id, "autor_tipo": m.autor_tipo, "autor_id": m.autor_id, "autor": nombres.get(m.autor_id) or m.autor_nombre or "Equipo", "texto": m.texto, "creado_en": m.creado_en,
         "de_su_equipo": m.autor_nombre if m.autor_tipo == "cliente" and m.miembro_id else None}
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
            # El nicho de un lote es una pista (mira 60 mensajes). Si el nicho ya se decidió mirando todo lo
            # del cliente, el lote no lo pisa: si propone otro, se vuelve a revisar con todo.
            nicho, sub = perfil.get("nicho"), perfil.get("subnicho")
            if perfil_obj.nicho_revisado_en is None:
                if nicho:
                    perfil_obj.nicho = nicho
                if sub:
                    perfil_obj.subnicho = unificar_subnicho(sub, subnichos_de(perfil_obj.nicho, sin=canal.cliente_id))
            elif nicho and nicho != perfil_obj.nicho:
                perfil_obj.nicho_revisado_en = None
            for campo, valor in perfil.items():
                if campo not in ("nicho", "subnicho"):
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


# ---------- correcciones del Tab: lo que la IA propuso y lo que la persona terminó mandando ----------
# Las palabras de función no dicen nada del estilo; los saludos sí ("siempre saca el hola").
_FUNCION = _NO_SON_PROPIAS - {"hola", "gracias", "buen", "dia", "buenas", "tardes", "noches"}


def cambio_pct(propuesto: str, enviado: str) -> int:
    """Cuánto cambió el mensaje: 0 = lo mandó tal cual, 100 = lo reescribió entero. Palabra por palabra y
    respetando mayúsculas y signos (cambiar "Hola," por "hola" también es corregir)."""
    a, b = (propuesto or "").split(), (enviado or "").split()
    if not a and not b:
        return 0
    return round(100 * (1 - SequenceMatcher(None, a, b, autojunk=False).ratio()))


def rasgos_correcciones(pares: list[tuple[str, str]]) -> dict:
    """Qué le cambia la persona a lo que le propone la IA, medido en código. pares: (propuesto, enviado)."""
    if not pares:
        return {}
    editados = [(a, b) for a, b in pares if cambio_pct(a, b) > 2]
    salida = {"aceptadas": len(pares), "tal_cual_pct": round(100 * (len(pares) - len(editados)) / len(pares))}
    if not editados:
        return salida
    ratios = sorted(len(b.split()) / max(1, len(a.split())) for a, b in editados)
    salida["largo_vs_ia"] = round(ratios[len(ratios) // 2], 2)
    saca, agrega = Counter(), Counter()
    for a, b in editados:
        pa, pb = set(_palabras(a)), set(_palabras(b))
        saca.update(w for w in pa - pb if len(w) >= 3 and w not in _FUNCION)
        agrega.update(w for w in pb - pa if len(w) >= 2 and w not in _FUNCION)
    minimo = max(2, round(len(editados) * 0.15))
    salida["saca"] = [w for w, c in saca.most_common(10) if c >= minimo]
    salida["agrega"] = [w for w, c in agrega.most_common(10) if c >= minimo]

    def pct(aplica, cumple):
        casos = [(a, b) for a, b in editados if aplica(a, b)]
        return round(100 * sum(1 for a, b in casos if cumple(a, b)) / len(casos)) if len(casos) >= 2 else None

    medidas = {
        "saca_emojis_pct": pct(lambda a, b: _EMOJI.search(a), lambda a, b: len(_EMOJI.findall(b)) < len(_EMOJI.findall(a))),
        "saca_signos_apertura_pct": pct(lambda a, b: re.search("[¿¡]", a), lambda a, b: not re.search("[¿¡]", b)),
        "saca_punto_final_pct": pct(lambda a, b: a.rstrip().endswith("."), lambda a, b: not b.rstrip().endswith(".")),
        "pasa_a_minuscula_pct": pct(lambda a, b: a[:1].isupper(), lambda a, b: b[:1].islower()),
    }
    salida.update({k: v for k, v in medidas.items() if v is not None})
    return salida


def _propuesto(s: SugerenciaIA) -> str:
    return ((s.borrador or "") + s.sugerencia).strip()


def _correcciones_sql(donde: str) -> list:
    """Sugerencias aceptadas y mandadas, en la voz de la misma persona (si alguien escribe con la voz de
    otro, lo que corrige es su gusto, no el estilo del dueño de la voz)."""
    return list(SugerenciaIA.select_by_sql(
        f'SELECT * FROM "{DB_SCHEMA}"."cerebro_sugerencias" WHERE usada AND enviado IS NOT NULL '
        f"AND (voz_id IS NULL OR voz_id = admin_id) AND sugerencia NOT IN ('…', '(vacía)') {donde} ORDER BY id DESC"
    ))


# Una sugerencia que apareció y no usó: si en estos minutos mandó su propio mensaje, ese es el que la IA
# tendría que haber escrito. Si se parece mucho a la sugerencia es que la aceptó (lo marca enviada()).
DESCARTE_MIN = 15
DESCARTE_CAMBIO_MIN = 30


def registrar_descartada(admin_id: int, canal_id: int, mensaje) -> None:
    """Dentro de un db_session, al mandar un mensaje del equipo en el chat de un cliente."""
    from datetime import timedelta

    s = SugerenciaIA.select_by_sql(
        f'SELECT * FROM "{DB_SCHEMA}"."cerebro_sugerencias" WHERE admin_id = $admin_id AND canal_id = $canal_id '
        "AND NOT usada AND enviado IS NULL AND sugerencia NOT IN ('…', '(vacía)') AND (voz_id IS NULL OR voz_id = admin_id) "
        "AND creado_en >= $desde ORDER BY id DESC LIMIT 1",
        globals={"admin_id": admin_id, "canal_id": canal_id, "desde": datetime.utcnow() - timedelta(minutes=DESCARTE_MIN)},
    )
    if not s:
        return
    s = s[0]
    enviado = (mensaje.texto or "")[:4000]
    cambio = cambio_pct(_propuesto(s), enviado)
    if cambio < DESCARTE_CAMBIO_MIN:
        return
    s.enviado, s.mensaje_id, s.cambio_pct = enviado, mensaje.id, cambio


def descartadas_de(admin_id: int, limite: int = 4) -> list[dict]:
    """Las últimas sugerencias que no usó, con lo que escribió en su lugar."""
    with db_session:
        filas = list(SugerenciaIA.select_by_sql(
            f'SELECT * FROM "{DB_SCHEMA}"."cerebro_sugerencias" WHERE admin_id = $admin_id AND NOT usada AND enviado IS NOT NULL '
            "AND (voz_id IS NULL OR voz_id = admin_id) ORDER BY id DESC LIMIT $limite",
            globals={"admin_id": admin_id, "limite": limite},
        ))
        return [{"propuesto": _propuesto(f), "enviado": f.enviado} for f in filas]


def correcciones_de(admin_id: int, limite: int = 60) -> list[dict]:
    with db_session:
        filas = _correcciones_sql(f"AND admin_id = {int(admin_id)}")[:limite]
        return [{"propuesto": _propuesto(f), "enviado": f.enviado, "cambio": f.cambio_pct or 0} for f in filas]


# Carteles que dejó la migración de Discord en lugar de archivos y audios: no son forma de escribir de nadie.
RELLENO = re.compile(r"^\s*(?:📎|🎙️?).*(?:Discord|no quedó guardad).*$", re.M)


def _sin_relleno(texto: str) -> str:
    return RELLENO.sub("", texto or "").strip()


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
        corregidas: dict[int, list] = {}
        for f in _correcciones_sql(""):
            if len(corregidas.setdefault(f.admin_id, [])) < 200:
                corregidas[f.admin_id].append((_propuesto(f), f.enviado))
        for admin_id, ms in por_admin.items():
            ms.sort(key=lambda m: (m.creado_en, m.id))
            recientes = [m for m in ms[-1500:] if _sin_relleno(m.texto)]
            textos = [_sin_relleno(m.texto) for m in recientes]
            # Ejemplos: los más recientes con contenido real, variados en largo (cortos, medios y largos).
            utiles = [m for m in reversed(recientes) if len(m.texto.split()) >= 4 and not re.fullmatch(r"\s*https?://\S+\s*", m.texto) and not RELLENO.search(m.texto)]
            # Sin repetidos: un anuncio pegado en 6 canales no son 6 ejemplos de cómo escribe.
            vistos = set()
            utiles = [m for m in utiles if not (" ".join(m.texto.lower().split())[:120] in vistos or vistos.add(" ".join(m.texto.lower().split())[:120]))]
            cortos = [m.id for m in utiles if len(m.texto.split()) <= 12][:8]
            medios = [m.id for m in utiles if 12 < len(m.texto.split()) <= 40][:10]
            largos = [m.id for m in utiles if len(m.texto.split()) > 40][:6]
            v = VozEquipo.get(admin_id=admin_id) or VozEquipo(admin_id=admin_id)
            rasgos = rasgos_de(textos, base, [m.creado_en for m in recientes])
            if len(corregidas.get(admin_id, [])) >= 3:
                rasgos["correcciones"] = rasgos_correcciones(corregidas[admin_id])
            v.rasgos_json = json.dumps(rasgos, ensure_ascii=False)
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
    # Los nichos que hay que decidir mirando todo lo del cliente (de a 10: cada uno cuesta menos de un centavo).
    nichos = []
    if llamar is _llamar and gasto_ia.gastado_hoy("nichos") < TOPE_DIARIO_USD:
        from src.services.nichos_service import revisar_pendientes

        nichos = revisar_pendientes(10)
    voces = actualizar_voces()
    # Los formularios de onboarding nuevos (de a pocos; cada uno cuesta centavos).
    onboardings = []
    if llamar is _llamar and gasto_ia.gastado_hoy("onboarding") < TOPE_DIARIO_USD:
        from src.services.cerebro_onboarding import importar_pendientes

        onboardings = importar_pendientes(5)
    return {"canales": resultados, "voces": voces, "nichos": nichos, "onboardings": onboardings, "pendientes": max(0, len(pendientes) - len(resultados)), "tope_alcanzado": frenado}


# ---------- lo que va a usar la IA (Tab, seguimientos) y la base por nicho ----------
def _hecho_dict(h: HechoCerebro) -> dict:
    return {"tipo": h.tipo, "texto": h.texto, "cita": h.cita, "concepto": h.concepto, "mensaje_id": h.mensaje_id, "dicho_en": h.dicho_en.isoformat(timespec="seconds") + "Z"}


def perfil_de(cliente_id: int) -> dict:
    with db_session:
        p = PerfilCliente.get(cliente_id=cliente_id)
        hechos = list(HechoCerebro.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."cerebro_hechos" WHERE cliente_id = $cliente_id ORDER BY mensaje_id DESC LIMIT 200'))
        return {
            "perfil": None if p is None else {k: getattr(p, k) for k in ("nicho", "subnicho", "nicho_texto", "que_vende", "etapa", "facturacion", "objetivo", "tono_cliente")},
            "hechos": [_hecho_dict(h) for h in hechos[:60]],
        }


def voz_de(admin_id: int) -> dict:
    with db_session:
        v = VozEquipo.get(admin_id=admin_id)
        if v is None:
            return {"rasgos": {}, "ejemplos": []}
        ids = [int(i) for i in json.loads(v.muestras_json or "[]")]
        ejemplos = []
        if ids:
            lista = ",".join(str(i) for i in ids)
            por_id = {m.id: m for m in MensajeCanal.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."mensajes_canal" WHERE id IN ({lista}) AND NOT borrado')}
            ejemplos = [por_id[i].texto for i in ids if i in por_id]
        rasgos = json.loads(v.rasgos_json or "{}")
    # Las correcciones más recientes que cambiaron algo de verdad (ni tal cual ni reescritas enteras).
    correcciones = [c for c in correcciones_de(admin_id, 40) if 5 <= c["cambio"] <= 90][:6]
    return {"rasgos": rasgos, "ejemplos": ejemplos, "correcciones": correcciones, "descartadas": descartadas_de(admin_id)}


def _grupo(**datos) -> dict:
    return {**datos, "clientes": [], "dolores": Counter(), "objeciones": Counter(), "le_funciono": [], "no_le_funciono": [], "recomendaciones": Counter()}


def _sumar(g: dict, h: HechoCerebro, clave: str, nombre: str | None) -> None:
    if h.tipo == "dolor":
        g["dolores"][clave] += 1
    elif h.tipo == "objecion":
        g["objeciones"][clave] += 1
    elif h.tipo == "recomendacion":
        g["recomendaciones"][clave] += 1
    elif h.tipo in ("le_funciono", "no_le_funciono"):
        g[h.tipo].append({"cliente": nombre, "texto": h.texto, "cita": h.cita})


def _cerrar(g: dict) -> dict:
    for k in ("dolores", "objeciones", "recomendaciones"):
        g[k] = [{"que": q, "veces": n} for q, n in g[k].most_common(10)]
    return g


def por_nicho(nicho: str | None = None) -> list[dict]:
    """Base de conocimiento por nicho: quiénes son, qué les duele, qué objetan, qué les funcionó.
    Cada nicho trae lo mismo abierto por subnicho (a quién le vende y qué)."""
    with db_session:
        perfiles = {p.cliente_id: p for p in list(PerfilCliente.select()) if p.nicho and (not nicho or p.nicho == nicho)}
        hechos = [h for h in list(HechoCerebro.select()) if h.cliente_id in perfiles]
        nombres = {c.id: (c.nombre or c.email) for c in list(ClienteExterno.select()) if c.id in perfiles}
    grupos: dict[str, dict] = {}
    for cid, p in perfiles.items():
        g = grupos.setdefault(p.nicho, _grupo(nicho=p.nicho, subnichos={}))
        cliente = {"id": cid, "nombre": nombres.get(cid), "que_vende": p.que_vende, "etapa": p.etapa, "subnicho": p.subnicho}
        g["clientes"].append(cliente)
        if p.subnicho:
            g["subnichos"].setdefault(p.subnicho, _grupo(subnicho=p.subnicho))["clientes"].append(cliente)
    nombre_concepto = {c["id"]: c["nombre"] for c in CONCEPTOS["conceptos"]}
    for h in hechos:
        p = perfiles[h.cliente_id]
        clave = nombre_concepto.get(h.concepto) or h.texto
        _sumar(grupos[p.nicho], h, clave, nombres.get(h.cliente_id))
        if p.subnicho:
            _sumar(grupos[p.nicho]["subnichos"][p.subnicho], h, clave, nombres.get(h.cliente_id))
    salida = []
    for g in sorted(grupos.values(), key=lambda g: -len(g["clientes"])):
        g["subnichos"] = [_cerrar(sg) for sg in sorted(g["subnichos"].values(), key=lambda sg: (-len(sg["clientes"]), sg["subnicho"]))]
        salida.append(_cerrar(g))
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
        ficha = None if c is None else {"nombre": c.nombre, "plan": c.plan_actual, "vence": c.fecha_vencimiento.isoformat() if c.fecha_vencimiento else None}
        # Quién escribió cada uno (el equipo del cliente y el de ATV son varias personas) y si mandó archivos:
        # sin eso la IA no sabe a quién le contestaba quién ni que hubo una captura en el medio.
        equipo = {a.id: (a.nombre or a.email or "").split(" ")[0] for a in list(Admin.select())}
        archivos: dict[int, list[str]] = {}
        if ultimos:
            ids = ",".join(str(int(m.id)) for m in ultimos)
            for mid, mime in db.select(f'SELECT mensaje_id, tipo_mime FROM "{DB_SCHEMA}"."adjuntos" WHERE mensaje_id IN ({ids})'):
                archivos.setdefault(mid, []).append(mime)
        conversacion = [
            {
                "de": "cliente" if m.autor_tipo == "cliente" else "equipo",
                "autor_id": m.autor_id,
                "quien": (getattr(m, "autor_nombre", None) or (c.nombre if c else None)) if m.autor_tipo == "cliente" else equipo.get(m.autor_id),
                "texto": m.texto,
                "archivos": archivos.get(m.id, []),
                "cuando": m.creado_en.isoformat(timespec="seconds") + "Z",
            }
            for m in ultimos
        ]
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


# --- Ejemplos de voz sin nombres ajenos -------------------------------------------------------------
# Los ejemplos de cómo escribe alguien son mensajes a OTROS clientes ("buenas sebas, genial"). Si van con
# los nombres, la IA los copia en la respuesta a este cliente. Antes de mandarlos se tapan: menciones y
# nombres de pila de clientes (y sus diminutivos: "sebas" de Sebastián) pasan a [nombre].
_PALABRAS_QUE_SON_NOMBRES = {
    "luz", "sol", "paz", "rosa", "flor", "mar", "angel", "alma", "rey", "leon", "cruz", "santos", "luna", "pilar",
    "cielo", "gracia", "gloria", "esperanza", "victoria", "buen", "bueno", "hola", "dia", "mes", "pro", "team",
    # palabras comunes que también son (o empiezan) nombres en alguna ficha
    "del", "las", "los", "una", "uno", "con", "por", "para", "que", "como", "pero", "mas", "muy", "eso", "esto", "esta",
    "este", "ese", "esa", "sus", "mis", "tus", "nos", "les", "todo", "toda", "bien", "dale", "vamos", "hay", "ser", "son",
    "van", "voy", "vos", "ella", "aca", "ahi", "solo", "san", "santa", "sin", "sobre", "desde", "hasta", "entre", "cuando",
    "donde", "otro", "otra", "dos", "tres", "mil", "imperio", "scale", "program", "digital", "momentum", "agencia",
}
_cache_nombres: dict = {"en": 0.0, "nombres": frozenset(), "equipo": frozenset()}


def _sin_tildes(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", t.lower()) if unicodedata.category(c) != "Mn")


def _nombres_ajenos() -> tuple[frozenset, frozenset]:
    import time

    if time.time() - _cache_nombres["en"] < 3600 and _cache_nombres["nombres"]:
        return _cache_nombres["nombres"], _cache_nombres["equipo"]
    with db_session:
        # (una sola columna: Pony devuelve los valores sueltos, no tuplas)
        crudos = list(db.select("SELECT nombre FROM clients.clientes WHERE nombre IS NOT NULL"))
        crudos += list(db.select(f'SELECT DISTINCT autor_nombre FROM "{DB_SCHEMA}"."mensajes_canal" WHERE autor_tipo = \'cliente\' AND autor_nombre IS NOT NULL'))
        equipo = {_sin_tildes(p) for n in db.select(f'SELECT nombre FROM "{DB_SCHEMA}"."admins" WHERE nombre IS NOT NULL') for p in n.split()}
    nombres = set()
    for n in crudos:
        # Solo el nombre de pila (la primera palabra): las fichas con nombre de marca no tapan palabras comunes.
        partes = [p for p in re.split(r"[\s_.\-]+", n or "") if p]
        p = _sin_tildes(partes[0]) if partes else ""
        if len(p) >= 3 and p.isalpha() and p not in _PALABRAS_QUE_SON_NOMBRES and p not in equipo:
            nombres.add(p)
    _cache_nombres.update(en=time.time(), nombres=frozenset(nombres), equipo=frozenset(equipo))
    return _cache_nombres["nombres"], _cache_nombres["equipo"]


def ocultar_nombres(texto: str, nombres: frozenset | None = None) -> str:
    if not texto:
        return texto
    todos, equipo = _nombres_ajenos()
    nombres = todos if nombres is None else nombres
    texto = re.sub(r"@[\wÁÉÍÓÚÜÑáéíóúüñ.]+(?: [A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?", "@[nombre]", texto)

    def cambiar(m):
        p = _sin_tildes(m.group(0))
        # Los del equipo (y sus diminutivos: "cris" de Cristian) se nombran tal cual: "lo vemos con Juan".
        if p in _PALABRAS_QUE_SON_NOMBRES or any(e.startswith(p) for e in equipo if len(p) >= 3):
            return m.group(0)
        if p in nombres or (len(p) >= 4 and any(len(n) >= 5 and n.startswith(p) and len(n) - len(p) <= 4 for n in nombres)):
            return "[nombre]"
        return m.group(0)

    return re.sub(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}", cambiar, texto)


def voz_para_ia(voz: dict) -> dict:
    """La voz lista para el pedido a la IA: ejemplos y correcciones sin nombres de otros clientes."""
    nombres, _ = _nombres_ajenos()
    return {
        **voz,
        "ejemplos": [ocultar_nombres(e, nombres) for e in voz.get("ejemplos") or []],
        "correcciones": [{**c, "propuesto": ocultar_nombres(c.get("propuesto") or "", nombres), "enviado": ocultar_nombres(c.get("enviado") or "", nombres)} for c in voz.get("correcciones") or []],
        "descartadas": [{"propuesto": ocultar_nombres(c.get("propuesto") or "", nombres), "enviado": ocultar_nombres(c.get("enviado") or "", nombres)} for c in voz.get("descartadas") or []],
    }
