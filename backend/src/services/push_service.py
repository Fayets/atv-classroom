"""Notificaciones en el celular y la compu (Web Push): le llegan aunque la app esté cerrada.

En el iPhone solo funcionan con la app anclada al inicio (iOS 16.4+); en Android y en la compu, desde el
navegador. A quién le llega cada mensaje lo decide el código, para que nadie las termine apagando:

- Cliente: lo que le escribe el equipo en su canal y los anuncios.
- Equipo: sus mensajes directos, cuando lo etiquetan y lo que escriben los clientes que son suyos
  (los que dio de alta, con los que tuvo una llamada o donde lo etiquetaron, igual que su bandeja).
- Admins: además, el cliente que lleva ESPERA_HORAS sin respuesta.

Solo con PUSH=1: en local la base es la de producción y les mandaría avisos a personas reales.
"""

import json
import logging
import re
from datetime import datetime, timedelta

from cryptography.hazmat.primitives import serialization
from decouple import config
from pony.orm import db_session
from py_vapid import Vapid01
from py_vapid.utils import b64urlencode
from pywebpush import WebPushException, webpush

from src.db import DB_SCHEMA, db
from src.models import Admin, Canal, ClienteExterno, PushAlertaEspera, PushClaves, PushSuscripcion

logger = logging.getLogger("push")

CLASSROOM_URL = config("CLASSROOM_URL", default="https://classroom.atvos.io").rstrip("/")
ESPERA_HORAS = config("PUSH_ESPERA_HORAS", default=2, cast=int)
_claves: dict = {}


def activo() -> bool:
    return config("PUSH", default=False, cast=bool)


# ---------- claves ----------

def _vapid() -> tuple[Vapid01, str]:
    """La clave privada para firmar y la pública que necesita el navegador. Se crean una sola vez."""
    if not _claves:
        with db_session:
            fila = PushClaves.get(id=1)
            if fila is None:
                v = Vapid01()
                v.generate_keys()
                publica = b64urlencode(v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
                fila = PushClaves(id=1, privada=v.private_pem().decode(), publica=publica)
            privada, publica = fila.privada, fila.publica
        _claves.update(vapid=Vapid01.from_pem(privada.encode()), publica=publica)
    return _claves["vapid"], _claves["publica"]


def clave_publica() -> str:
    return _vapid()[1]


# ---------- suscripciones ----------

def _quien(sesion: dict) -> tuple[str, int, int | None]:
    from src.services.auth_service import es_equipo

    if es_equipo(sesion):
        return "admin", sesion["usuario_id"], None
    return "cliente", sesion["usuario_id"], sesion.get("miembro_id") or None


def suscribir(sesion: dict, endpoint: str, p256dh: str, auth: str, dispositivo: str | None) -> dict:
    tipo, uid, miembro = _quien(sesion)
    with db_session:
        s = PushSuscripcion.get(endpoint=endpoint)
        if s is None:
            PushSuscripcion(tipo=tipo, usuario_id=uid, miembro_id=miembro, endpoint=endpoint, p256dh=p256dh, auth=auth,
                            dispositivo=(dispositivo or "")[:120] or None)
        else:  # el mismo navegador con otra cuenta: pasa a ser de quien entró ahora
            s.set(tipo=tipo, usuario_id=uid, miembro_id=miembro, p256dh=p256dh, auth=auth)
    return {"ok": True}


def desuscribir(endpoint: str) -> dict:
    with db_session:
        s = PushSuscripcion.get(endpoint=endpoint)
        if s is not None:
            s.delete()
    return {"ok": True}


# ---------- envío ----------

def _mandar(suscripciones: list[PushSuscripcion], aviso: dict) -> int:
    """Manda el aviso a cada dispositivo. Los que el navegador dio de baja (404/410) se borran."""
    vapid, _ = _vapid()
    datos = json.dumps(aviso, ensure_ascii=False)
    enviados, muertos = 0, []
    for s in suscripciones:
        try:
            webpush(
                subscription_info={"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}},
                data=datos,
                vapid_private_key=vapid,
                vapid_claims={"sub": CLASSROOM_URL},
                ttl=24 * 3600,
                headers={"Urgency": "high"},
                timeout=10,
            )
            enviados += 1
        except WebPushException as exc:
            estado = getattr(exc.response, "status_code", None)
            if estado in (404, 410):
                muertos.append(s.endpoint)
            else:
                logger.warning("Push: falló un envío (%s)", estado or exc)
        except Exception:
            logger.exception("Push: falló un envío")
    if muertos:
        with db_session:
            for e in muertos:
                s = PushSuscripcion.get(endpoint=e)
                if s is not None:
                    s.delete()
    return enviados


def _texto(mensaje: dict) -> str:
    t = re.sub(r"\s+", " ", mensaje.get("texto") or "").strip()
    if not t:
        t = "📎 Te mandó un archivo" if mensaje.get("adjuntos") else "Nuevo mensaje"
    return t if len(t) <= 160 else t[:157] + "…"


def _equipo_activo() -> list[tuple[int, str, str]]:
    return [(int(i), n or "", r or "") for i, n, r in db.select(
        f'SELECT id, nombre, rol FROM "{DB_SCHEMA}"."admins" WHERE activo AND NOT coalesce(borrado, false)')]


def destinatarios(mensaje: dict, canal_id: int) -> list[tuple[list[PushSuscripcion], dict]]:
    """Qué dispositivos reciben este mensaje y con qué texto. Nunca quien lo escribió."""
    from src.services.mensajeria_service import _participantes, canales_de_coach

    autor = mensaje.get("autor") or {}
    del_equipo = autor.get("tipo") == "equipo"
    nombre_autor = (autor.get("nombre") or "ATV").split(" ")[0] if del_equipo else (autor.get("nombre") or "Cliente")
    texto = _texto(mensaje)
    url = f"/mensajes?c={canal_id}"
    salida: list[tuple[list[PushSuscripcion], dict]] = []
    avisados: set[tuple] = set()

    def es_autor(s: PushSuscripcion) -> bool:
        if del_equipo:
            return s.tipo == "admin" and s.usuario_id == autor.get("id")
        return s.tipo == "cliente" and s.usuario_id == autor.get("id") and (s.miembro_id or None) == (mensaje.get("miembro_id") or None)

    def sumar(subs, titulo, cuerpo):
        nuevas = [s for s in subs if not es_autor(s) and (s.tipo, s.usuario_id, s.miembro_id) not in avisados]
        for s in nuevas:
            avisados.add((s.tipo, s.usuario_id, s.miembro_id))
        if nuevas:
            salida.append((nuevas, {"titulo": titulo, "cuerpo": cuerpo, "url": url, "etiqueta": f"canal-{canal_id}"}))

    def de_admins(ids):
        ids = set(ids)
        return [s for s in list(PushSuscripcion.select()) if s.tipo == "admin" and s.usuario_id in ids] if ids else []

    canal = Canal.get(id=canal_id)
    if canal is None:
        return salida
    equipo = _equipo_activo()

    # Las menciones primero: es lo más importante para quien la recibe.
    mencionados = [i for i in (mensaje.get("menciones") or []) if i != autor.get("id") or not del_equipo]
    if mencionados:
        sumar(de_admins(mencionados), f"{nombre_autor} te mencionó", f"#{canal.nombre}: {texto}")

    if canal.tipo == "directo":
        otros = [i for i in _participantes(canal) if not (del_equipo and i == autor.get("id"))]
        sumar(de_admins(otros), nombre_autor, texto)
    elif canal.tipo == "cliente":
        cliente = ClienteExterno.get(id=canal.cliente_id) if canal.cliente_id else None
        nombre_cliente = ((cliente.nombre or cliente.email) if cliente else canal.nombre) or "Cliente"
        if del_equipo:
            subs = [s for s in list(PushSuscripcion.select()) if s.tipo == "cliente" and s.usuario_id == canal.cliente_id]
            sumar(subs, f"{nombre_autor} · ATV", texto)
        else:
            # A cada persona del equipo, solo los clientes que son suyos (o el que tiene a cargo).
            responsable = (cliente.responsable or "").strip().lower() if cliente else ""
            suyos = [i for i, n, _ in equipo
                     if canal_id in canales_de_coach(i) or (responsable and n and n.split(" ")[0].lower() == responsable.split(" ")[0])]
            quien = nombre_cliente if nombre_autor == nombre_cliente else f"{nombre_autor} ({nombre_cliente})"
            sumar(de_admins(suyos), quien, texto)
    elif canal.tipo == "grupo" and del_equipo and "anuncio" in canal.nombre.lower():
        en_pausa = {c.cliente_id for c in list(Canal.select()) if c.tipo == "cliente" and c.pausa}
        subs = [s for s in list(PushSuscripcion.select()) if s.tipo == "cliente" and s.usuario_id not in en_pausa]
        sumar(subs, "ATV · Anuncios", texto)
    return salida


def avisar_mensaje(mensaje: dict, canal_id: int) -> int:
    if not activo():
        return 0
    try:
        with db_session:
            envios = destinatarios(mensaje, canal_id)
        return sum(_mandar(subs, aviso) for subs, aviso in envios)
    except Exception:
        logger.exception("Push: no se pudo avisar el mensaje %s", mensaje.get("id"))
        return 0


def ciclo_espera(ahora: datetime | None = None) -> int:
    """A los admins: clientes cuyo último mensaje lleva más de ESPERA_HORAS sin respuesta del equipo.
    Una vez por mensaje, y solo de lo de los últimos 2 días (al prender esto no se avisa de lo viejo)."""
    if not activo():
        return 0
    ahora = ahora or datetime.utcnow()
    with db_session:
        filas = db.select(
            f"""SELECT c.id, m.id, m.creado_en, m.texto, k.nombre, k.email FROM "{DB_SCHEMA}"."canales" c
            JOIN LATERAL (SELECT id, autor_tipo, creado_en, texto FROM "{DB_SCHEMA}"."mensajes_canal"
                          WHERE canal = c.id AND NOT borrado ORDER BY id DESC LIMIT 1) m ON TRUE
            JOIN clients.clientes k ON k.id = c.cliente_id
            WHERE c.tipo = 'cliente' AND NOT coalesce(c.pausa, false) AND NOT coalesce(c.inactivo, false)
              AND m.autor_tipo = 'cliente' AND m.creado_en < $hasta AND m.creado_en > $desde""",
            {"hasta": ahora - timedelta(hours=ESPERA_HORAS), "desde": ahora - timedelta(days=2)},
        )
        pendientes = []
        for canal_id, mensaje_id, creado, texto, nombre, email in filas:
            ya = PushAlertaEspera.get(canal_id=canal_id)
            if ya is not None and ya.mensaje_id == mensaje_id:
                continue
            if ya is None:
                PushAlertaEspera(canal_id=canal_id, mensaje_id=mensaje_id)
            else:
                ya.mensaje_id = mensaje_id
            horas = int((ahora - creado).total_seconds() // 3600)
            pendientes.append((canal_id, nombre or email, horas, _texto({"texto": texto})))
        admins = {i for i, _, rol in _equipo_activo() if rol == "admin"}
        subs = [s for s in list(PushSuscripcion.select()) if s.tipo == "admin" and s.usuario_id in admins]
    enviados = 0
    for canal_id, nombre, horas, texto in pendientes:
        enviados += _mandar(subs, {"titulo": f"{nombre} espera respuesta hace {horas} h", "cuerpo": texto,
                                   "url": f"/mensajes?c={canal_id}", "etiqueta": f"espera-{canal_id}"})
    return enviados


def probar(sesion: dict) -> int:
    """Un aviso de prueba a los dispositivos de quien lo pide (el botón "Probar" de Mi cuenta)."""
    tipo, uid, miembro = _quien(sesion)
    with db_session:
        subs = [s for s in list(PushSuscripcion.select()) if s.tipo == tipo and s.usuario_id == uid and (s.miembro_id or None) == miembro]
    return _mandar(subs, {"titulo": "ATV Classroom", "cuerpo": "Las notificaciones están andando ✅", "url": "/mensajes", "etiqueta": "prueba"})
