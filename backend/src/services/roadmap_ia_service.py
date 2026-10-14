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
from src.services.auth_service import es_equipo
from src.services.sugerencias_service import _describir_voz

logger = logging.getLogger(__name__)

MODELO = config("ROADMAP_MODEL", default="claude-haiku-5-5")
TOPE_TRANSCRIPCION = 60_000  # caracteres (~1 h 30 de llamada); lo que pasa se recorta del medio
ENLACE_ROADMAP = "[ROADMAP]"  # en el mensaje: se reemplaza por el link al roadmap del cliente

_INSTRUCCIONES = """Sos {coach}, coach de ATV, y acabás de salir de una llamada con tu cliente {cliente}.
Con la transcripción armás tres cosas, en tu voz (cómo escribís vos, abajo):

1. LOS PRÓXIMOS PASOS que quedan en el roadmap del cliente. Concretos y accionables, en el orden
   en que se hacen, cada uno de una o dos líneas, en segunda persona hacia el cliente ("Grabá…",
   "Armá…"). Entre 3 y 10. Para cada uno decí quién lo hace: "cliente" o "atv" (algo que hace o
   manda el equipo de ATV, por ejemplo una reunión o una plantilla). Solo lo que se acordó en la
   llamada: no inventes tareas.
2. EL MENSAJE para mandarle por el chat. Es el mensaje previo a que vea los pasos en su roadmap:
   NO repitas los pasos. Breve, con tu tono, sin palabras cliché ni frases de manual. Tiene que
   incluir el link a su roadmap escribiendo exactamente {enlace}. Después, una línea por cada
   entregable que hay que mandarle aparte, con este formato exacto, una por línea:
   "Título del entregable: [LINK]" (por ejemplo "Reunión con Juampi: [LINK]"). Si no hay
   entregables aparte, no pongas esas líneas.
3. PARA EL COACH (no va en el mensaje): los títulos exactos de los entregables que hay que
   adjuntar (para saber qué documento poner en cada [LINK]) y un resumen de la llamada en 3 a 5
   frases, para corroborar que se entendió bien.

También proponé un título corto para el roadmap (el tema que se trabajó, por ejemplo "Ventas" o
"Contenido") y en pocas palabras qué se trabaja con el cliente (por ejemplo "Setting y closing").

Respondé SOLO con un JSON válido, sin texto antes ni después:
{{"titulo": "...", "area": "...", "pasos": [{{"texto": "...", "quien": "cliente"}}],
"mensaje": "...", "entregables": ["..."], "resumen": "..."}}"""


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


def _limpiar(datos: dict) -> dict:
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


def armar_prompt(coach: str, cliente: str, voz: dict, perfil: dict | None, transcripcion: str) -> tuple[str, str]:
    ejemplos = "\n".join(f"- {e[:400]}" for e in (voz.get("ejemplos") or [])[:16]) or "(sin ejemplos todavía)"
    perfil_txt = "; ".join(f"{k}: {v}" for k, v in (perfil or {}).items() if v) or "sin datos todavía"
    sistema = _INSTRUCCIONES.format(coach=coach, cliente=cliente, enlace=ENLACE_ROADMAP)
    usuario = f"""Cómo escribe {coach}: {_describir_voz(voz.get('rasgos') or {})}
Mensajes reales de {coach} (copiá el tono, no el contenido):
{ejemplos}

Lo que sabemos de {cliente}: {perfil_txt}

Transcripción de la llamada:
{_recortar(transcripcion)}"""
    return sistema, usuario


class RoadmapIAServices:
    def generar(self, sesion: dict, cliente_id: int, transcripcion: str | None, llamar=_llamar, llamada_id: int | None = None) -> dict:
        if not es_equipo(sesion):
            raise HTTPException(status_code=403, detail="El roadmap lo arma el equipo de ATV.")
        if llamada_id:
            # La llamada que trajo su Fathom (carpeta Llamadas): la transcripción ya está guardada.
            with db_session:
                ll = Llamada.get(id=llamada_id)
                if ll is None or (sesion.get("rol") != "admin" and ll.admin_id != sesion["usuario_id"]):
                    raise HTTPException(status_code=404, detail="No existe esa llamada.")
                transcripcion = ll.transcripcion or ""
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
        sistema, usuario = armar_prompt(coach, cliente, ap.voz_de(voz_id), perfil, transcripcion)
        try:
            return _limpiar(_json_de(llamar(sistema, usuario)))
        except HTTPException:
            raise
        except Exception:
            logger.exception("No se pudo armar el roadmap con IA")
            raise HTTPException(status_code=502, detail="No se pudo armar el borrador. Probá de nuevo en un minuto.")
