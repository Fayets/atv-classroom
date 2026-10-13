"""Alta de clientes desde el classroom (lo que hoy hace /add-client en Discord).

1. Crea la sesión de onboarding en atv-onboarding, SIN mandar el mail.
2. Le pide al bot de onboarding el canal privado de Discord (es el plan de contingencia).
3. Crea la ficha en clients.clientes con el mail real: así el cliente ya puede entrar al classroom
   (usuario = su mail, clave = el canal con puntos).
4. El mail de onboarding se manda después, UNA sola vez, con el botón "Enviar link de onboarding".
"""

import json
import re
import unicodedata
from datetime import date, datetime, timedelta

import httpx
from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.models import Admin, AltaCliente
from src.services.auth_service import _buscar_admin_por_email, _buscar_clientes_por_email, clave_desde_canal, es_equipo

PLANES = {"Boost": "boost", "Mentoría": "mentoria", "Advantage": "advantage"}  # onboarding → clients
DURACION = {"boost": 240, "mentoria": 120, "advantage": 120}  # días, igual que atv-clients
_MAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _onboarding():
    url = config("ONBOARDING_API_URL", default="").rstrip("/")
    clave = config("ONBOARDING_ADMIN_KEY", default="")
    if not url or not clave:
        raise HTTPException(status_code=503, detail="Falta conectar el classroom con el onboarding (ONBOARDING_API_URL y ONBOARDING_ADMIN_KEY).")
    return url, {"X-Admin-Key": clave}


def _llamar(metodo: str, ruta: str, **kw) -> dict:
    url, headers = _onboarding()
    try:
        r = httpx.request(metodo, f"{url}{ruta}", headers=headers, timeout=40, **kw)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="No se pudo hablar con el onboarding. Probá de nuevo en un rato.")
    if r.status_code >= 400:
        try:
            detalle = r.json().get("detail")
        except ValueError:
            detalle = None
        raise HTTPException(status_code=502 if r.status_code >= 500 else 422, detail=detalle or f"El onboarding respondió {r.status_code}.")
    return r.json() if r.content else {}


def slug_de(nombre: str) -> str:
    """Igual que slugify_name del onboarding: el canal de Discord y la clave del classroom salen de acá."""
    t = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode("ascii").lower().strip()
    t = re.sub(r"[^a-z0-9\s-]", "", t)
    t = re.sub(r"[\s_]+", "-", t)
    return re.sub(r"-+", "-", t).strip("-") or "cliente"


def _equipo(sesion: dict) -> int:
    if not es_equipo(sesion):
        raise HTTPException(status_code=403, detail="Las altas las hace el equipo de ATV.")
    return sesion["usuario_id"]


def _dict(a: AltaCliente) -> dict:
    from src.models import Canal

    autor = Admin.get(id=a.creado_por)
    canal = Canal.get(cliente_id=a.cliente_id)
    return {
        "canal_id": canal.id if canal else None,
        "id": a.id,
        "cliente_id": a.cliente_id,
        "nombre": a.nombre,
        "email": a.email,
        "plan": a.plan,
        "canal": a.canal,
        "clave_classroom": clave_desde_canal(a.canal),
        "discord_invite_url": a.discord_invite_url,
        "discord_error": a.discord_error,
        "creado_en": a.creado_en.isoformat() + "Z",
        "creado_por": (autor.nombre or autor.email) if autor else None,
        "mail_enviado_en": a.mail_enviado_en.isoformat() + "Z" if a.mail_enviado_en else None,
    }


class AltaServices:
    def crear(self, sesion: dict, nombre: str, email: str, plan: str) -> dict:
        yo = _equipo(sesion)
        nombre = " ".join((nombre or "").split())
        email = (email or "").strip().lower()
        if not nombre or len(nombre) > 80:
            raise HTTPException(status_code=422, detail="Poné el nombre del cliente.")
        if not _MAIL.match(email):
            raise HTTPException(status_code=422, detail="Revisá el mail.")
        if plan not in PLANES:
            raise HTTPException(status_code=422, detail="Elegí el plan.")
        canal = slug_de(nombre)
        with db_session:
            if _buscar_admin_por_email(email):
                raise HTTPException(status_code=409, detail="Ese mail es de alguien del equipo de ATV.")
            if _buscar_clientes_por_email(email):
                raise HTTPException(status_code=409, detail="Ya hay un cliente con ese mail.")
            if db.select("SELECT 1 FROM clients.clientes WHERE lower(canal_discord) = $c LIMIT 1", {"c": canal}):
                raise HTTPException(status_code=409, detail=f"Ya hay un cliente con el canal #{canal}. Agregá el apellido o una inicial al nombre.")

        # 1. Sesión de onboarding, sin mail.
        s = _llamar("POST", "/api/admin/add-client", json={"name": nombre, "email": email, "plan": plan, "send_email": False})
        session_id = s["session_id"]
        canal = s.get("channel_slug") or canal

        # 2. Canal de Discord. Si falla, el alta sigue: se avisa y se puede crear a mano.
        invite, error_discord = None, None
        try:
            d = _llamar("POST", f"/api/admin/sessions/{session_id}/create-discord-channel")
            invite = d.get("discord_invite_url")
        except HTTPException as e:
            error_discord = e.detail

        # 3. Ficha del cliente en atv-clients.
        plan_bd = PLANES[plan]
        hoy = date.today()
        with db_session:
            autor = Admin.get(id=yo)
            fila = db.execute(
                "INSERT INTO clients.clientes (nombre, email, emails_json, canal_discord, plan_actual, fecha_inicio, duracion_dias, "
                "fecha_vencimiento, estado_cliente, total_pagado_usd, total_adeudado_usd, observaciones) "
                "VALUES ($nombre, $email, $emails, $canal, $plan, $inicio, $dur, $vence, 'vigente', 0, 0, $obs) RETURNING id",
                {
                    "nombre": nombre, "email": email, "emails": json.dumps([email]), "canal": canal, "plan": plan_bd,
                    "inicio": hoy, "dur": DURACION[plan_bd], "vence": hoy + timedelta(days=DURACION[plan_bd]),
                    "obs": f"Alta desde el classroom por {(autor.nombre or autor.email) if autor else 'el equipo'}",
                },
            ).fetchone()
            # Su chat en el classroom, ya listo para que quien hizo el alta lo abra.
            from src.services.mensajeria_service import _canal_del_cliente

            _canal_del_cliente(fila[0])
            a = AltaCliente(
                cliente_id=fila[0], session_id=session_id, nombre=nombre, email=email, plan=plan, canal=canal,
                discord_invite_url=invite, discord_error=error_discord, creado_por=yo,
            )
            a.flush()
            return _dict(a)

    def listar(self, sesion: dict) -> list[dict]:
        _equipo(sesion)
        with db_session:
            filas = list(AltaCliente.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."altas_clientes" ORDER BY creado_en DESC LIMIT 30'))
            return [_dict(a) for a in filas]

    def enviar_mail(self, sesion: dict, alta_id: int) -> dict:
        yo = _equipo(sesion)
        with db_session:
            # Candado por alta: dos clics a la vez no mandan dos mails.
            if not db.select("SELECT pg_try_advisory_xact_lock(7400000 + $i)", {"i": alta_id})[0]:
                raise HTTPException(status_code=409, detail="Ya se está mandando.")
            a = AltaCliente.get(id=alta_id)
            if a is None:
                raise HTTPException(status_code=404, detail="No existe esa alta.")
            if a.mail_enviado_en:
                raise HTTPException(status_code=409, detail="El link de onboarding ya se mandó.")
            _llamar("POST", f"/api/admin/sessions/{a.session_id}/send-onboarding-email")
            a.mail_enviado_en = datetime.utcnow()
            a.mail_enviado_por = yo
            return _dict(a)

    def anular(self, sesion: dict, alta_id: int) -> dict:
        """Para un error de carga (o una prueba): borra el canal de Discord, la sesión de onboarding, la
        ficha y el chat. Solo si el cliente todavía no empezó: sin mail mandado y sin mensajes suyos."""
        yo = _equipo(sesion)
        with db_session:
            a = AltaCliente.get(id=alta_id)
            if a is None:
                raise HTTPException(status_code=404, detail="No existe esa alta.")
            if sesion.get("rol") != "admin" and a.creado_por != yo:
                raise HTTPException(status_code=403, detail="Solo quien hizo el alta o un admin la puede anular.")
            if a.mail_enviado_en:
                raise HTTPException(status_code=409, detail="El cliente ya recibió el onboarding: no se puede anular desde acá.")
            escribio = db.select(
                f'SELECT 1 FROM "{DB_SCHEMA}"."mensajes_canal" m JOIN "{DB_SCHEMA}"."canales" c ON c.id = m.canal '
                "WHERE c.cliente_id = $c AND m.autor_tipo = 'cliente' LIMIT 1",
                {"c": a.cliente_id},
            )
            if escribio:
                raise HTTPException(status_code=409, detail="El cliente ya escribió en su chat: no se puede anular desde acá.")
            session_id, cliente_id = a.session_id, a.cliente_id
        _llamar("DELETE", f"/api/admin/sessions/{session_id}/cancel")
        with db_session:
            canales = db.select(f'SELECT id FROM "{DB_SCHEMA}"."canales" WHERE cliente_id = $c', {"c": cliente_id})
            for t, col in (("menciones", "canal_id"), ("mensajes_canal", "canal"), ("lecturas_canal", "canal_id"), ("cerebro_estado", "canal_id")):
                db.execute(f'DELETE FROM "{DB_SCHEMA}"."{t}" WHERE {col} = ANY($ids)', {"ids": list(canales)})
            db.execute(f'DELETE FROM "{DB_SCHEMA}"."canales" WHERE cliente_id = $c', {"c": cliente_id})
            db.execute(f'DELETE FROM "{DB_SCHEMA}"."sesiones" WHERE tipo = \'cliente\' AND usuario_id = $c', {"c": cliente_id})
            db.execute("DELETE FROM clients.clientes WHERE id = $c AND observaciones LIKE 'Alta desde el classroom%'", {"c": cliente_id})
            AltaCliente.get(id=alta_id).delete()
        return {"ok": True}
