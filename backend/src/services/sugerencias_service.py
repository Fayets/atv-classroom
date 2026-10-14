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

from src.models import Admin, Clase, SugerenciaIA
from src.services.cerebro_service import CONCEPTOS, _bonito
from src.services import aprendizaje_service as ap
from src.services import gasto_ia
from src.services.auth_service import es_equipo

logger = logging.getLogger(__name__)

MODELO = config("SUGERENCIAS_MODEL", default="claude-haiku-5-5")
TOPE_POR_MINUTO = 40
_pedidos: dict[int, deque] = defaultdict(deque)
_nicho_cache: dict[str, tuple[float, dict | None]] = {}
# Sugerencias en curso que salen sin emojis (la persona casi no los usa): lo decide el código, no la IA.
_sin_emojis: set[int] = set()

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
    return re.sub(r"[ \t]{2,}", " ", _EMOJI.sub("", texto))


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
    return "; ".join(reglas) + "."


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


def armar_prompt(nombre: str, ctx: dict, borrador: str, nicho: dict | None) -> tuple[str, str]:
    voz = ctx.get("voz") or {}
    ejemplos = "\n".join(f"- {e[:400]}" for e in (voz.get("ejemplos") or [])[:16]) or "(sin ejemplos todavía)"
    perfil = ctx.get("perfil") or {}
    perfil_txt = "; ".join(f"{k}: {v}" for k, v in perfil.items() if v) or "sin datos todavía"
    hechos = ctx.get("hechos") or []
    hechos_txt = "\n".join(f"- [{h['tipo']}] {h['texto']}" for h in hechos[:14]) or "(nada todavía)"
    nicho_txt = ""
    if nicho:
        funciono = [f"- {h['texto']}" for h in nicho.get("le_funciono", [])[:5]]
        dolores = ", ".join(d["que"] for d in nicho.get("dolores", [])[:5])
        nicho_txt = f"\nEn su nicho ({nicho['nicho']}) los dolores más comunes son: {dolores or 'sin datos'}.\n"
        if funciono:
            nicho_txt += "A otros clientes del mismo nicho les funcionó (no nombres a nadie):\n" + "\n".join(funciono) + "\n"
    ultimos = [m for m in (ctx.get("conversacion") or [])[-15:] if m.get("texto")]
    sin_responder = pendientes_del_cliente(ultimos)
    corte = len(ultimos) - len(sin_responder)
    lineas = []
    for i, m in enumerate(ultimos):
        if i == corte and sin_responder:
            lineas.append("--- lo que el cliente escribió después de la última respuesta del equipo ---")
        lineas.append(f"{'CLIENTE' if m['de'] == 'cliente' else 'EQUIPO'}{_hace(m.get('cuando'))}: {m['texto']}")
    conversacion = "\n".join(lineas)
    sistema = (
        f"Sos {nombre}, del equipo de ATV (mentoría para creadores y expertos que venden infoproductos). "
        "Escribís en el chat privado con un cliente. Imitá su forma de escribir al detalle: mayúsculas y "
        "minúsculas, puntuación, palabras y muletillas, abreviaturas, largo, signos y emojis, como en sus "
        "mensajes reales de ejemplo. Si los ejemplos y las reglas no coinciden, mandan los ejemplos. Devolvés SOLO el mensaje, sin comillas "
        "ni explicaciones. No inventes datos, precios, links, fechas ni promesas: si te falta algo, preguntá. "
        "Respondés solo a lo último que escribió el cliente: los mensajes viejos y lo aprendido son contexto, no temas "
        "para retomar (eso ya se habló, muchas veces en audios o llamadas que no ves)."
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
    tarea += f"\nEscribís vos, {nombre}, del lado del EQUIPO y para el cliente: nunca escribas como el cliente ni le hables a otra persona del equipo."
    clases = clases_relacionadas(ctx)
    clases_txt = ("Si recomendás una clase del classroom, solo puede ser una de estas (con este nombre): " + "; ".join(clases)) if clases else "No recomiendes clases por nombre."
    usuario = f"""Cómo escribe {nombre}: {_describir_voz(voz.get('rasgos') or {})}
Mensajes reales suyos:
{ejemplos}

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
        thinking={"type": "disabled"},
        system=sistema,
        messages=[{"role": "user", "content": usuario}],
    ) as st:
        yield from st.text_stream
        try:
            gasto_ia.registrar("tab", st.get_final_message().usage)
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
        nicho = _nicho((ctx.get("perfil") or {}).get("nicho"))
        with db_session:
            s = SugerenciaIA(admin_id=admin_id, canal_id=canal["id"], borrador=borrador[-2000:] or None, sugerencia="…", modelo=MODELO)
            s.flush()
            sid = s.id
        sistema, usuario = armar_prompt(nombre.split()[0], ctx, borrador, nicho)
        if ((ctx.get("voz") or {}).get("rasgos") or {}).get("emojis_pct", 0) < 15:
            _sin_emojis.add(sid)
        return sistema, usuario, sid

    def transmitir(self, sistema: str, usuario: str, borrador: str, sid: int, stream=_stream):
        """Generador de texto: lo que sigue después del borrador, a medida que la IA lo escribe."""
        a = time.time()
        recorte = _Recorte(borrador)
        limpiar_emojis = sid in _sin_emojis
        _sin_emojis.discard(sid)
        total = ""
        try:
            for pedazo in stream(sistema, usuario):
                nuevo = recorte.agregar(pedazo)
                if nuevo and limpiar_emojis:
                    nuevo = sin_emojis(nuevo)
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

    def usada(self, sesion: dict, sugerencia_id: int) -> dict:
        with db_session:
            s = SugerenciaIA.get(id=sugerencia_id)
            if s is None or not es_equipo(sesion) or s.admin_id != sesion["usuario_id"]:
                raise HTTPException(status_code=404, detail="Sugerencia no encontrada.")
            s.usada = True
        return {"ok": True}
