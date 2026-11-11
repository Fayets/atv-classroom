"""Cuello de botella pedido desde Leverage (rutas /api/agentes/cuellos): un agente pega el Loom de un cliente y el
classroom hace lo mismo que la carpeta "Cuellos de botella": Jeremy arma el borrador y el cerebro su versión en
silencio. Juan lo corrige y lo aprueba en el classroom como siempre, y de ahí salen las lecciones.
"""

from fastapi import HTTPException

from src.services.agentes_service import _SQL_EQUIPO, _filas, _lectura, persona_de
from src.services.cuellos_service import CuellosServices

_SQL_CLIENTES = 'SELECT id, nombre, email FROM clients.clientes'


def cliente_de(clientes: list[dict], quien: str) -> dict:
    """El cliente por id, mail o nombre (completo o una parte, si hay uno solo)."""
    q = (quien or "").strip().lower()
    if q.isdigit():
        hallado = [c for c in clientes if c["id"] == int(q)]
    else:
        hallado = [c for c in clientes if q in {(c.get("email") or "").lower(), (c.get("nombre") or "").lower()}]
        if not hallado:
            hallado = [c for c in clientes if q and q in (c.get("nombre") or "").lower()]
    if not hallado:
        raise HTTPException(status_code=404, detail=f"No encontré ningún cliente «{quien}».")
    if len(hallado) > 1:
        raise HTTPException(status_code=409, detail="Hay más de un cliente así: " + ", ".join(f"{c['nombre']} ({c['email']})" for c in hallado[:8]))
    return hallado[0]


def resumen_para_agente(d: dict) -> dict:
    """Lo que necesita el agente: en qué está y, cuando volvió, el borrador. La versión del cerebro no sale."""
    listo = d.get("estado") in ("borrador", "aprobado")
    return {
        "id": d.get("id"),
        "cliente": d.get("cliente"),
        "estado": d.get("estado"),
        "error": d.get("error"),
        "borrador": (d.get("version_final") or d.get("version_jeremy")) if listo else None,
        "doc_url": d.get("doc_url"),
        "donde_se_aprueba": "En el classroom, carpeta Cuellos de botella: Juan lo corrige y lo aprueba ahí.",
    }


def pedir(agente: dict, cliente: str, loom: str | None, texto: str | None, contexto: str | None, pedido_por: str, en_fondo=None) -> dict:
    with _lectura() as cur:
        clientes = _filas(cur, _SQL_CLIENTES)
        equipo = _filas(cur, _SQL_EQUIPO)
    c = cliente_de(clientes, cliente)
    persona = persona_de(equipo, pedido_por)
    extra = {"en_fondo": en_fondo} if en_fondo else {}
    d = CuellosServices().pedir({"usuario_id": persona["id"], "rol": "admin"}, c["id"], loom, texto, contexto, **extra)
    return resumen_para_agente(d)


def ver(agente: dict, diag_id: int) -> dict:
    return resumen_para_agente(CuellosServices().detalle(diag_id))
