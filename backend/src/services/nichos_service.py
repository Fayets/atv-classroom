"""El nicho y el subnicho de cada cliente, decididos mirando TODO lo suyo.

El aprendizaje por lotes ve 60 mensajes por vez y ahí el cliente casi siempre habla de marketing,
ventas y contenido (es lo que trabaja en ATV), así que el nicho le salía "marketing-digital" a gente
que vende coaching o software. Acá se decide una vez por cliente con lo que dijo de su negocio: la
ficha del onboarding, lo que el cerebro ya anotó (a qué se dedica, qué vende) y sus mensajes donde
habla de su negocio.

- La IA (Haiku) propone el nicho, el subnicho (a quién le vende y qué) y la frase que lo prueba.
- El código valida: el nicho tiene que ser de la lista, la frase tiene que estar en lo que dijo el
  cliente y, si el nicho es uno de los de ATV (marketing, ventas…), la frase tiene que mostrar que
  VENDE eso. El subnicho se unifica con los que ya existen para que los parecidos queden juntos.
- Si un lote nuevo propone otro nicho, el perfil vuelve a quedar pendiente y se revisa de nuevo.
"""

import json
import logging
import re
from datetime import datetime

from decouple import config
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.models import Canal, MensajeCanal, OnboardingCerebro, PerfilCliente
from src.services import gasto_ia
from src.services.aprendizaje_service import (
    NICHOS,
    NICHOS_DE_ATV,
    REGLA_NICHO,
    _llave_sub,
    _norm,
    leer_json,
    limpiar_subnicho,
    unificar_subnicho,
)

logger = logging.getLogger(__name__)

MODELO = config("NICHOS_MODEL", default="claude-haiku-5-5")
MAX_MENSAJES = 30
# Mensajes donde el cliente habla de su negocio (no de lo que está aprendiendo).
_DE_SU_NEGOCIO = re.compile(
    r"\b(me dedico|mi negocio|mi marca|mis clientes|mis alumn|mis pacientes|mi programa|mi mentoria|mi servicio|"
    r"mi producto|mi curso|mi oferta|mi avatar|mi nicho|vendo|ofrezco|trabajo con|ayudo a|mi agencia|mi empresa|"
    r"mi consultorio|mi gimnasio|mi tienda|mi academia|mi comunidad|soy (coach|mentor|mentora|nutricionista|entrenador|"
    r"entrenadora|psicologo|psicologa|abogado|abogada|contador|contadora|disenador|disenadora|programador|terapeuta))\b"
)
# Para los nichos de ATV, la frase tiene que mostrar que el cliente le OFRECE a otros algo de esos temas
# ("escalo infoproductores", "tengo una agencia de anuncios"), no que lo está aprendiendo ("tengo que armar el embudo").
_TEMA_ATV = re.compile(
    r"(marketing|ventas|venta|vender|anuncios|ads|trafico|traffick|trafik|embudo|funnel|contenido|reels|redes|infoproduct|"
    r"productos digitales|closer|setter|agencia|escal|negocio digital|negocios online|tienda|ecommerce|dropshipping|"
    r"marca personal|growth|lanzamiento|edicion|community)"
)
_LO_OFRECE = re.compile(
    r"\b(ayudo|ayude|escalo|escalamos|vendo|ofrezco|ensen|aprender|aprendas|mi programa|mi servicio|mi agencia|mi mentoria|"
    r"mi curso|tengo una agencia|gestiono|trabajo con|me dedico|que vende|soy (trafficker|closer|setter|editor|media buyer|growth)|"
    r"(para|a) (coaches|infoproductores|creadores|marcas|emprendedores|expertos|negocios|empresas|clientes|duenos|duenas))\b"
)


def _vende_lo_de_atv(cita: str) -> bool:
    t = _norm(cita)
    return bool(_TEMA_ATV.search(t) and _LO_OFRECE.search(t))


_SISTEMA = (
    "Ubicás el negocio de un cliente de ATV (mentoría para creadores y expertos que venden infoproductos y "
    "servicios) en un nicho. Respondés solo con JSON válido, sin texto antes ni después. No opinás: te basás "
    "en lo que el cliente dijo de su negocio."
)


def _pedido(datos: str) -> str:
    # Sin la lista de subnichos que ya existen: con ella a mano, la IA copiaba el de otro cliente. Juntar los
    # parecidos lo hace el código (unificar_subnicho), dentro del mismo nicho.
    return f"""{REGLA_NICHO}
El subnicho describe el negocio de ESTE cliente con sus palabras; no a ATV ni a lo que aprende en ATV.

Devolvé:
{{"nicho": uno de {json.dumps(NICHOS)} o null,
 "subnicho": "a quién le vende y qué, de 2 a 6 palabras en minúscula" o null,
 "cita": "frase COPIADA letra por letra de lo que dijo el cliente que muestra a qué se dedica (de 3 a 30 palabras)"}}
Si no alcanza para saber a qué se dedica, devolvé nicho null.

Lo que dijo el cliente sobre su negocio:
{datos}"""


def _llamar(sistema: str, pedido: str) -> dict | None:
    from anthropic import Anthropic

    clave = config("ANTHROPIC_API_KEY", default="")
    if not clave:
        return None
    r = Anthropic(api_key=clave, timeout=60).messages.create(
        model=MODELO,
        max_tokens=400,
        thinking={"type": "disabled"},
        system=sistema,
        messages=[{"role": "user", "content": pedido}],
    )
    gasto_ia.registrar("nichos", r.usage)
    return leer_json("".join(b.text for b in r.content if b.type == "text"))


def _evidencia(cliente_id: int, perfil: PerfilCliente) -> list[str]:
    """Lo que el cliente dijo de su negocio, en frases sueltas (es contra lo que se valida la cita)."""
    frases = []
    for campo, etiqueta in (("nicho_texto", "A qué se dedica"), ("que_vende", "Qué vende"), ("objetivo", "Objetivo")):
        valor = getattr(perfil, campo)
        if valor:
            frases.append(f"{etiqueta}: {valor}")
    onb = OnboardingCerebro.get(cliente_id=cliente_id)
    if onb:
        ficha = json.loads(onb.ficha_json or "{}")
        for campo, etiqueta in (("negocio", "Negocio"), ("oferta", "Oferta"), ("nicho_y_diferencial", "Nicho y diferencial"), ("avatar", "A quién le vende"), ("programa", "Programa")):
            if ficha.get(campo):
                frases.append(f"{etiqueta} (onboarding): {ficha[campo][:500]}")
    # Filtrado en Python: con Pony y Python 3.13 los select con lambda no se pueden decompilar.
    canales = [c.id for c in list(Canal.select()) if c.cliente_id == cliente_id and c.tipo == "cliente"]
    if canales:
        lista = ",".join(str(int(c)) for c in canales)
        mensajes = [
            m.texto.strip() for m in MensajeCanal.select_by_sql(
                f'SELECT * FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal IN ({lista}) AND autor_tipo = \'cliente\' AND NOT borrado ORDER BY id'
            ) if (m.texto or "").strip()
        ]
        sobre_negocio = [t for t in mensajes if _DE_SU_NEGOCIO.search(_norm(t))]
        # Si casi no habló de su negocio con esas palabras, los mensajes más largos (ahí se explica).
        if len(sobre_negocio) < 8:
            sobre_negocio += sorted((t for t in mensajes if t not in sobre_negocio), key=len, reverse=True)[: 8 - len(sobre_negocio)]
        frases += [f"Mensaje: {t[:600]}" for t in sobre_negocio[:MAX_MENSAJES]]
    return frases


def _existentes() -> dict[str, list[str]]:
    salida: dict[str, list[str]] = {}
    for nicho, sub in db.select(f'SELECT DISTINCT nicho, subnicho FROM "{DB_SCHEMA}"."cerebro_perfil_cliente" WHERE nicho IS NOT NULL AND subnicho IS NOT NULL'):
        salida.setdefault(nicho, []).append(sub)
    return salida


# El nicho se deduce en código del tema del subnicho (que ya está probado con las palabras del cliente).
# Van primero los temas concretos; marketing y ventas al final, porque casi todos los nombran.
TEMAS = [
    ("finanzas-trading", r"cripto|trading|trader|bolsa|forex|finanz|inversion(es)? (en )?(acciones|bolsa|cripto)|educacion financiera"),
    ("inmobiliaria", r"inmobiliari|bienes raices|propiedad|departament|depa\b|real estate|alquiler"),
    ("nutricion", r"nutri|aliment|dieta|metabol"),
    ("salud", r"hormon|salud|medic|fisio|dolor cronico|enfermedad"),
    ("salud-mental", r"ansiedad|estres|psicolog|terapia|depresion"),
    ("fitness", r"entrenamiento|entrenador|fitness|gym|gimnasio|muscul|grasa|calistenia"),
    ("deportes", r"running|correr|futbol|tenis|padel|deport|atleta"),
    ("idiomas", r"ingles|idioma|frances|portugues|aleman"),
    ("tecnologia-programacion", r"\bia\b|inteligencia artificial|automatiz|software|programa(cion|dor)|desarroll(o|ador) (web|de software)|bots?\b|n8n|saas"),
    ("belleza-estetica", r"estetic|belleza|maquillaj|unas\b|pestan|cabello|peluquer"),
    ("moda", r"\bmoda\b|ropa|indumentaria|estilismo"),
    ("gastronomia", r"cocina|gastronom|reposter|chef|restaurant"),
    ("musica-arte", r"music|canto|guitarra|pintura|arte\b|fotograf"),
    ("relaciones", r"pareja|relaciones|seduccion|citas\b"),
    ("espiritualidad", r"espiritual|energ|meditacion|tarot|astrolog"),
    ("desarrollo-personal", r"mentalidad|identidad|habitos|proposito|autoestima|liderazgo personal|transicion"),
    ("ecommerce", r"ecommerce|e commerce|dropshipping|tienda online|amazon|mercado libre"),
    ("ventas", r"closer|setter|prospecc|cierre de ventas|equipo comercial|ventas high ticket"),
    ("marketing-digital", r"agencia|marketing|funnel|embudo|anuncios|\bads\b|trafico|youtube|contenido|marca personal|growth|community|posicionamiento"),
    ("negocios-online", r"infoproduct|negocio digital|negocios online|escalar"),
]
_TEMAS = [(n, re.compile(rf"(?<![a-z])(?:{patron})")) for n, patron in TEMAS]


def _tema_de(t: str) -> str | None:
    return next((n for n, patron in _TEMAS if patron.search(t)), None)


def nicho_por_tema(sub: str | None) -> str | None:
    """El subnicho dice qué vende y para quién: el nicho sale del QUÉ ("marketing para psicólogos" es
    marketing, no salud mental). Si el qué no alcanza, se mira entero."""
    t = _norm(sub or "")
    if not t:
        return None
    que = re.split(r"\b(?:para|dirigid[oa]s? a)\b", t, maxsplit=1)[0]
    return _tema_de(que) or _tema_de(t)


_DE_ATV = _llave_sub("creadores y expertos que venden infoproductos y servicios mentoria")


def _raices(t: str) -> set[str]:
    return {w[:5] for w in _llave_sub(t)}


def subnicho_probado(sub: str | None, frases: list[str]) -> str | None:
    """El subnicho tiene que salir de lo que dijo el cliente: al menos la mitad de sus palabras (por raíz,
    "infoproductores" ~ "infoproductos") tienen que estar en sus respuestas o mensajes. Y no puede ser la
    descripción de ATV."""
    if not sub or _llave_sub(sub) <= _DE_ATV:
        return None
    raices = _raices(sub)
    dichas = _raices(" ".join(frases))
    return sub if raices and len(raices & dichas) / len(raices) >= 0.5 else None


def decidir(respuesta: dict | None, frases: list[str], existentes: dict[str, list[str]]) -> dict:
    """Lo que propuso la IA, pasado por el código. Devuelve {} si no hay nada que se pueda probar."""
    r = respuesta or {}
    cita = str(r.get("cita") or "").strip().strip('"“”')
    if len(_norm(cita).split()) < 3 or _norm(cita) not in _norm(" ".join(frases)):
        return {}
    sub = subnicho_probado(limpiar_subnicho(r.get("subnicho")), frases)
    # El nicho lo pone el código según el tema del subnicho; el de la IA es el respaldo si el tema no alcanza.
    nicho = nicho_por_tema(sub) or (r.get("nicho") if r.get("nicho") in NICHOS else None)
    if nicho is None:
        return {}
    # Para los nichos de lo que se aprende en ATV hace falta que el cliente muestre que lo vende.
    if nicho in NICHOS_DE_ATV and not (_vende_lo_de_atv(cita) or (sub and _vende_lo_de_atv(sub))):
        return {}
    return {"nicho": nicho, "subnicho": unificar_subnicho(sub, existentes.get(nicho, [])), "cita": cita[:400]}


def revisar(cliente_id: int, llamar=_llamar) -> dict:
    with db_session:
        p = PerfilCliente.get(cliente_id=cliente_id)
        if p is None:
            return {"cliente": cliente_id, "omitido": "sin perfil"}
        frases = _evidencia(cliente_id, p)
        existentes = _existentes()
    if not frases:
        resultado = {}
    else:
        respuesta = llamar(_SISTEMA, _pedido("\n".join(f"- {f}" for f in frases)))
        if respuesta is None:
            return {"cliente": cliente_id, "error": "sin respuesta del modelo"}
        resultado = decidir(respuesta, frases, existentes)
    with db_session:
        p = PerfilCliente.get(cliente_id=cliente_id)
        antes = (p.nicho, p.subnicho)
        if resultado:
            p.nicho, p.subnicho, p.nicho_cita = resultado["nicho"], resultado["subnicho"], resultado["cita"]
        # Sin una frase que lo pruebe, queda como estaba. Revisado aunque no haya alcanzado: no se vuelve a gastar hasta que un lote nuevo proponga otra cosa.
        p.nicho_revisado_en = datetime.utcnow()
        return {"cliente": cliente_id, "antes": antes, "ahora": (p.nicho, p.subnicho), "cita": resultado.get("cita")}


def revisar_pendientes(maximo: int = 10, llamar=_llamar) -> list[dict]:
    with db_session:
        ids = db.select(
            f'SELECT cliente_id FROM "{DB_SCHEMA}"."cerebro_perfil_cliente" WHERE nicho_revisado_en IS NULL ORDER BY actualizado_en DESC LIMIT {int(maximo)}'
        )
    salida = []
    for cid in ids:
        try:
            salida.append(revisar(cid, llamar))
        except Exception:
            logger.exception("Nichos: falló el cliente %s", cid)
            salida.append({"cliente": cid, "error": "excepción"})
    return salida
