"""La sección Tools: herramientas con IA que se incluyen en un plan o se venden aparte (pedido de Franco del
01-11-2026). Toda la sección se prende y se apaga desde el admin; arranca oculta. Cada tool tiene un estado por
plan: "incluida" (la usa), "paga" (la ve con candado y se la vendemos) u "oculta" (no aparece).

No hay tablas nuevas: todo vive en permisos_plan. El plan "*" guarda lo que es de toda la sección (si se ve y el
precio de cada tool); el resto son filas (plan, "tool:<id>", estado)."""

from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.models import PermisoPlan
from src.services.video_acceso import PLANES_VIDEO, clave_de_plan

# Las tools, en el orden en que se muestran. Cada una tiene su dibujo en la portada (DibujosTools.jsx, por id);
# "nuevo" le pone la etiqueta roja.
TOOLS = [
    {"id": "juan-ai", "nombre": "Juan AI", "tono": "roja", "duracion": "Chat",
     "descripcion": "Preguntale lo que sea de tu negocio. Responde como Juan y te lleva a la clase o al SOP."},
    {"id": "bottleneck", "nombre": "Bottleneck analysis", "tono": "negra", "duracion": "5–10 min", "nuevo": True,
     "descripcion": "Mandá un Loom con tu traba y recibí diagnóstico, causas y un roadmap con plazos."},
    {"id": "audiencia", "nombre": "Analizador de audiencia", "tono": "crema", "duracion": "3 min",
     "descripcion": "Lee tus comentarios y DMs y te dice qué dolor repite tu audiencia."},
    {"id": "competencia", "nombre": "Analizador de competencia", "tono": "blanca", "duracion": "5 min",
     "descripcion": "Pasale tres cuentas y te arma qué venden, a qué precio y con qué ángulo."},
    {"id": "crm", "nombre": "CRM", "tono": "crema", "duracion": "Leads y llamadas",
     "descripcion": "Tus leads en un solo lugar: de qué conversación vienen, en qué etapa están y cuándo hacerles seguimiento."},
]
_IDS = {t["id"] for t in TOOLS}

# El proyecto de agentes (otro repo, otro dominio). Una tool incluida se abre allá solo si su id está en
# TOOLS_ACTIVAS; las demás siguen diciendo "Muy pronto".
TOOLS_URL = config("TOOLS_URL", default="").rstrip("/")
TOOLS_ACTIVAS = {x.strip() for x in config("TOOLS_ACTIVAS", default="").split(",") if x.strip()}
TOOLS_PASE_SECRET = config("TOOLS_PASE_SECRET", default="")


def abrible(tool_id: str) -> bool:
    return bool(TOOLS_URL and TOOLS_PASE_SECRET and tool_id in TOOLS_ACTIVAS)
ESTADOS = ["incluida", "paga", "oculta"]
_TODOS = "*"


def _filas() -> dict:
    with db_session:
        return {(f.plan, f.clave): f.valor for f in list(PermisoPlan.select())}


def _estado(filas: dict, plan: str, tool_id: str) -> str:
    # Sin nada guardado, la tool se ofrece: la ve con candado.
    return filas.get((plan, f"tool:{tool_id}")) or "paga"


def visible(filas: dict | None = None) -> bool:
    filas = _filas() if filas is None else filas
    return filas.get((_TODOS, "tools")) == "si"


def para_cliente(plan: str | None) -> dict:
    """Lo que ve un cliente en Tools. Con la sección apagada no ve nada."""
    from src.services.auth_service import contacto_pausa

    filas = _filas()
    if not visible(filas):
        raise HTTPException(status_code=404, detail="Esta sección no está disponible.")
    clave = clave_de_plan(plan)
    tools = []
    for t in TOOLS:
        est = _estado(filas, clave, t["id"])
        if est != "oculta":
            tools.append({**t, "estado": est, "precio": filas.get((_TODOS, f"tool_precio:{t['id']}")) or None,
                          "abrir": est == "incluida" and abrible(t["id"])})
    # Las tools se las vende Juampi (Franco, 01-11-2026).
    return {"tools": tools, "contacto": contacto_pausa("boost")}


def para_equipo() -> dict:
    """El equipo de ATV ve todas las tools como incluidas, para probarlas aunque la sección esté apagada."""
    filas = _filas()
    return {"tools": [{**t, "estado": "incluida", "precio": filas.get((_TODOS, f"tool_precio:{t['id']}")) or None,
                       "abrir": abrible(t["id"])} for t in TOOLS],
            "contacto": None, "visible": visible(filas)}


def matriz() -> dict:
    filas = _filas()
    planes = [p["id"] for p in PLANES_VIDEO]
    return {
        "visible": visible(filas),
        "planes": PLANES_VIDEO,
        "estados": ESTADOS,
        "tools": [
            {**t, "precio": filas.get((_TODOS, f"tool_precio:{t['id']}")) or "",
             "por_plan": {p: _estado(filas, p, t["id"]) for p in planes}}
            for t in TOOLS
        ],
    }


def _poner(plan: str, clave: str, valor: str) -> None:
    fila = PermisoPlan.get(plan=plan, clave=clave)
    if fila:
        fila.valor = valor
    else:
        PermisoPlan(plan=plan, clave=clave, valor=valor)


def guardar(visible_: bool | None, cambios: list[dict], precios: dict[str, str]) -> dict:
    """cambios: [{"plan", "tool", "estado"}]; precios: {tool_id: "USD 97/mes"}."""
    planes = {p["id"] for p in PLANES_VIDEO}
    for c in cambios:
        if c.get("plan") not in planes or c.get("tool") not in _IDS or c.get("estado") not in ESTADOS:
            raise HTTPException(status_code=422, detail=f"Cambio inválido: {c.get('plan')} · {c.get('tool')} · {c.get('estado')}.")
    for tool_id in precios:
        if tool_id not in _IDS:
            raise HTTPException(status_code=422, detail=f"No existe la tool {tool_id}.")
    with db_session:
        if visible_ is not None:
            _poner(_TODOS, "tools", "si" if visible_ else "no")
        for c in cambios:
            _poner(c["plan"], f"tool:{c['tool']}", c["estado"])
        for tool_id, precio in precios.items():
            _poner(_TODOS, f"tool_precio:{tool_id}", (precio or "").strip()[:40])
    return matriz()


def tiene(cliente_plan: str | None, tool_id: str) -> bool:
    """Si el plan tiene la tool incluida y la sección está prendida."""
    filas = _filas()
    return visible(filas) and _estado(filas, clave_de_plan(cliente_plan), tool_id) == "incluida"


def pase(sesion: dict, tool_id: str) -> dict:
    """La dirección para abrir la tool en el proyecto de agentes, con el pase firmado."""
    from src.services.auth_service import es_equipo
    from src.services.tools_pase import firmar

    if tool_id not in _IDS:
        raise HTTPException(status_code=404, detail="No existe esa tool.")
    if not abrible(tool_id):
        raise HTTPException(status_code=409, detail="Esta tool todavía no está disponible.")
    equipo = es_equipo(sesion)
    if not equipo:
        estado = acceso(sesion["usuario_id"], tool_id)
        if not estado["acceso"]:
            detalle = "Esta tool no está incluida en tu plan." if estado["motivo"] == "plan" else "Tu cuenta no tiene acceso en este momento."
            raise HTTPException(status_code=403, detail=detalle)
    datos = {
        "tool": tool_id,
        "tipo": "equipo" if equipo else "cliente",
        # La cuenta es la del cliente; si entra alguien de su equipo, va también quién es.
        "cliente_id": None if equipo else sesion["usuario_id"],
        "miembro_id": sesion.get("miembro_id"),
        "admin_id": sesion["usuario_id"] if equipo else None,
        "nombre": sesion.get("nombre"),
        "plan": None if equipo else clave_de_plan(sesion.get("rol")),
    }
    return {"url": f"{TOOLS_URL}/{tool_id}?pase={firmar(datos, TOOLS_PASE_SECRET)}"}


def acceso(cliente_id: int, tool_id: str) -> dict:
    """Para el proyecto de agentes: si el cliente sigue teniendo la tool (plan, sección prendida, vigencia, pausa)."""
    from src.models import Canal, ClienteExterno
    from src.services.auth_service import _tiene_acceso

    with db_session:
        c = ClienteExterno.get(id=cliente_id)
        if c is None:
            return {"acceso": False, "motivo": "no_existe"}
        if not _tiene_acceso(c):
            return {"acceso": False, "motivo": "vencido"}
        canal = Canal.get(cliente_id=cliente_id)
        if canal is not None and (canal.pausa or canal.inactivo):
            return {"acceso": False, "motivo": "inactivo" if canal.inactivo else "pausa"}
        plan = c.plan_actual
    if not tiene(plan, tool_id):
        return {"acceso": False, "motivo": "plan"}
    return {"acceso": True, "plan": clave_de_plan(plan)}
