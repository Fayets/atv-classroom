"""Avisos por mail al cliente: si alguien del equipo le escribió y no lo leyó, le llega un mail.

Cuándo se manda (lo decide el código, cada AVISOS_CADA_MIN minutos):
- el último mensaje del equipo en su chat tiene más de AVISO_DESPUES_MIN minutos y menos de 2 días
  (al prender esto no se avisa de lo viejo);
- el cliente no lo leyó y no está conectado ahora mismo;
- no se le avisó ya de ese mensaje, y pasaron al menos HORAS_ENTRE_AVISOS desde el último aviso.
Solo con AVISOS_MAIL=1 (en local va apagado: la base es la de producción y le escribiría a clientes reales).
"""

import html
import logging
import smtplib
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from decouple import config
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.models import Admin, AvisoMail, ClienteExterno
from src.services.auth_service import _tiene_acceso

logger = logging.getLogger(__name__)

AVISO_DESPUES_MIN = config("AVISO_DESPUES_MIN", default=10, cast=int)
HORAS_ENTRE_AVISOS = config("AVISO_HORAS_ENTRE", default=3, cast=int)
CLASSROOM_URL = config("CLASSROOM_URL", default="https://classroom.atvos.io").rstrip("/")


def activo() -> bool:
    return config("AVISOS_MAIL", default=False, cast=bool) and bool(config("SMTP_HOST", default="") and config("SMTP_USER", default=""))


def pendientes(conectados: set[int], ahora: datetime | None = None) -> list[dict]:
    """Chats con mensajes del equipo sin leer por el cliente, listos para avisar."""
    ahora = ahora or datetime.utcnow()
    filas = db.select(
        f"""SELECT c.id, c.cliente_id, m.id, m.autor_id, m.texto, m.creado_en,
              (SELECT count(*) FROM "{DB_SCHEMA}"."mensajes_canal" x
                WHERE x.canal = c.id AND x.autor_tipo = 'admin' AND x.id > 0 AND NOT x.borrado AND x.id > coalesce(l.ultimo_leido_id, 0)),
              a.ultimo_mensaje_id, a.enviado_en
            FROM "{DB_SCHEMA}"."canales" c
            JOIN LATERAL (SELECT * FROM "{DB_SCHEMA}"."mensajes_canal" m WHERE m.canal = c.id AND NOT m.borrado AND m.id > 0
                          ORDER BY m.id DESC LIMIT 1) m ON true
            LEFT JOIN "{DB_SCHEMA}"."lecturas_canal" l ON l.canal_id = c.id AND l.lector_tipo = 'cliente' AND l.lector_id = c.cliente_id
            LEFT JOIN "{DB_SCHEMA}"."avisos_mail" a ON a.canal_id = c.id
            WHERE c.tipo = 'cliente' AND c.cliente_id IS NOT NULL AND m.autor_tipo = 'admin'
              AND m.creado_en <= $hasta AND m.creado_en >= $desde
              AND m.id > coalesce(l.ultimo_leido_id, 0)""",
        {"hasta": ahora - timedelta(minutes=AVISO_DESPUES_MIN), "desde": ahora - timedelta(days=2)},
    )
    salida = []
    for canal_id, cliente_id, msj_id, autor_id, texto, creado, sin_leer, avisado_id, avisado_en in filas:
        if cliente_id in conectados:
            continue
        if avisado_id is not None and (avisado_id >= msj_id or avisado_en > ahora - timedelta(hours=HORAS_ENTRE_AVISOS)):
            continue
        salida.append({"canal_id": canal_id, "cliente_id": cliente_id, "mensaje_id": msj_id, "autor_id": autor_id, "texto": texto or "", "sin_leer": sin_leer})
    return salida


def armar_mail(nombre: str, coach: str, texto: str, sin_leer: int) -> tuple[str, str]:
    asunto = f"{coach} te escribió en ATV" if sin_leer <= 1 else f"{coach} te dejó {sin_leer} mensajes en ATV"
    cita = html.escape(texto[:280] + ("…" if len(texto) > 280 else "")).replace("\n", "<br>") or "📎 Te mandó un archivo."
    cuerpo = f"""<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background:#0a0a0a;font-family:Inter,Arial,sans-serif;color:#fff">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0a0a;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#121212;border:1px solid rgba(255,255,255,.08);border-radius:16px">
<tr><td style="padding:36px 32px 28px">
<img src="{CLASSROOM_URL}/logowhite.png" alt="ATV" width="140" style="display:block;margin:0 0 24px">
<p style="margin:0 0 8px;font-size:15px;color:rgba(255,255,255,.7)">Hola {html.escape(nombre)},</p>
<h1 style="margin:0 0 18px;font-size:21px;line-height:1.3">{html.escape(asunto)}</h1>
<div style="margin:0 0 26px;padding:16px 18px;border-left:3px solid #e63946;background:rgba(255,255,255,.04);border-radius:8px;font-size:15px;line-height:1.55;color:rgba(255,255,255,.9)">{cita}</div>
<a href="{CLASSROOM_URL}/mensajes" style="display:inline-block;background:#e63946;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 24px;border-radius:10px">Responder en el classroom</a>
</td></tr>
<tr><td style="padding:16px 32px 24px;border-top:1px solid rgba(255,255,255,.06);font-size:12px;line-height:1.6;color:rgba(255,255,255,.4)">
Te avisamos por mail cuando tenés mensajes sin leer y no estás en el classroom.</td></tr>
</table></td></tr></table></body></html>"""
    return asunto, cuerpo


def _mandar(para: str, asunto: str, cuerpo: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"], msg["From"], msg["To"] = asunto, config("SMTP_FROM", default=config("SMTP_USER", default="")), para
    msg.attach(MIMEText(cuerpo, "html", "utf-8"))
    with smtplib.SMTP(config("SMTP_HOST"), config("SMTP_PORT", default=587, cast=int), timeout=20) as s:
        s.starttls()
        s.login(config("SMTP_USER"), config("SMTP_PASSWORD"))
        s.send_message(msg)


def ciclo(conectados: set[int], mandar=_mandar, ahora: datetime | None = None) -> int:
    """Manda los avisos pendientes. Devuelve cuántos salieron."""
    enviados = 0
    with db_session:
        lista = pendientes(conectados, ahora)
    for p in lista:
        with db_session:
            cliente = ClienteExterno.get(id=p["cliente_id"])
            autor = Admin.get(id=p["autor_id"])
            mail = (cliente.email or "").strip() if cliente else ""
            if not cliente or not _tiene_acceso(cliente) or "@" not in mail or mail.endswith("@atvos-prueba.com"):
                continue
            nombre = (cliente.nombre or "").split()[0] if cliente.nombre else ""
            coach = ((autor.nombre or "Tu coach") if autor else "Tu coach").split()[0]
        asunto, cuerpo = armar_mail(nombre, coach, p["texto"], p["sin_leer"])
        try:
            mandar(mail, asunto, cuerpo)
        except Exception:
            logger.warning("Avisos: no se pudo mandar el mail al cliente %s", p["cliente_id"])
            continue
        with db_session:
            a = AvisoMail.get(canal_id=p["canal_id"])
            if a is None:
                AvisoMail(canal_id=p["canal_id"], ultimo_mensaje_id=p["mensaje_id"])
            else:
                a.ultimo_mensaje_id, a.enviado_en = p["mensaje_id"], datetime.utcnow()
        enviados += 1
    return enviados
