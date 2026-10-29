"""Registro de errores del navegador: cada pantalla en blanco o error que llega desde el classroom."""

import time
from collections import defaultdict, deque

from pony.orm import db_session

from src.models import ErrorFront
from src.services.auth_service import es_equipo

_POR_IP = defaultdict(deque)
_TOPE_MINUTO = 20  # nadie manda más de esto por minuto (un error en bucle no llena la tabla)


def _corto(texto, n: int) -> str | None:
    t = (texto or "").strip()
    return t[:n] if t else None


def registrar(datos: dict, sesion: dict | None, ip: str, agente: str) -> bool:
    ahora = time.time()
    cola = _POR_IP[ip]
    while cola and ahora - cola[0] > 60:
        cola.popleft()
    if len(cola) >= _TOPE_MINUTO:
        return False
    cola.append(ahora)
    usuario = None
    if sesion:
        if sesion.get("miembro_id"):
            usuario = f"miembro:{sesion['miembro_id']}"
        else:
            usuario = f"{'equipo' if es_equipo(sesion) else 'cliente'}:{sesion.get('usuario_id')}"
    with db_session:
        ErrorFront(
            tipo=_corto(datos.get("tipo"), 30) or "error",
            mensaje=_corto(datos.get("mensaje"), 1000) or "(sin mensaje)",
            pila=_corto(datos.get("pila"), 6000),
            ruta=_corto(datos.get("ruta"), 300),
            desde=_corto(datos.get("desde"), 300),
            version=_corto(datos.get("version"), 40),
            agente=_corto(agente, 400),
            usuario=usuario,
        )
    return True
