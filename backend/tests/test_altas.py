"""Alta de clientes desde el classroom: crea onboarding (sin mail), canal de Discord y ficha; el mail sale
una sola vez con el botón; un alta sin arrancar se puede anular."""

import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db
from src.services import alta_service as al

COACH = {"usuario_id": 62, "rol": "coach", "nombre": "Coach", "email": "c@x.com"}
CLIENTE = {"usuario_id": 1, "rol": "boost", "nombre": "Cliente", "email": "x@x.com"}
MAIL = "alta-test@atvos-prueba.com"


@pytest.fixture()
def onboarding(monkeypatch):
    if db.provider is None:
        init_db()
    llamadas = []

    def falso(metodo, ruta, **kw):
        llamadas.append((metodo, ruta, kw.get("json")))
        if ruta == "/api/admin/add-client":
            return {"session_id": "sesion-prueba", "channel_slug": "prueba-alta-test", "password": "x"}
        if ruta.endswith("create-discord-channel"):
            return {"discord_invite_url": "https://discord.gg/prueba"}
        return {"ok": True}

    monkeypatch.setattr(al, "_llamar", falso)
    yield llamadas
    with db_session:
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."altas_clientes" WHERE email = $m', {"m": MAIL})
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."canales" WHERE cliente_id IN (SELECT id FROM clients.clientes WHERE email = $m)', {"m": MAIL})
        db.execute("DELETE FROM clients.clientes WHERE email = $m", {"m": MAIL})


def test_alta_completa_sin_mail_y_el_mail_sale_una_sola_vez(onboarding):
    svc = al.AltaServices()
    a = svc.crear(COACH, "Prueba Alta Test", MAIL, "Boost")
    assert a["canal"] == "prueba-alta-test" and a["clave_classroom"] == "prueba.alta.test"
    assert a["discord_invite_url"] == "https://discord.gg/prueba" and a["mail_enviado_en"] is None
    assert onboarding[0][2]["send_email"] is False  # el onboarding no manda el mail solo
    from src.services.mensajeria_service import canales_de_coach

    with db_session:
        assert a["canal_id"] and a["canal_id"] in canales_de_coach(COACH["usuario_id"])  # quien da el alta ve su chat
    with db_session:
        plan, vence = db.select("SELECT plan_actual, fecha_vencimiento - fecha_inicio FROM clients.clientes WHERE id = $i", {"i": a["cliente_id"]})[0]
    assert plan == "boost" and vence == 240
    assert svc.enviar_mail(COACH, a["id"])["mail_enviado_en"]
    with pytest.raises(HTTPException) as e:
        svc.enviar_mail(COACH, a["id"])
    assert e.value.status_code == 409
    with pytest.raises(HTTPException):
        svc.anular(COACH, a["id"])  # ya recibió el onboarding


def test_validaciones_y_quien_puede(onboarding):
    svc = al.AltaServices()
    with pytest.raises(HTTPException):
        svc.crear(CLIENTE, "X", MAIL, "Boost")
    for nombre, mail, plan in (("", MAIL, "Boost"), ("Ok", "no-mail", "Boost"), ("Ok", MAIL, "Premium")):
        with pytest.raises(HTTPException):
            svc.crear(COACH, nombre, mail, plan)


def test_un_alta_sin_arrancar_se_anula_entera(onboarding):
    svc = al.AltaServices()
    a = svc.crear(COACH, "Prueba Alta Test", MAIL, "Mentoría")
    svc.anular(COACH, a["id"])
    assert ("DELETE", "/api/admin/sessions/sesion-prueba/cancel", None) in onboarding
    with db_session:
        assert not db.select("SELECT 1 FROM clients.clientes WHERE email = $m", {"m": MAIL})
