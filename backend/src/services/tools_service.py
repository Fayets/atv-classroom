"""La sección Tools: herramientas con IA que se incluyen en un plan o se venden aparte (pedido de Franco del
01-11-2026). Toda la sección se prende y se apaga desde el admin; arranca oculta. Cada tool tiene un estado por
plan: "incluida" (la usa), "paga" (la ve con candado y se la vendemos) u "oculta" (no aparece).

No hay tablas nuevas: todo vive en permisos_plan. El plan "*" guarda lo que es de toda la sección (si se ve y el
precio de cada tool); el resto son filas (plan, "tool:<id>", estado)."""

from fastapi import HTTPException
from pony.orm import db_session

from src.models import PermisoPlan
from src.services.video_acceso import PLANES_VIDEO, clave_de_plan

# Las tools, en el orden en que se muestran. "tono" es la tapa (las mismas de los SOPs).
TOOLS = [
    {"id": "juan-ai", "nombre": "Juan AI", "tono": "roja", "duracion": "Chat",
     "descripcion": "Preguntale lo que sea de tu negocio. Responde como Juan y te lleva a la clase o al SOP."},
    {"id": "bottleneck", "nombre": "Bottleneck analysis", "tono": "negra", "duracion": "5–10 min",
     "descripcion": "Mandá un Loom con tu traba y recibí diagnóstico, causas y un roadmap con plazos."},
    {"id": "audiencia", "nombre": "Analizador de audiencia", "tono": "crema", "duracion": "3 min",
     "descripcion": "Lee tus comentarios y DMs y te dice qué dolor repite tu audiencia."},
    {"id": "competencia", "nombre": "Analizador de competencia", "tono": "blanca", "duracion": "5 min",
     "descripcion": "Pasale tres cuentas y te arma qué venden, a qué precio y con qué ángulo."},
]
_IDS = {t["id"] for t in TOOLS}
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
            tools.append({**t, "estado": est, "precio": filas.get((_TODOS, f"tool_precio:{t['id']}")) or None})
    # Las tools se las vende Juampi (Franco, 01-11-2026).
    return {"tools": tools, "contacto": contacto_pausa("boost")}


def para_equipo() -> dict:
    """El equipo de ATV ve todas las tools como incluidas, para probarlas aunque la sección esté apagada."""
    filas = _filas()
    return {"tools": [{**t, "estado": "incluida", "precio": filas.get((_TODOS, f"tool_precio:{t['id']}")) or None} for t in TOOLS],
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
