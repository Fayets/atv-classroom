"""Completar con Tab en la voz de cada persona del equipo.

Con lo que aprendió el cerebro (perfil del cliente, hechos, lo que le funcionó a otros del nicho
y cómo escribe esa persona) la IA propone cómo seguir el mensaje. Si el borrador está vacío,
propone la respuesta entera al último mensaje del cliente. La persona acepta con Tab o sigue
escribiendo. Nada se manda solo.
"""

import logging
from datetime import datetime
import re
import time
from collections import defaultdict, deque

from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.models import Admin, Clase, MensajeCanal, SugerenciaIA
from src.services.cerebro_service import CONCEPTOS, _bonito
from src.services import aprendizaje_service as ap
from src.services import gasto_ia
from src.services.auth_service import es_equipo

logger = logging.getLogger(__name__)

MODELO = config("SUGERENCIAS_MODEL", default="claude-haiku-5-5")
TOPE_POR_MINUTO = 40
_pedidos: dict[int, deque] = defaultdict(deque)
_nicho_cache: dict[str, tuple[float, dict | None]] = {}
# Qué emojis puede llevar cada sugerencia en curso: los que esa persona usa de verdad.
# None = ninguno (casi no usa). Lo decide el código, no la IA: el modelo copiaba los emojis
# de quien hubiera escrito antes en el chat (el 🫡 de otro del equipo salía en la voz de Franco).
_emojis_ok: dict[int, set[str] | None] = {}

_EMOJI = re.compile(
    "[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF\U00002B00-\U00002BFF\u200d\ufe0f\u20e3]"
)
# Un mensaje del cliente que solo cierra: agradece, confirma o es un emoji. No pide nada nuevo.
_CIERRE = re.compile(
    r"^(mil |muchas |muchisimas |muchísimas )?(gracias|grax|genial|perfecto|perfe|dale|listo|joya|buenisimo|buenísimo|"
    r"de diez|ok|okey|oka|sisi|si|sí|bien|barbaro|bárbaro|excelente|re bien|vamos|hecho|entendido|ahi va|ahí va|"
    r"nos vemos|hablamos|abrazo|saludos)\b[^?¿]*$",
    re.I,
)


def sin_emojis(texto: str) -> str:
    return filtrar_emojis(texto, None)


def filtrar_emojis(texto: str, permitidos: set[str] | None) -> str:
    """Saca los emojis que esta persona no usa. `permitidos` None saca todos."""
    limpio = _EMOJI.sub(lambda m: m.group(0) if permitidos and m.group(0) in permitidos else "", texto)
    return re.sub(r"[ \t]{2,}", " ", limpio)


def emojis_de(rasgos: dict) -> set[str] | None:
    """Los emojis propios: si casi no usa, ninguno; si usa, solo los suyos."""
    if (rasgos or {}).get("emojis_pct", 0) < 15:
        return None
    return {e for e in (rasgos.get("emojis_top") or []) if e} or None


def pendientes_del_cliente(conversacion: list[dict]) -> list[dict]:
    """Los mensajes del cliente que llegaron después de la última respuesta del equipo."""
    salida = []
    for m in reversed(conversacion or []):
        if m.get("de") != "cliente":
            break
        salida.append(m)
    return list(reversed(salida))


def es_cierre(mensajes: list[dict]) -> bool:
    """Lo último del cliente es solo un agradecimiento, un ok o un emoji (no pide nada)."""
    textos = [(m.get("texto") or "").strip() for m in mensajes]
    textos = [t for t in textos if t]
    if not textos:
        return False
    for t in textos:
        limpio = sin_emojis(t).strip(" !.¡,")
        if not limpio:
            continue  # solo emoji
        if len(limpio.split()) > 8 or not _CIERRE.match(limpio):
            return False
    return True


def _frenar(admin_id: int) -> None:
    ahora = time.time()
    q = _pedidos[admin_id]
    while q and ahora - q[0] > 60:
        q.popleft()
    if len(q) >= TOPE_POR_MINUTO:
        raise HTTPException(status_code=429, detail="Demasiadas sugerencias seguidas.")
    q.append(ahora)


def _describir_voz(r: dict) -> str:
    """Los rasgos medidos, como instrucciones concretas de escritura."""
    if not r:
        return "Todavía no hay mensajes suyos para medir el estilo: escribí cálido, claro y breve, con voseo rioplatense."
    g = lambda k: r.get(k) or 0
    reglas = [f"mensajes de unas {g('palabras_promedio'):.0f} palabras"]
    if g("todo_minuscula_pct") >= 60:
        reglas.append("escribe todo en minúscula, sin mayúscula al empezar")
    elif g("mayuscula_inicial_pct") >= 80:
        reglas.append("empieza siempre con mayúscula")
    elif g("mayuscula_inicial_pct") <= 40:
        reglas.append("muchas veces empieza en minúscula")
    if g("grita_pct") >= 10:
        reglas.append("a veces pone palabras enteras en MAYÚSCULA para remarcar")
    if g("punto_final_pct") <= 20:
        reglas.append("casi nunca pone punto final")
    elif g("punto_final_pct") >= 60:
        reglas.append("cierra con punto final")
    if g("preguntas_pct") >= 30:
        reglas.append("suele cerrar con una pregunta")
    if r.get("abre_pregunta_pct") is not None and g("preguntas_pct") >= 10:
        reglas.append("usa ¿ al abrir preguntas" if g("abre_pregunta_pct") >= 50 else "no usa ¿ (solo ? al final)")
    if g("exclamaciones_pct") >= 25:
        reglas.append("usa exclamaciones" + (" dobles (!!)" if g("exclamacion_doble_pct") >= 10 else "") + ("" if g("abre_exclamacion_pct") >= 50 else ", sin ¡ al abrir"))
    if g("suspensivos_pct") >= 10:
        reglas.append("usa puntos suspensivos")
    if g("voseo_pct") >= 30:
        reglas.append("usa voseo (vos, tenés, fijate)")
    if g("alarga_palabras_pct") >= 8:
        reglas.append('alarga palabras para dar énfasis (ej. "buenísimooo")')
    if g("risas_pct") >= 8 and r.get("risa_tipica"):
        reglas.append(f'se ríe con "{r["risa_tipica"]}"')
    reglas.append(f"emojis frecuentes: {' '.join(r['emojis_top'][:4])}" if g("emojis_pct") >= 15 and r.get("emojis_top") else "casi sin emojis")
    if r.get("muletillas"):
        reglas.append("muletillas que usa: " + ", ".join(f'"{m}"' for m in r["muletillas"][:6]))
    if r.get("abreviaturas"):
        reglas.append("abrevia: " + ", ".join(r["abreviaturas"]))
    if r.get("palabras_propias"):
        reglas.append("palabras muy suyas: " + ", ".join(r["palabras_propias"][:8]))
    if r.get("aperturas_top"):
        reglas.append("suele arrancar con: " + ", ".join(f'"{a}"' for a in r["aperturas_top"][:3]))
    if g("varios_seguidos_pct") >= 40:
        reglas.append("suele mandar mensajes cortos, de a uno")
    reglas += _reglas_de_correcciones(r.get("correcciones") or {})
    return "; ".join(reglas) + "."


def _reglas_de_correcciones(c: dict) -> list[str]:
    """Lo que esta persona le corrige siempre a la IA, medido en código (ver rasgos_correcciones)."""
    if not c or c.get("aceptadas", 0) < 3:
        return []
    reglas = []
    largo = c.get("largo_vs_ia")
    if largo and largo <= 0.8:
        reglas.append(f"cuando la IA le propone algo, lo recorta (deja más o menos el {round(largo * 100)} %): escribí más corto")
    elif largo and largo >= 1.25:
        reglas.append("cuando la IA le propone algo, lo alarga: no te quedes corto")
    if c.get("saca"):
        reglas.append("nunca uses estas palabras (las saca cada vez que la IA las pone): " + ", ".join(f'"{w}"' for w in c["saca"][:8]))
    if c.get("agrega"):
        reglas.append("suele agregar: " + ", ".join(f'"{w}"' for w in c["agrega"][:8]))
    if (c.get("saca_emojis_pct") or 0) >= 60:
        reglas.append("saca los emojis que le propone la IA")
    if (c.get("saca_signos_apertura_pct") or 0) >= 60:
        reglas.append("saca los ¿ y ¡ de apertura")
    if (c.get("saca_punto_final_pct") or 0) >= 60:
        reglas.append("saca el punto final")
    if (c.get("pasa_a_minuscula_pct") or 0) >= 60:
        reglas.append("cambia la mayúscula del principio por minúscula")
    return reglas


def _nicho(slug: str | None) -> dict | None:
    if not slug:
        return None
    hit = _nicho_cache.get(slug)
    if hit and time.time() - hit[0] < 300:
        return hit[1]
    datos = ap.por_nicho(slug)
    valor = datos[0] if datos else None
    _nicho_cache[slug] = (time.time(), valor)
    return valor


def clases_relacionadas(ctx: dict, maximo: int = 12) -> list[str]:
    """Clases reales que tratan los conceptos de los que habló el cliente (para que la IA no invente clases)."""
    conceptos = [h["concepto"] for h in (ctx.get("hechos") or []) if h.get("concepto")]
    if not conceptos:
        return []
    puntaje: dict[str, int] = {}
    for clase_id, ids in CONCEPTOS["clases"].items():
        n = sum(1 for c in conceptos if c in ids)
        if n:
            puntaje[clase_id] = n
    elegidas = sorted(puntaje, key=lambda k: -puntaje[k])[:maximo]
    titulos = _titulos_de_clases()
    return [titulos[int(i)] for i in elegidas if int(i) in titulos]


_titulos: tuple[float, dict] = (0.0, {})


def _titulos_de_clases() -> dict[int, str]:
    """Los títulos de todas las clases, guardados 10 minutos (cambian muy poco)."""
    global _titulos
    if time.time() - _titulos[0] > 600:
        with db_session:
            _titulos = (time.time(), {c.id: _bonito(c.titulo) for c in list(Clase.select())})
    return _titulos[1]


def _hace(cuando: str | None) -> str:
    """ " hace 3 días" a partir de la fecha ISO del mensaje (vacío si no se sabe)."""
    if not cuando:
        return ""
    try:
        dif = datetime.utcnow() - datetime.fromisoformat(cuando.rstrip("Z"))
    except ValueError:
        return ""
    horas = dif.total_seconds() / 3600
    if horas < 24:
        return f" hace {max(1, round(horas))} {'hora' if round(horas) <= 1 else 'horas'}"
    dias = round(horas / 24)
    return f" hace {dias} {'día' if dias == 1 else 'días'}"


def _texto_con_archivos(m: dict) -> str:
    """El texto del mensaje y, si mandó archivos, cuáles (la IA no los ve, pero tiene que saber que están)."""
    tipos = m.get("archivos") or []
    partes = []
    if tipos:
        imagenes = sum(1 for t in tipos if t.startswith("image/"))
        audios = sum(1 for t in tipos if t.startswith("audio/"))
        otros = len(tipos) - imagenes - audios
        if imagenes:
            partes.append("[mandó una captura/imagen que no podés ver]" if imagenes == 1 else f"[mandó {imagenes} capturas/imágenes que no podés ver]")
        if audios:
            partes.append("[mandó un audio que no podés escuchar]")
        if otros:
            partes.append("[mandó un archivo]")
    return " ".join(([m["texto"]] if m.get("texto") else []) + partes)


def armar_prompt(nombre: str, ctx: dict, borrador: str, nicho: dict | None) -> tuple[str, str]:
    voz = ap.voz_para_ia(ctx.get("voz") or {})
    ejemplos = "\n".join(f"- {e[:400]}" for e in (voz.get("ejemplos") or [])[:16]) or "(sin ejemplos todavía)"
    correcciones = voz.get("correcciones") or []
    correcciones_txt = ""
    if correcciones:
        correcciones_txt = (
            f"\nAsí corrigió sugerencias anteriores de la IA antes de mandarlas (es lo que más importa copiar):\n"
            + "\n".join(f'- La IA propuso: "{c["propuesto"][:300]}"\n  Mandó: "{c["enviado"][:300]}"' for c in correcciones[:6])
            + "\n"
        )
    descartadas = voz.get("descartadas") or []
    if descartadas:
        # Lo que la IA propuso y no le sirvió, contra lo que escribió de verdad: qué responde y cómo.
        correcciones_txt += (
            f"\nSugerencias de la IA que {nombre} NO usó y lo que escribió en su lugar (así responde de verdad; no repitas esos errores):\n"
            + "\n".join(f'- La IA propuso: "{c["propuesto"][:300]}"\n  Escribió: "{c["enviado"][:300]}"' for c in descartadas[:4])
            + "\n"
        )
    perfil = ctx.get("perfil") or {}
    perfil_txt = "; ".join(f"{k}: {v}" for k, v in perfil.items() if v) or "sin datos todavía"
    hechos = ctx.get("hechos") or []
    hechos_txt = "\n".join(f"- [{h['tipo']}] {h['texto']}" for h in hechos[:14]) or "(nada todavía)"
    nicho_txt = ""
    if nicho:
        # Si su subnicho ya tiene experiencias, van primero: son los más parecidos a este cliente.
        sub = next((g for g in nicho.get("subnichos") or [] if g["subnicho"] == perfil.get("subnicho")), None)
        funciono = [f"- {h['texto']}" for h in ((sub or {}).get("le_funciono", []) + nicho.get("le_funciono", []))[:5]]
        dolores = ", ".join(d["que"] for d in nicho.get("dolores", [])[:5])
        nicho_txt = f"\nEn su nicho ({nicho['nicho']}{', ' + sub['subnicho'] if sub else ''}) los dolores más comunes son: {dolores or 'sin datos'}.\n"
        if funciono:
            nicho_txt += "A otros clientes del mismo nicho les funcionó (no nombres a nadie):\n" + "\n".join(funciono) + "\n"
    ultimos = [m for m in (ctx.get("conversacion") or [])[-15:] if m.get("texto") or m.get("archivos")]
    sin_responder = pendientes_del_cliente(ultimos)
    corte = len(ultimos) - len(sin_responder)
    lineas = []
    for i, m in enumerate(ultimos):
        if i == corte and sin_responder:
            lineas.append("--- lo que el cliente escribió después de la última respuesta del equipo ---")
        lado = "CLIENTE" if m["de"] == "cliente" else "EQUIPO"
        quien = f" ({m['quien']})" if m.get("quien") else ""
        lineas.append(f"{lado}{quien}{_hace(m.get('cuando'))}: {_texto_con_archivos(m)}")
    conversacion = "\n".join(lineas)
    sistema = (
        f"Sos {nombre}, del equipo de ATV (mentoría para creadores y expertos que venden infoproductos). "
        "Escribís en el chat privado con un cliente. Imitá su forma de escribir al detalle: mayúsculas y "
        "minúsculas, puntuación, palabras y muletillas, abreviaturas, largo, signos y emojis, como en sus "
        "mensajes reales de ejemplo. Si los ejemplos y las reglas no coinciden, mandan los ejemplos. Devolvés SOLO el mensaje, sin comillas "
        "ni explicaciones. No inventes datos, precios, links, fechas ni promesas: si te falta algo, preguntá. "
        "Respondés solo a lo último que escribió el cliente: los mensajes viejos y lo aprendido son contexto, no temas "
        "para retomar (eso ya se habló, muchas veces en audios o llamadas que no ves). "
        # El modelo copiaba el saludo del cliente ("buenas kingg") y los emojis de otro del equipo.
        # El tema sí se retoma; la forma de hablar de los demás, no.
        f"Escribís como {nombre} y nada más: NO copies el saludo, los apodos, las muletillas ni los emojis que "
        f"aparecen en la conversación, ni del cliente ni de otra persona del equipo. Esas palabras son de ellos, "
        f"no de {nombre}. Si el cliente saluda con una palabra que {nombre} no usa, saludá como saluda {nombre}. "
        "Del mensaje del cliente retomás el tema, nunca su forma de escribir. "
        # Preguntaba por lo que el cliente acababa de contar y le ofrecía hacer lo que dijo que ya hizo.
        "Leé bien lo que contó el cliente: no le preguntes algo que ya respondió ahí ni le ofrezcas hacer algo que "
        "dice que ya hizo o que está esperando. Si solo te está contando novedades, reconocelas y, como mucho, "
        "preguntá por el paso siguiente. En la conversación figura entre paréntesis quién escribió cada mensaje; "
        "si la charla la venía llevando otra persona del equipo, seguí ese hilo sin repetir lo que ya preguntó."
    )
    largo = round((voz.get("rasgos") or {}).get("palabras_promedio") or 25)
    ultimo = next((m for m in reversed(ctx.get("conversacion") or []) if m.get("texto")), None)
    if borrador.strip():
        tarea = (
            f"Ya empezó a escribir. Devolvé el mensaje COMPLETO como lo terminaría, arrancando exactamente "
            f"con lo que ya escribió, letra por letra (si cortó una palabra, completala):\n{borrador}\n"
            f"Que el mensaje entero tenga alrededor de {largo} palabras."
        )
    elif ultimo and ultimo.get("de") != "cliente":
        tarea = (
            f"Todavía no escribió nada. El último mensaje lo mandó el equipo{_hace(ultimo.get('cuando'))} y el cliente no respondió. "
            f"Devolvé un mensaje corto de seguimiento, como lo mandaría {nombre}: que retome lo último que se habló sin repetirlo "
            f"y que invite a responder. Alrededor de {largo} palabras."
        )
    elif es_cierre(pendientes_del_cliente(ctx.get("conversacion") or [])):
        tarea = (
            "Todavía no escribió nada. El cliente solo agradeció o confirmó: no pide nada. Devolvé un cierre "
            f"cortito como lo mandaría {nombre} (de 2 a 6 palabras, ej. \"de nada!\" o \"a vos!\"), sin sumar temas, "
            "preguntas, links ni pedidos."
        )
    else:
        tarea = (
            "Todavía no escribió nada. Devolvé la respuesta que mandaría ahora a lo que el cliente escribió después "
            f"de la última respuesta del equipo, de hasta {largo} palabras (menos si alcanza)."
        )
        # Ante varias preguntas el tope del promedio lo dejaba sin decir nada ("leí todo… lo vemos hoy?").
        if "?" in " ".join(m.get("texto") or "" for m in sin_responder):
            seguidos = ((voz.get("rasgos") or {}).get("varios_seguidos_pct") or 0) >= 50
            tarea = (
                "Todavía no escribió nada. El cliente hizo preguntas después de la última respuesta del equipo: "
                f"contestá la más importante con una postura concreta, como la daría {nombre} (qué hacer, qué no, o en qué orden). "
                "No le devuelvas la pregunta ni propongas verlo más tarde, y no abras con algo que solo acuse recibo "
                "(\"leí todo\", \"uff\", \"buenísimo\"). "
                + (f"Podés partirlo en 2 o 3 renglones cortos, uno debajo del otro, como manda {nombre} varios mensajes seguidos; "
                   f"en total hasta {largo * 3} palabras." if seguidos else f"Hasta {largo * 2} palabras.")
            )
    tarea += f"\nEscribís vos, {nombre}, del lado del EQUIPO y para el cliente: nunca escribas como el cliente ni le hables a otra persona del equipo."
    cliente = (ctx.get("cliente_nombre") or "").split()
    tarea += (
        "\nLos ejemplos son mensajes a OTROS clientes: donde dice [nombre] iba el nombre de otra persona. Nunca uses "
        "nombres que no aparezcan en esta conversación" + (f"; a este cliente, si lo nombrás, es {cliente[0].lower()}." if cliente else ".")
    )
    clases = clases_relacionadas(ctx)
    clases_txt = ("Si recomendás una clase del classroom, solo puede ser una de estas (con este nombre): " + "; ".join(clases)) if clases else "No recomiendes clases por nombre."
    usuario = f"""Cómo escribe {nombre}: {_describir_voz(voz.get('rasgos') or {})}
Mensajes reales suyos:
{ejemplos}
{correcciones_txt}
Lo que sabemos del cliente: {perfil_txt}
Lo que aprendimos de sus conversaciones:
{hechos_txt}
{nicho_txt}
{clases_txt}

Conversación (lo último abajo):
{conversacion or '(todavía no hay mensajes)'}

{tarea}"""
    return sistema, usuario


def limpiar(texto: str, borrador: str) -> str:
    """Lo que hay que agregar después del borrador. La IA devuelve el mensaje completo; si arranca
    con el borrador tal cual, la sugerencia es el resto (así las palabras cortadas y los espacios
    quedan bien). Si lo cambió, no se arriesga: no hay sugerencia."""
    t = (texto or "").strip().strip('"“”').rstrip()
    if not borrador.strip():
        return t
    if t.startswith(borrador):
        return t[len(borrador):]
    b = borrador.rstrip()
    if t.startswith(b):
        resto = t[len(b):]
        return resto.lstrip() if borrador != b else resto
    if t.lower().startswith(b.lower()):
        return t[len(b):]
    return ""


def _stream(sistema: str, usuario: str):
    from anthropic import Anthropic

    cliente = Anthropic(api_key=config("ANTHROPIC_API_KEY", default=""), timeout=20)
    with cliente.messages.stream(
        model=MODELO,
        max_tokens=260,
        # Haiku apaga el razonamiento con "disabled"; Sonnet 5.5 pide "between_tools" (sin herramientas, no piensa).
        thinking={"type": "disabled"} if "haiku" in MODELO else {"type": "between_tools"},
        system=sistema,
        messages=[{"role": "user", "content": usuario}],
    ) as st:
        yield from st.text_stream
        try:
            gasto_ia.registrar("tab:sonnet" if "sonnet" in MODELO else "tab", st.get_final_message().usage)
        except Exception:  # el registro nunca corta una sugerencia
            pass


class _Recorte:
    """Va recibiendo el mensaje completo de a pedazos y devuelve solo lo que va después del borrador."""

    def __init__(self, borrador: str):
        self.borrador = borrador
        self.acumulado = ""
        self.entregado = 0
        self.roto = False

    def agregar(self, pedazo: str) -> str:
        if self.roto:
            return ""
        self.acumulado += pedazo
        texto = self.acumulado.lstrip().lstrip('"“')
        b = self.borrador
        if not b.strip():
            nuevo = texto[self.entregado:]
            self.entregado = len(texto)
            return nuevo
        if len(texto) < len(b.rstrip()):
            if not b.lower().startswith(texto.lower()):
                self.roto = True  # cambió lo que ya escribió: no se sugiere nada
            return ""
        resto = limpiar(texto, b)
        if not resto and not texto.lower().startswith(b.rstrip().lower()):
            self.roto = True
            return ""
        nuevo = resto[self.entregado:]
        self.entregado = len(resto)
        return nuevo


class SugerenciasServices:
    def sugerir(self, sesion: dict, canal: dict, borrador: str, stream=_stream) -> dict:
        """La sugerencia entera de una vez (para pruebas y para usos sin streaming)."""
        a = time.time()
        sistema, usuario, sid = self.preparar(sesion, canal, borrador)
        texto = "".join(self.transmitir(sistema, usuario, borrador, sid, stream=stream))
        return {"id": sid, "texto": texto, "ms": int((time.time() - a) * 1000)}

    def preparar(self, sesion: dict, canal: dict, borrador: str) -> tuple[str, str, int]:
        """Valida, arma el pedido para la IA y deja registrada la sugerencia (se completa al terminar)."""
        if not es_equipo(sesion):
            raise HTTPException(status_code=403, detail="Solo para el equipo.")
        if canal.get("tipo") != "cliente":
            raise HTTPException(status_code=422, detail="Las sugerencias son para chats con clientes.")
        if not config("ANTHROPIC_API_KEY", default=""):
            raise HTTPException(status_code=503, detail="La IA no está configurada.")
        admin_id = sesion["usuario_id"]
        _frenar(admin_id)
        with db_session:
            yo = Admin.get(id=admin_id)
            # Cada uno elige en Mi cuenta con la voz de quién le sugiere el Tab (por defecto, la propia).
            voz = Admin.get(id=yo.voz_tab) if yo and yo.voz_tab else None
            voz = voz if voz and voz.activo else yo
            voz_id = voz.id if voz else admin_id
            nombre = (voz.nombre or "el coach") if voz else "el coach"
        ctx = ap.contexto_para_responder(canal["id"], voz_id, incluir_nicho=False)
        ctx["cliente_nombre"] = canal.get("nombre")
        nicho = _nicho((ctx.get("perfil") or {}).get("nicho"))
        with db_session:
            s = SugerenciaIA(admin_id=admin_id, canal_id=canal["id"], borrador=borrador[-2000:] or None, sugerencia="…", modelo=MODELO, voz_id=voz_id)
            s.flush()
            sid = s.id
        sistema, usuario = armar_prompt(nombre.split()[0], ctx, borrador, nicho)
        _emojis_ok[sid] = emojis_de((ctx.get("voz") or {}).get("rasgos") or {})
        return sistema, usuario, sid

    def transmitir(self, sistema: str, usuario: str, borrador: str, sid: int, stream=_stream):
        """Generador de texto: lo que sigue después del borrador, a medida que la IA lo escribe."""
        a = time.time()
        recorte = _Recorte(borrador)
        permitidos = _emojis_ok.pop(sid, None)
        total = ""
        try:
            for pedazo in stream(sistema, usuario):
                nuevo = recorte.agregar(pedazo)
                if nuevo:
                    nuevo = filtrar_emojis(nuevo, permitidos)
                    if not total:
                        nuevo = nuevo.lstrip()
                if nuevo:
                    total += nuevo
                    yield nuevo
        except Exception:
            logger.exception("Sugerencias: se cortó la IA")
        finally:
            with db_session:
                s = SugerenciaIA.get(id=sid)
                if s is not None:
                    s.sugerencia = total.rstrip()[:2000] or "(vacía)"
                    s.ms = int((time.time() - a) * 1000)

    def enviada(self, sesion: dict, sugerencia_id: int, mensaje_id: int) -> dict:
        """El mensaje que se mandó después de aceptar la sugerencia. La diferencia entre lo que propuso la IA
        y lo que salió es cómo escribe esa persona de verdad: alimenta su voz (ver rasgos_correcciones)."""
        with db_session:
            s = SugerenciaIA.get(id=sugerencia_id)
            m = MensajeCanal.get(id=mensaje_id)
            if s is None or m is None or not es_equipo(sesion) or s.admin_id != sesion["usuario_id"]:
                raise HTTPException(status_code=404, detail="Sugerencia no encontrada.")
            if (m.autor_tipo, m.autor_id) != ("admin", s.admin_id) or m.canal.id != s.canal_id:
                raise HTTPException(status_code=422, detail="Ese mensaje no es de esta sugerencia.")
            s.usada = True
            s.enviado = (m.texto or "")[:4000]
            s.mensaje_id = m.id
            s.cambio_pct = ap.cambio_pct(((s.borrador or "") + s.sugerencia).strip(), s.enviado)
            return {"ok": True, "cambio_pct": s.cambio_pct}

    def usada(self, sesion: dict, sugerencia_id: int) -> dict:
        with db_session:
            s = SugerenciaIA.get(id=sugerencia_id)
            if s is None or not es_equipo(sesion) or s.admin_id != sesion["usuario_id"]:
                raise HTTPException(status_code=404, detail="Sugerencia no encontrada.")
            s.usada = True
        return {"ok": True}
