"""Fathom de cada coach: se conecta en Mi cuenta con su API key y sus llamadas caen solas en la
carpeta Llamadas (con transcripción), listas para armar el roadmap.

La API de Fathom no busca por id: lista las reuniones por fecha de creación (de a páginas, con
cursor). La primera vez se traen los últimos 90 días; después, desde la última sincronización.
Cada llamada se ata al cliente que estaba invitado, por su mail.
"""

import json
import logging
import re
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.models import ClienteExterno, FathomConexion, Llamada
from src.services.auth_service import _emails_del_cliente, es_equipo
from src.services.cifrado import cifrar, descifrar

logger = logging.getLogger(__name__)

API = "https://api.fathom.ai/external/v1"
DIAS_PRIMERA_VEZ = 90
MAX_PAGINAS = 20


def _equipo(sesion: dict) -> int:
    if not es_equipo(sesion):
        raise HTTPException(status_code=403, detail="Solo el equipo de ATV conecta Fathom.")
    return sesion["usuario_id"]


def _primero(d: dict, *claves, default=None):
    """Fathom fue cambiando nombres de campos; se prueban los que puede mandar."""
    for c in claves:
        if isinstance(d, dict) and d.get(c) not in (None, "", [], {}):
            return d[c]
    return default


def _texto_transcripcion(v) -> str:
    if isinstance(v, str):
        return v
    lineas = []
    for t in v if isinstance(v, list) else []:
        if isinstance(t, dict):
            quien = _primero(t, "speaker", "speaker_name", "name", default="")
            if isinstance(quien, dict):
                quien = _primero(quien, "display_name", "name", default="")
            lineas.append(f"{quien}: {_primero(t, 'text', 'content', default='')}".strip(": ").strip())
        elif isinstance(t, str):
            lineas.append(t)
    return "\n".join(x for x in lineas if x)


def _fecha(v) -> datetime | None:
    if not v:
        return None
    try:
        t = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None
    return t.astimezone(timezone.utc).replace(tzinfo=None) if t.tzinfo else t


def _pedir(clave: str, params: dict, http=httpx.get) -> dict:
    try:
        r = http(f"{API}/meetings", params=params, headers={"X-Api-Key": clave, "Accept": "application/json"}, timeout=40)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"No se pudo conectar con Fathom: {e}") from e
    if r.status_code in (401, 403):
        raise HTTPException(status_code=400, detail="Fathom rechazó esa API key. Revisá que esté completa.")
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Fathom respondió {r.status_code}.")
    return r.json()


def _clientes_por_mail() -> dict[str, int]:
    mapa = {}
    for c in list(ClienteExterno.select()):
        for e in _emails_del_cliente(c):
            mapa.setdefault(e, c.id)
    return mapa


def _guardar(admin_id: int, item: dict, por_mail: dict[str, int]) -> bool:
    """Crea o actualiza la llamada. Devuelve True si era nueva."""
    fid = str(_primero(item, "recording_id", "id", default="") or "")
    if not fid:
        return False
    invitados = []
    for i in _primero(item, "calendar_invitees", "invitees", "attendees", default=[]) or []:
        if isinstance(i, dict):
            invitados.append({"nombre": i.get("name") or "", "email": (i.get("email") or "").strip().lower(), "externo": bool(i.get("is_external"))})
    inicio = _fecha(_primero(item, "recording_start_time", "scheduled_start_time", "created_at"))
    fin = _fecha(_primero(item, "recording_end_time", "scheduled_end_time"))
    resumen = _primero(item, "default_summary", "summary", default="")
    if isinstance(resumen, dict):
        resumen = _primero(resumen, "markdown_formatted", "text", default="")
    cliente_id = next((por_mail[i["email"]] for i in invitados if i["email"] in por_mail), None)
    datos = {
        "titulo": (_primero(item, "title", "meeting_title", default="") or "")[:300] or None,
        "inicio": inicio,
        "duracion_min": round((fin - inicio).total_seconds() / 60) if inicio and fin and fin > inicio else None,
        "url": _primero(item, "url", default=None),
        "share_url": _primero(item, "share_url", default=None),
        "invitados_json": json.dumps(invitados, ensure_ascii=False),
        "transcripcion": _texto_transcripcion(_primero(item, "transcript", "transcription", default="")) or None,
        "resumen": (resumen or None),
    }
    # La misma llamada pudo entrar antes por su link (fathom.video/calls/<n> o /share/<token>), guardada
    # con otro identificador: se la reconoce por el link y no se duplica.
    ll = Llamada.get(fathom_id=fid) or _misma_por_link(datos.get("url"), datos.get("share_url"))
    if ll is None:
        Llamada(admin_id=admin_id, fathom_id=fid, cliente_id=cliente_id, **datos)
        return True
    for k, v in datos.items():
        if v is not None:
            setattr(ll, k, v)
    if ll.cliente_id is None:
        ll.cliente_id = cliente_id
    return False


def sincronizar(admin_id: int, http=httpx.get) -> dict:
    """Trae las llamadas nuevas del Fathom de ese coach."""
    with db_session:
        con = FathomConexion.get(admin_id=admin_id)
        if con is None:
            return {"nuevas": 0}
        clave = descifrar(con.clave_cifrada)
        desde = (con.ultima_sync - timedelta(days=1)) if con.ultima_sync else datetime.utcnow() - timedelta(days=DIAS_PRIMERA_VEZ)
    if not clave:
        with db_session:
            FathomConexion.get(admin_id=admin_id).error = "Hay que volver a conectar Fathom."
        return {"nuevas": 0}
    params = {"include_transcript": "true", "include_summary": "true", "created_after": desde.strftime("%Y-%m-%dT%H:%M:%SZ")}
    nuevas = 0
    cursor = None
    try:
        with db_session:
            por_mail = _clientes_por_mail()
        for _ in range(MAX_PAGINAS):
            data = _pedir(clave, dict(params, **({"cursor": cursor} if cursor else {})), http=http)
            with db_session:
                for item in data.get("items") or []:
                    nuevas += _guardar(admin_id, item, por_mail)
            cursor = data.get("next_cursor")
            if not cursor:
                break
    except HTTPException as e:
        with db_session:
            FathomConexion.get(admin_id=admin_id).error = e.detail
        raise
    with db_session:
        con = FathomConexion.get(admin_id=admin_id)
        con.ultima_sync, con.error = datetime.utcnow(), None
    return {"nuevas": nuevas}


def _id_del_link(url: str) -> str:
    """El identificador de la grabación en el link: fathom.video/calls/853532880 o /share/<token>."""
    m = re.search(r"fathom\.video/(?:calls|share|recording)/([A-Za-z0-9_-]+)", url or "")
    return m.group(1) if m else ""


def _misma_por_link(*links) -> Llamada | None:
    for link in links:
        ident = _id_del_link(link)
        if ident:
            ll = _guardada_por_link(ident)
            if ll is not None:
                return ll
    return None


def _guardada_por_link(ident: str) -> Llamada | None:
    # El LIKE solo acerca candidatos: se confirma que el identificador del link sea exactamente ese
    # (si no, "calls/1" agarraría cualquier llamada con un 1 en el link).
    for ll in list(Llamada.select_by_sql(
        f'SELECT * FROM "{DB_SCHEMA}"."llamadas" WHERE fathom_id = $ident OR share_url LIKE $patron OR url LIKE $patron',
        {"ident": ident, "patron": f"%{ident}%"},
    )):
        if ll.fathom_id == ident or _id_del_link(ll.url) == ident or _id_del_link(ll.share_url) == ident:
            return ll
    return None


def _del_link_publico(token: str, http=httpx.get) -> dict | None:
    """Un link de compartir de Fathom (fathom.video/share/<token>) se puede ver sin cuenta: la página
    trae los datos de la llamada y un enlace para copiar la transcripción con ese mismo token.
    El link se arma acá con el token (nunca se pide una dirección que mandó el usuario)."""
    import html as _html

    if not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", token):
        return None
    pagina = f"https://fathom.video/share/{token}"
    try:
        r = http(pagina, headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html"}, timeout=20, follow_redirects=True)
        m = re.search(r'data-page="([^"]+)"', r.text) if r.status_code == 200 else None
        if not m:
            return None
        props = json.loads(_html.unescape(m.group(1))).get("props") or {}
        call, copiar = props.get("call") or {}, props.get("copyTranscriptUrl") or ""
        if not call.get("id") or not copiar.startswith("https://fathom.video/"):
            return None
        t = http(copiar, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"}, timeout=30, follow_redirects=True)
        texto = (t.json().get("plain_text") or "").strip() if t.status_code == 200 else ""
    except (httpx.HTTPError, ValueError):
        return None
    if not texto:
        return None
    inicio = _fecha(call.get("started_at") or (call.get("recording") or {}).get("started_at"))
    return {
        "recording_id": str(call["id"]),
        "title": call.get("title") or call.get("topic"),
        "share_url": pagina,
        "recording_start_time": inicio.isoformat() + "Z" if inicio else None,
        "recording_end_time": (inicio + timedelta(minutes=call["duration_minutes"])).isoformat() + "Z" if inicio and call.get("duration_minutes") else None,
        "transcript": texto,
    }


def buscar_por_link(sesion: dict, url: str, http=httpx.get, cliente_id: int | None = None) -> int:
    """La llamada de ese link de Fathom, con su transcripción, para armar el roadmap pegando solo el link.
    Primero entre las que ya entraron; si no, en el Fathom de quien la pide y después en el de los demás
    del equipo que lo tengan conectado (la transcripción no es pública: hace falta la clave de esa cuenta).
    Devuelve el id de la llamada guardada."""
    yo = _equipo(sesion)
    ident = _id_del_link(url)
    if not ident:
        raise HTTPException(status_code=422, detail="Ese link no es de Fathom. Tiene que ser fathom.video/share/… o fathom.video/calls/…")
    with db_session:
        ll = _guardada_por_link(ident)
        if ll is not None and ll.transcripcion:
            if ll.cliente_id is None and cliente_id:
                ll.cliente_id = cliente_id
            return ll.id
    # 1. El link de compartir es público: se lee la transcripción sin necesitar el Fathom conectado.
    if "/share/" in url:
        item = _del_link_publico(ident, http=http)
        if item is not None:
            with db_session:
                ll = Llamada.get(fathom_id=item["recording_id"])
                if ll is None:
                    _guardar(yo, item, {})
                    db.flush()  # para que la llamada nueva ya tenga id
                    ll = Llamada.get(fathom_id=item["recording_id"])
                elif not ll.transcripcion:
                    ll.transcripcion = item["transcript"]
                if ll.share_url is None:
                    ll.share_url = item["share_url"]
                if ll.cliente_id is None and cliente_id:
                    ll.cliente_id = cliente_id
                return ll.id
    # 2. Si no, con la API de Fathom de quien la pide y de los demás del equipo conectados.
    with db_session:
        conexiones = sorted(list(FathomConexion.select()), key=lambda c: c.admin_id != yo)
        claves = [(c.admin_id, descifrar(c.clave_cifrada)) for c in conexiones]
        por_mail = _clientes_por_mail()
    if not claves:
        raise HTTPException(status_code=404, detail="No pudimos leer esa llamada. Usá el link de compartir de Fathom (Share → Copy link) o conectá tu Fathom en Mi cuenta. Mientras, pegá la transcripción.")
    desde = (datetime.utcnow() - timedelta(days=DIAS_PRIMERA_VEZ)).strftime("%Y-%m-%dT%H:%M:%SZ")
    params = {"include_transcript": "true", "include_summary": "true", "created_after": desde}
    for admin_id, clave in claves:
        if not clave:
            continue
        cursor = None
        for _ in range(MAX_PAGINAS):
            try:
                data = _pedir(clave, dict(params, **({"cursor": cursor} if cursor else {})), http=http)
            except HTTPException:
                break  # esa cuenta falla: se prueba con la siguiente
            for item in data.get("items") or []:
                if ident in (str(item.get("recording_id") or ""), ) or ident in str(item.get("share_url") or "") or ident in str(item.get("url") or ""):
                    with db_session:
                        _guardar(admin_id, item, por_mail)
                        ll = _guardada_por_link(ident)
                        if ll.cliente_id is None and cliente_id:
                            ll.cliente_id = cliente_id
                        return ll.id
            cursor = data.get("next_cursor")
            if not cursor:
                break
    raise HTTPException(status_code=404, detail="No encontramos esa llamada en el Fathom del equipo (de los últimos 90 días). Pegá la transcripción.")


def ciclo() -> int:
    """Para la tarea de fondo: sincroniza a todos los coaches conectados. Un error no frena al resto."""
    with db_session:
        ids = [c.admin_id for c in list(FathomConexion.select())]
    total = 0
    for i in ids:
        try:
            total += sincronizar(i)["nuevas"]
        except Exception:
            logger.warning("Fathom: no se pudo sincronizar al coach %s", i)
    return total


class FathomServices:
    def estado(self, sesion: dict) -> dict:
        yo = _equipo(sesion)
        with db_session:
            con = FathomConexion.get(admin_id=yo)
            if con is None:
                return {"conectado": False}
            llamadas = db.select(f'SELECT count(*) FROM "{DB_SCHEMA}"."llamadas" WHERE admin_id = $yo')[0]
            return {
                "conectado": True,
                "desde": con.conectada_en.isoformat() + "Z",
                "ultima_sync": con.ultima_sync.isoformat() + "Z" if con.ultima_sync else None,
                "error": con.error,
                "llamadas": llamadas,
            }

    def conectar(self, sesion: dict, clave: str, http=httpx.get) -> dict:
        yo = _equipo(sesion)
        clave = (clave or "").strip()
        if len(clave) < 20:
            raise HTTPException(status_code=422, detail="Pegá la API key completa de Fathom.")
        # Se prueba antes de guardarla: si Fathom la rechaza, no queda conectada.
        _pedir(clave, {"created_after": (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")}, http=http)
        with db_session:
            con = FathomConexion.get(admin_id=yo)
            if con is None:
                FathomConexion(admin_id=yo, clave_cifrada=cifrar(clave))
            else:
                con.clave_cifrada, con.error, con.conectada_en = cifrar(clave), None, datetime.utcnow()
        try:
            sincronizar(yo, http=http)
        except HTTPException:
            pass  # queda conectado; el error se ve en el estado
        return self.estado(sesion)

    def desconectar(self, sesion: dict) -> dict:
        yo = _equipo(sesion)
        with db_session:
            con = FathomConexion.get(admin_id=yo)
            if con is not None:
                con.delete()
        return {"conectado": False}

    def sincronizar_ahora(self, sesion: dict) -> dict:
        yo = _equipo(sesion)
        sincronizar(yo)
        return self.estado(sesion)
