"""Carpeta "Onboardings" del escritorio: lo mismo que muestra el dashboard de atv-onboarding.

Solo lectura sobre el esquema onboarding (la misma base). Por cada sesión: en qué paso va el cliente
(entró, Discord, Skool, formulario) y sus respuestas. Si el alta se hizo desde el classroom, también
si ya se le mandó el link de onboarding.
"""

import json

from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.services.auth_service import es_equipo


def _equipo(sesion: dict) -> None:
    if not es_equipo(sesion):
        raise HTTPException(status_code=403, detail="Solo para el equipo.")


_SQL = f"""SELECT s.id::text, s.client_name, s.client_email, s.plan, s.created_at, s.used, s.discord_invite_used,
  s.skool_used, s.form_submitted, coalesce(s.form_submitted_at, (SELECT max(f.submitted_at) FROM onboarding.forms f WHERE f.session_id = s.id)),
  s.discord_invite_url, a.id, a.mail_enviado_en, c.id, ch.id
FROM onboarding.sessions s
LEFT JOIN "{DB_SCHEMA}"."altas_clientes" a ON a.session_id = s.id::text
LEFT JOIN LATERAL (SELECT k.id FROM clients.clientes k WHERE lower(k.email) = lower(s.client_email) ORDER BY k.id DESC LIMIT 1) c ON true
LEFT JOIN "{DB_SCHEMA}"."canales" ch ON ch.cliente_id = c.id"""


def _fila(r) -> dict:
    sid, nombre, email, plan, creado, entro, discord, skool, form, form_en, invite, alta_id, mail_en, cliente_id, canal_id = r
    pasos = {"entro": bool(entro), "discord": bool(discord), "skool": bool(skool), "formulario": bool(form)}
    return {
        "id": sid,
        "nombre": nombre or email or "Sin nombre",
        "email": email,
        "plan": plan,
        "creado_en": creado.isoformat() if creado else None,
        "pasos": pasos,
        "hechos": sum(pasos.values()),
        "estado": "completo" if form else "en_curso" if entro else "sin_empezar",
        "formulario_en": form_en.isoformat() if form_en else None,
        "discord_invite_url": invite,
        "alta_id": alta_id,  # si se dio de alta desde el classroom
        "mail_pendiente": bool(alta_id) and mail_en is None,
        "cliente_id": cliente_id,
        "canal_id": canal_id,
    }


class OnboardingsServices:
    def listar(self, sesion: dict) -> list[dict]:
        _equipo(sesion)
        with db_session:
            return [_fila(r) for r in db.select(_SQL + " ORDER BY s.created_at DESC NULLS LAST")]

    def detalle(self, sesion: dict, session_id: str) -> dict:
        _equipo(sesion)
        with db_session:
            filas = db.select(_SQL + " WHERE s.id::text = $sid", {"sid": session_id})
            if not filas:
                raise HTTPException(status_code=404, detail="No existe ese onboarding.")
            datos = _fila(filas[0])
            form = db.select("SELECT form_data FROM onboarding.forms WHERE session_id::text = $sid ORDER BY submitted_at DESC NULLS LAST LIMIT 1", {"sid": session_id})
            respuestas = form[0] if form else None
            if isinstance(respuestas, str):
                respuestas = json.loads(respuestas)
            datos["respuestas"] = respuestas or {}
            return datos
