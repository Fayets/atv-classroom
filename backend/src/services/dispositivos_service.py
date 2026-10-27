"""Dispositivos de cada cuenta: desde qué equipo y ciudad se usa cada sesión, para ver si comparten la cuenta.

Se anota al usar la app (como mucho una vez cada 5 minutos por sesión), no en el login: así cubre también
las sesiones que ya estaban abiertas. La ciudad sale de la IP con un servicio gratuito y se guarda solo
la ciudad y el país, nunca la IP. La alerta la decide el código, sin IA."""

import ipaddress
import logging
import re
import threading
import time
from datetime import datetime, timedelta

import httpx
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db

logger = logging.getLogger(__name__)
CADA_S = 300
DIAS_REVISAR = 7
MIN_DISPOSITIVOS = 4
MIN_CIUDADES = 3
_ultimo: dict[str, float] = {}
_geo: dict[str, tuple[str | None, str | None]] = {}
T = f'"{DB_SCHEMA}"."sesiones"'


def describir(ua: str | None) -> tuple[str, str]:
    """('iPhone', 'Safari'), ('Mac', 'Chrome')…: lo que el equipo reconoce de un vistazo."""
    ua = ua or ""
    if "iPhone" in ua: equipo = "iPhone"
    elif "iPad" in ua: equipo = "iPad"
    elif "Android" in ua: equipo = "Android"
    elif "Macintosh" in ua or "Mac OS X" in ua: equipo = "Mac"
    elif "Windows" in ua: equipo = "Windows"
    elif "Linux" in ua: equipo = "Linux"
    else: equipo = "Otro"
    if "Edg/" in ua: nav = "Edge"
    elif "OPR/" in ua: nav = "Opera"
    elif "CriOS" in ua or "Chrome/" in ua: nav = "Chrome"
    elif "FxiOS" in ua or "Firefox/" in ua: nav = "Firefox"
    elif "Safari/" in ua or equipo in ("iPhone", "iPad"): nav = "Safari"
    else: nav = "Navegador"
    return equipo, nav


def _ip(request) -> str | None:
    for h in ("x-real-ip", "x-forwarded-for"):
        v = request.headers.get(h)
        if v:
            return v.split(",")[0].strip()
    return request.client.host if request.client else None


def _ubicar(ip: str | None) -> tuple[str | None, str | None]:
    if not ip:
        return None, None
    try:
        if not ipaddress.ip_address(ip).is_global:
            return None, None
    except ValueError:
        return None, None
    if ip in _geo:
        return _geo[ip]
    try:
        r = httpx.get(f"https://ipapi.co/{ip}/json/", timeout=4, headers={"User-Agent": "atv-classroom"})
        d = r.json() if r.status_code == 200 else {}
        res = (d.get("city") or None, d.get("country_code") or None)
    except Exception:
        res = (None, None)
    _geo[ip] = res
    return res


def registrar(token_hash: str, request) -> None:
    """Llamado en cada pedido autenticado; trabaja de verdad cada CADA_S por sesión y en segundo plano."""
    ahora = time.time()
    if ahora - _ultimo.get(token_hash, 0) < CADA_S:
        return
    _ultimo[token_hash] = ahora
    ua = (request.headers.get("user-agent") or "")[:400]
    ip = _ip(request)

    def anotar():
        try:
            ciudad, pais = _ubicar(ip)
            with db_session:
                db.execute(
                    f"UPDATE {T} SET ultima_actividad = $ahora, user_agent = $ua, "
                    "ciudad = coalesce($ciudad, ciudad), pais = coalesce($pais, pais) WHERE token_hash = $h",
                    {"ahora": datetime.utcnow(), "ua": ua, "ciudad": ciudad, "pais": pais, "h": token_hash},
                )
        except Exception:
            logger.exception("Dispositivos: no se pudo anotar la sesión")

    threading.Thread(target=anotar, daemon=True).start()


def _iso(d):
    return d.isoformat(timespec="seconds") + "Z" if d else None


def _fila(r, actual_hash=None, nombres=None) -> dict:
    sid, th, ua, ciudad, pais, ult, creado, miembro = r
    equipo, nav = describir(ua)
    return {
        "id": sid, "equipo": equipo, "navegador": nav, "ciudad": ciudad, "pais": pais,
        "ultima": _iso(ult or creado), "desde": _iso(creado), "actual": th == actual_hash,
        "quien": (nombres or {}).get(miembro) if miembro else None, "miembro_id": miembro,
    }


_COLS = "id, token_hash, user_agent, ciudad, pais, ultima_actividad, creado_en, miembro_id"


def mios(sesion: dict, actual_hash: str) -> list[dict]:
    """Las sesiones abiertas de esta persona (el titular ve las suyas; cada integrante del equipo, las suyas)."""
    tipo = "cliente" if sesion.get("tipo") == "cliente" else "admin"
    with db_session:
        filas = db.select(
            f"SELECT {_COLS} FROM {T} WHERE tipo = $tipo AND usuario_id = $u AND expira_en > now() "
            "AND coalesce(miembro_id, 0) = $m ORDER BY coalesce(ultima_actividad, creado_en) DESC",
            {"tipo": tipo, "u": sesion["usuario_id"], "m": sesion.get("miembro_id") or 0},
        )
    return [_fila(r, actual_hash) for r in filas]


def cerrar_mio(sesion: dict, sesion_id: int) -> None:
    tipo = "cliente" if sesion.get("tipo") == "cliente" else "admin"
    with db_session:
        fila = db.select(f"SELECT token_hash FROM {T} WHERE id = $i AND tipo = $tipo AND usuario_id = $u AND coalesce(miembro_id, 0) = $m",
                         {"i": sesion_id, "tipo": tipo, "u": sesion["usuario_id"], "m": sesion.get("miembro_id") or 0})
        if not fila:
            raise HTTPException(status_code=404, detail="Esa sesión no existe.")
    _cerrar(sesion_id, fila[0])


def _cerrar(sesion_id: int, token_hash: str) -> None:
    from src.services import auth_service

    with db_session:
        db.execute(f"DELETE FROM {T} WHERE id = $i", {"i": sesion_id})
    # Fuera de la memoria también: si no, el token seguiría andando hasta reiniciar el servidor.
    for token in [t for t in list(auth_service._sessions) if auth_service._hash_token(t) == token_hash]:
        auth_service._sessions.pop(token, None)


def de_cliente(cliente_id: int) -> dict:
    """Para el equipo: todas las sesiones del cliente y de su equipo, con la alerta."""
    with db_session:
        filas = db.select(f"SELECT {_COLS} FROM {T} WHERE tipo = 'cliente' AND usuario_id = $c AND expira_en > now() "
                          "ORDER BY coalesce(ultima_actividad, creado_en) DESC", {"c": cliente_id})
        nombres = {m: n for m, n in db.select('SELECT id, nombre FROM "%s"."miembros_cliente" WHERE cliente_id = $c' % DB_SCHEMA, {"c": cliente_id})}
    lista = [_fila(r, None, nombres) for r in filas]
    return {"dispositivos": lista, **_alerta(lista)}


def _alerta(lista: list[dict]) -> dict:
    desde = (datetime.utcnow() - timedelta(days=DIAS_REVISAR)).isoformat()
    recientes = [d for d in lista if not d["miembro_id"] and (d["ultima"] or "") >= desde]
    disp = len({(d["equipo"], d["navegador"]) for d in recientes})
    ciudades = len({d["ciudad"] for d in recientes if d["ciudad"]})
    nivel = "alta" if disp >= MIN_DISPOSITIVOS and ciudades >= MIN_CIUDADES else "media" if disp >= MIN_DISPOSITIVOS or ciudades >= MIN_CIUDADES else None
    return {"alerta": nivel, "dispositivos_7d": disp, "ciudades_7d": ciudades}


def alertas_por_cliente() -> dict[int, str]:
    """{cliente_id: 'alta'|'media'} de los que hay que revisar (para la carpeta Clientes)."""
    with db_session:
        filas = db.select(f"SELECT usuario_id, {_COLS} FROM {T} WHERE tipo = 'cliente' AND expira_en > now() AND miembro_id IS NULL "
                          "AND coalesce(ultima_actividad, creado_en) > now() - interval '%d days'" % DIAS_REVISAR)
    por: dict[int, list] = {}
    for r in filas:
        por.setdefault(r[0], []).append(_fila(r[1:]))
    return {c: a["alerta"] for c, l in por.items() if (a := _alerta(l))["alerta"]}


def cerrar_de_cliente(sesion_id: int) -> None:
    with db_session:
        fila = db.select(f"SELECT token_hash FROM {T} WHERE id = $i AND tipo = 'cliente'", {"i": sesion_id})
    if not fila:
        raise HTTPException(status_code=404, detail="Esa sesión no existe.")
    _cerrar(sesion_id, fila[0])
