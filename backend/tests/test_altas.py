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
    a = svc.crear(COACH, "Prueba Alta Test", MAIL, "Boost", sin_ficha=True)
    assert a["canal"] == "prueba-alta-test" and a["clave_classroom"] == "prueba.alta.test"
    assert a["discord_invite_url"] == "https://discord.gg/prueba" and a["mail_enviado_en"] is None
    assert onboarding[0][2]["send_email"] is False  # el onboarding no manda el mail solo
    assert onboarding[0][2]["payment_mode"] == "Pago único"  # Boost firma el contrato de High: siempre pago único
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
        svc.crear(CLIENTE, "X", MAIL, "Boost", sin_ficha=True)
    for nombre, mail, plan in (("", MAIL, "Boost"), ("Ok", "no-mail", "Boost"), ("Ok", MAIL, "Premium")):
        with pytest.raises(HTTPException):
            svc.crear(COACH, nombre, mail, plan, pago="Pago único", sin_ficha=True)
    with pytest.raises(HTTPException) as e:
        svc.crear(COACH, "Prueba Alta Test", MAIL, "Mid Level", sin_ficha=True)  # sin modalidad de pago para el contrato
    assert e.value.status_code == 422


def test_un_alta_sin_arrancar_se_anula_entera(onboarding):
    svc = al.AltaServices()
    a = svc.crear(COACH, "Prueba Alta Test", MAIL, "Mentoría", pago="Dos cuotas", sin_ficha=True)
    svc.anular(COACH, a["id"])
    assert ("DELETE", "/api/admin/sessions/sesion-prueba/cancel", None) in onboarding
    with db_session:
        assert not db.select("SELECT 1 FROM clients.clientes WHERE email = $m", {"m": MAIL})


def test_completa_la_ficha_de_la_sena_y_anular_la_deja_como_estaba(onboarding):
    with db_session:
        ficha = db.execute(
            "INSERT INTO clients.clientes (nombre, email, plan_actual, estado_cliente, total_pagado_usd, observaciones) "
            "VALUES ('Sena Test', 'sena-test@sena.com', 'entry', 'vigente', 500, 'Seña de Nick') RETURNING id"
        ).fetchone()[0]
    try:
        svc = al.AltaServices()
        encontradas = svc.buscar_ficha(COACH, "sena test")
        assert encontradas[0]["id"] == ficha and encontradas[0]["coincide"] == "nombre" and encontradas[0]["monto"] == 500.0
        assert svc.buscar_ficha(COACH, "Sena")[0]["coincide"] == "parecido"
        sena = next(x for x in svc.senas(COACH) if x["id"] == ficha)
        assert sena["monto"] == 500.0 and sena["notas"] == "Seña de Nick"
        with pytest.raises(HTTPException):
            svc.senas(CLIENTE)
        assert svc.buscar_ficha(COACH, "Senna Test")[0]["id"] == ficha  # Franco y Nick no la escriben igual
        lejos = [f for f in svc.buscar_ficha(COACH, "Nombre Que No Coincide") if f["id"] == ficha]
        assert lejos and lejos[0]["coincide"] is None  # igual aparece en la lista para elegirla
        with pytest.raises(HTTPException) as e:
            svc.crear(COACH, "Cualquier Nombre", MAIL, "Entry Level", pago="Tres cuotas")  # no dijo si dejó seña
        assert e.value.status_code == 409
        a = svc.crear(COACH, "Prueba Alta Test", MAIL, "Entry Level", ficha_id=ficha, pago="Tres cuotas")
        assert a["cliente_id"] == ficha
        with db_session:
            email, canal, plan, pagado, dur = db.select("SELECT email, canal_discord, plan_actual, total_pagado_usd, duracion_dias FROM clients.clientes WHERE id = $i", {"i": ficha})[0]
        assert (email, canal, plan, float(pagado), dur) == (MAIL, "prueba-alta-test", "entry", 500.0, 120)
        with pytest.raises(HTTPException):
            svc.crear(COACH, "Otro", "otro-test@atvos-prueba.com", "Entry Level", ficha_id=ficha, pago="Tres cuotas")  # ya tiene canal
        svc.anular(COACH, a["id"])
        with db_session:
            email, canal, obs = db.select("SELECT email, canal_discord, observaciones FROM clients.clientes WHERE id = $i", {"i": ficha})[0]
        assert (email, canal, obs) == ("sena-test@sena.com", None, "Seña de Nick")  # volvió a la seña, no se borró
    finally:
        with db_session:
            db.execute(f'DELETE FROM "{DB_SCHEMA}"."canales" WHERE cliente_id = $i', {"i": ficha})
            db.execute(f'DELETE FROM "{DB_SCHEMA}"."altas_clientes" WHERE cliente_id = $i', {"i": ficha})
            db.execute("DELETE FROM clients.clientes WHERE id = $i", {"i": ficha})


def test_alta_2k_sin_discord_y_con_los_datos_del_contrato(onboarding):
    svc = al.AltaServices()
    with pytest.raises(HTTPException) as e:
        svc.crear(COACH, "Prueba Alta Test", MAIL, "2K", sin_ficha=True)
    assert e.value.status_code == 422  # sin link de la llamada, ingresos y meta no hay contrato
    datos = {"link_llamada": "https://fathom.video/share/prueba", "ingresos_actuales": "entre USD 1.000 y USD 1.500", "meta_ingresos": "USD 2.000"}
    a = svc.crear(COACH, "Prueba Alta Test", MAIL, "2K", sin_ficha=True, contrato=datos)
    rutas = [r for _, r, _ in onboarding]
    assert not any(r.endswith("create-discord-channel") for r in rutas) and a["discord_invite_url"] is None
    alta = next(j for _, r, j in onboarding if r == "/api/admin/add-client")
    assert alta["plan"] == "2K" and alta["payment_mode"] is None
    assert alta["call_link"] == datos["link_llamada"] and alta["target_income"] == "USD 2.000"
    with db_session:
        plan, dias = db.select("SELECT plan_actual, fecha_vencimiento - fecha_inicio FROM clients.clientes WHERE id = $i", {"i": a["cliente_id"]})[0]
    assert plan == "2k" and dias == 90
