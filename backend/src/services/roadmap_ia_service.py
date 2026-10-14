"""Roadmap desde la llamada: lo que hoy hace Mauri con Poppy, adentro del classroom.

El coach pega la transcripción de la llamada (o la trae de su Fathom) y la IA arma, en la voz de
ese coach:
- los próximos pasos, que quedan escritos en el roadmap del cliente (ya no hace falta un PDF o un
  Doc aparte) y que el cliente y el coach van tildando;
- el mensaje previo para el chat: corto, sin clichés, sin repetir los pasos (los ve en el roadmap),
  con un espacio [LINK] por cada entregable que va aparte;
- los títulos de los entregables y un resumen de la llamada, solo para el coach.
Nada se guarda ni se manda solo: es un borrador que el coach revisa.
"""

import json
import logging
import re

from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.models import Admin, Canal, ClienteExterno, Llamada
from src.services import aprendizaje_service as ap
from src.services import gasto_ia
from src.services import roadmaps_aprendidos as aprendidos
from src.services.auth_service import es_equipo
from src.services.sugerencias_service import _describir_voz

logger = logging.getLogger(__name__)

MODELO = config("ROADMAP_MODEL", default="claude-haiku-5-5")
TOPE_TRANSCRIPCION = 60_000  # caracteres (~1 h 30 de llamada); lo que pasa se recorta del medio
ENLACE_ROADMAP = "[ROADMAP]"  # en el mensaje: se reemplaza por el link al roadmap del cliente

_INSTRUCCIONES = """Sos {coach}, coach de ATV, y acabás de salir de una llamada con tu cliente {cliente}.
Con la transcripción armás tres cosas, en tu voz (cómo escribís vos, abajo):

1. LOS PRÓXIMOS PASOS que quedan en el roadmap del cliente. Concretos y accionables, en el orden
   en que se hacen, cada uno de una o dos líneas. Entre 3 y 10. Solo lo que se acordó en la llamada:
   no inventes tareas. Para cada uno decí quién lo hace:
   - "cliente": lo hace el cliente. En segunda persona y con voseo, como indicación: "Armá el
     Typeform…", "Grabá 4 videos…", "Mandame el borrador…". NUNCA en infinitivo ("Armar…",
     "Crear…", "Grabar…") ni en tercera persona ("Ana arma…").
   - "atv": lo hace o lo manda el equipo de ATV (vos u otro coach): una reunión, una plantilla, una
     revisión, un seguimiento. En primera persona desde vos ("Te paso…", "Te hago seguimiento…",
     "Te agendo una reunión con Nick…"), NUNCA como orden al cliente ni en infinitivo
     ("Hacer seguimiento…", "Recibir de Franco…").
2. EL MENSAJE para mandarle por el chat. Es el mensaje previo a que vea los pasos en su roadmap:
   NO repitas los pasos. Breve, con tu tono, sin palabras cliché ni frases de manual. Tiene que
   incluir el link a su roadmap escribiendo exactamente {enlace}. Después, una línea por cada
   entregable que hay que mandarle aparte, con este formato exacto, una por línea:
   "Título del entregable: [LINK]" (por ejemplo "Reunión con Juampi: [LINK]"). Un entregable es
   SOLO algo que ATV le manda o le comparte (plantilla, documento, guion, grabación, link de una
   reunión); nunca algo que tiene que hacer o mandar el cliente, ni la grabación de esta llamada
   (ya la ve en su roadmap). Si no hay, no pongas esas líneas.
3. PARA EL COACH (no va en el mensaje): los títulos exactos de los entregables que hay que
   adjuntar (para saber qué documento poner en cada [LINK]) y un resumen de la llamada en 3 a 5
   frases, para corroborar que se entendió bien.

También proponé un título corto para el roadmap (el tema que se trabajó, por ejemplo "Ventas" o
"Contenido") y en pocas palabras qué se trabaja con el cliente (por ejemplo "Setting y closing").

Respondé SOLO con un JSON válido, sin texto antes ni después:
{{"titulo": "...", "area": "...", "pasos": [{{"texto": "...", "quien": "cliente"}}],
"mensaje": "...", "entregables": ["..."], "resumen": "..."{seguimiento}}}"""

_SEGUIMIENTO = """

4. SEGUIMIENTO DEL ROADMAP ANTERIOR (más abajo están sus pasos): para cada uno, según lo que se
   dijo en ESTA llamada, si se hizo ("hecho"), a medias ("parcial"), no se hizo ("no_hecho") o no se
   habló ("no_se_hablo"), y el resultado concreto que contó el cliente (números, hechos), con sus
   palabras. Si no contó un resultado, dejalo vacío: no lo inventes. No vuelvas a proponer pasos que
   ya están hechos."""


def _recortar(texto: str) -> str:
    texto = (texto or "").strip()
    if len(texto) <= TOPE_TRANSCRIPCION:
        return texto
    mitad = TOPE_TRANSCRIPCION // 2
    return texto[:mitad] + "\n[…se recortó el medio de la llamada…]\n" + texto[-mitad:]


def _json_de(texto: str) -> dict:
    m = re.search(r"\{.*\}", texto or "", re.S)
    if not m:
        raise ValueError("sin JSON")
    return json.loads(m.group(0))


def _seguimiento(datos: dict, anterior: dict | None) -> dict | None:
    if not anterior:
        return None
    por_id = {p["id"]: p for p in anterior["pasos"]}
    pasos = []
    for x in datos.get("seguimiento") or []:
        p = por_id.get(x.get("id")) if isinstance(x, dict) else None
        if p is None:
            continue
        estado = x.get("estado") if x.get("estado") in aprendidos.ESTADOS else "no_se_hablo"
        pasos.append({"id": p["id"], "paso": p["texto"], "tildado": bool(p.get("hecho")), "estado": estado, "resultado": " ".join(str(x.get("resultado") or "").split())[:300]})
    return {"doc_id": anterior["doc_id"], "titulo": anterior["titulo"], "fecha": anterior["fecha"], "pasos": pasos}


def _limpiar(datos: dict, anterior: dict | None = None) -> dict:
    """Lo que vuelve del modelo, acotado a lo que el formulario espera."""
    pasos = []
    for p in datos.get("pasos") or []:
        texto = " ".join(str((p or {}).get("texto") or "").split())[:400]
        if texto:
            pasos.append({"texto": texto, "quien": "atv" if (p or {}).get("quien") == "atv" else "cliente"})
    mensaje = str(datos.get("mensaje") or "").strip()
    if ENLACE_ROADMAP not in mensaje:
        mensaje = (mensaje + f"\n\nTus próximos pasos: {ENLACE_ROADMAP}").strip()
    entregables = [" ".join(str(e).split())[:120] for e in (datos.get("entregables") or []) if str(e).strip()][:10]
    # Las líneas "Entregable: [LINK]" las pone el código: el modelo a veces las nombra y no las escribe.
    faltan = [e for e in entregables if f"{e}: [LINK]".lower() not in mensaje.lower()]
    if faltan and "[LINK]" not in mensaje:
        mensaje += "\n\n" + "\n".join(f"{e}: [LINK]" for e in faltan)
    return {
        "titulo": " ".join(str(datos.get("titulo") or "").split())[:80] or "Próximos pasos",
        "area": " ".join(str(datos.get("area") or "").split())[:60] or None,
        "pasos": pasos[:15],
        "mensaje": mensaje[:3000],
        "entregables": entregables,
        "resumen": str(datos.get("resumen") or "").strip()[:1500],
        "seguimiento": _seguimiento(datos, anterior),
    }


def _llamar(sistema: str, usuario: str) -> str:
    from anthropic import Anthropic

    cliente = Anthropic(api_key=config("ANTHROPIC_API_KEY", default=""), timeout=90)
    r = cliente.messages.create(
        model=MODELO,
        max_tokens=1800,
        thinking={"type": "disabled"},
        system=sistema,
        messages=[{"role": "user", "content": usuario}],
    )
    try:
        gasto_ia.registrar("roadmap", r.usage)
    except Exception:  # el registro nunca corta el borrador
        pass
    return "".join(b.text for b in r.content if getattr(b, "type", "") == "text")


_INFINITIVO = re.compile(r"^\W*([A-Za-zÁÉÍÓÚáéíóúñÑ]+?)(ar|er|ir|ár|ér|ír)(me|te|se|nos|le|les|lo|la|los|las|selo|sela|melo|mela)?\b", re.I)


def _en_infinitivo(texto: str) -> bool:
    """El paso arranca con un verbo en infinitivo ("Armar…", "Hacer seguimiento…")."""
    m = _INFINITIVO.match(texto or "")
    return bool(m) and len(m.group(1)) >= 1


_REESCRIBIR = """Reescribí estos pasos de un roadmap sin cambiar su contenido:
- quien "cliente": segunda persona con voseo, como indicación al cliente ("Armá…", "Grabá…", "Mandame…").
- quien "atv": primera persona de {coach}, que es quien lo hace ("Te paso…", "Te hago seguimiento…", "Revisamos juntos…").
Respondé SOLO un JSON: una lista con un texto por paso, en el mismo orden."""


def _corregir_persona(borrador: dict, coach: str, llamar) -> dict:
    """Haiku a veces escribe los pasos en infinitivo aunque se le pida otra cosa: lo decide el código.
    Si hay pasos en infinitivo, se le pide reescribir solo esos y se acepta lo que ya no lo esté."""
    malos = [i for i, p in enumerate(borrador["pasos"]) if _en_infinitivo(p["texto"])]
    if not malos:
        return borrador
    pedido = [{"quien": borrador["pasos"][i]["quien"], "texto": borrador["pasos"][i]["texto"]} for i in malos]
    try:
        texto = llamar(_REESCRIBIR.format(coach=coach), json.dumps(pedido, ensure_ascii=False))
        m = re.search(r"\[.*\]", texto or "", re.S)
        nuevos = json.loads(m.group(0)) if m else []
    except Exception:
        return borrador
    for i, nuevo in zip(malos, nuevos):
        nuevo = " ".join(str(nuevo.get("texto") if isinstance(nuevo, dict) else nuevo).split())[:400]
        if nuevo and not _en_infinitivo(nuevo):
            borrador["pasos"][i]["texto"] = nuevo
    return borrador


def armar_prompt(coach: str, cliente: str, voz: dict, perfil: dict | None, transcripcion: str, aprendido: str = "", anterior: dict | None = None) -> tuple[str, str]:
    ejemplos = "\n".join(f"- {e[:400]}" for e in (voz.get("ejemplos") or [])[:16]) or "(sin ejemplos todavía)"
    perfil_txt = "; ".join(f"{k}: {v}" for k, v in (perfil or {}).items() if v) or "sin datos todavía"
    sistema = _INSTRUCCIONES.format(
        coach=coach, cliente=cliente, enlace=ENLACE_ROADMAP,
        seguimiento=', "seguimiento": [{"id": 1, "estado": "hecho", "resultado": "..."}]' if anterior else "",
    ) + (_SEGUIMIENTO if anterior else "")
    previo = ""
    if anterior:
        lineas = "\n".join(f"  {p['id']}. {p['texto']}" + (" [el cliente lo tildó como hecho]" if p.get("hecho") else "") for p in anterior["pasos"])
        previo = f"\n\nRoadmap anterior de {cliente} ({anterior['titulo']}, {anterior['fecha']}):\n{lineas}"
    usuario = f"""Cómo escribe {coach}: {_describir_voz(voz.get('rasgos') or {})}
Mensajes reales de {coach} (copiá el tono, no el contenido):
{ejemplos}
{(chr(10) + "Lo que aprendimos de los roadmaps anteriores:" + chr(10) + aprendido + chr(10)) if aprendido else ""}
Lo que sabemos de {cliente}: {perfil_txt}{previo}

Transcripción de la llamada:
{_recortar(transcripcion)}"""
    return sistema, usuario


class RoadmapIAServices:
    def generar(self, sesion: dict, cliente_id: int, transcripcion: str | None, llamar=_llamar, llamada_id: int | None = None, fathom_url: str | None = None) -> dict:
        if not es_equipo(sesion):
            raise HTTPException(status_code=403, detail="El roadmap lo arma el equipo de ATV.")
        if llamada_id:
            # La llamada que trajo su Fathom (carpeta Llamadas): la transcripción ya está guardada.
            with db_session:
                ll = Llamada.get(id=llamada_id)
                if ll is None or (sesion.get("rol") != "admin" and ll.admin_id != sesion["usuario_id"]):
                    raise HTTPException(status_code=404, detail="No existe esa llamada.")
                transcripcion = ll.transcripcion or ""
                fathom_url = fathom_url or ll.share_url or ll.url
        if len((transcripcion or "").strip()) < 200:
            raise HTTPException(status_code=422, detail="Pegá la transcripción completa de la llamada.")
        with db_session:
            c = ClienteExterno.get(id=cliente_id)
            if c is None:
                raise HTTPException(status_code=404, detail="No existe ese cliente.")
            cliente = (c.nombre or c.email or "el cliente").split()[0]
            yo = Admin.get(id=sesion["usuario_id"])
            # La misma voz que usa el Tab: la propia, o la que el coach eligió en Mi cuenta.
            voz_admin = Admin.get(id=yo.voz_tab) if yo and yo.voz_tab else None
            voz_admin = voz_admin if voz_admin and voz_admin.activo else yo
            coach = ((voz_admin.nombre if voz_admin else None) or "el coach").split()[0]
            voz_id = voz_admin.id if voz_admin else sesion["usuario_id"]
            canal = Canal.get(cliente_id=cliente_id)
        perfil = ap.perfil_de(cliente_id)["perfil"] if canal else None
        # Lo aprendido de los roadmaps anteriores: correcciones de este coach, sus roadmaps finales y
        # qué pasos dieron resultado con clientes parecidos. Y el roadmap anterior de este cliente.
        aprendido = aprendidos.texto_para_prompt(aprendidos.contexto(sesion["usuario_id"], cliente_id, (perfil or {}).get("nicho")), coach)
        anterior = aprendidos.anterior_del_cliente(cliente_id)
        sistema, usuario = armar_prompt(coach, cliente, ap.voz_de(voz_id), perfil, transcripcion, aprendido, anterior)
        try:
            borrador = _corregir_persona(_limpiar(_json_de(llamar(sistema, usuario)), anterior), coach, llamar)
        except HTTPException:
            raise
        except Exception:
            logger.exception("No se pudo armar el roadmap con IA")
            raise HTTPException(status_code=502, detail="No se pudo armar el borrador. Probá de nuevo en un minuto.")
        borrador["borrador_id"] = aprendidos.registrar_borrador(cliente_id, sesion["usuario_id"], voz_id, borrador, transcripcion, fathom_url)
        return borrador
