"""Vencidos: el equipo arrastra ahí a los clientes vencidos. Solo ordena la bandeja (el acceso lo decide la
fecha de la ficha) y hace que el chat de un cliente sin acceso se siga viendo. Cliente de prueba propio."""

import secrets
from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import db, init_db
from src.services.mensajeria_service import MensajeriaServices

_P = f"test-vencidos-{secrets.token_hex(3)}"
svc = MensajeriaServices()


@pytest.fixture(scope="module")
def mundo():
    if db.provider is None:
        init_db()
    from src.models import Admin, Canal

    with db_session:
        ventas = Admin(email=f"{_P}-ventas@atvos-prueba.com", nombre="ventas", rol="coach", area="ventas")
        marketing = Admin(email=f"{_P}-mkt@atvos-prueba.com", nombre="mkt", rol="coach", area="marketing")
        ventas.flush(); marketing.flush()
        cur = db.get_connection().cursor()
        cur.execute(
            "INSERT INTO clients.clientes (nombre, email, plan_actual, estado_cliente, fecha_vencimiento, canal_discord) "
            "VALUES (%s, %s, 'boost', 'vencido', %s, %s) RETURNING id",
            (_P, f"{_P}@atvos-prueba.com", date.today() - timedelta(days=10), f"#{_P}"),
        )
        cid = cur.fetchone()[0]
        canal = Canal(tipo="cliente", cliente_id=cid, nombre=_P)
        canal.flush()
        datos = {
            "ventas": {"usuario_id": ventas.id, "rol": "coach", "nombre": "ventas", "email": ventas.email, "area": "ventas"},
            "mkt": {"usuario_id": marketing.id, "rol": "coach", "nombre": "mkt", "email": marketing.email, "area": "marketing"},
            "canal_id": canal.id, "cliente_id": cid,
        }
    yield datos
    with db_session:
        Canal[datos["canal_id"]].delete()
        for a in list(Admin.select()):
            if a.email.startswith(_P):
                a.delete()
        db.execute("DELETE FROM clients.clientes WHERE id = $cid", {"cid": datos["cliente_id"]})


def _en_bandeja(sesion, canal_id):
    return next((c for c in svc.listar_canales(dict(sesion)) if c["id"] == canal_id), None)


def test_vencido_sin_acceso_aparece_solo_en_vencidos(mundo):
    assert _en_bandeja(mundo["ventas"], mundo["canal_id"]) is None  # sin acceso y sin marcar: no está
    svc.marcar_vencido(mundo["ventas"], mundo["canal_id"], True)
    item = _en_bandeja(mundo["ventas"], mundo["canal_id"])
    assert item is not None and item["vencido"] is True and item["pausa"] is False and item["inactivo"] is False
    svc.marcar_vencido(mundo["ventas"], mundo["canal_id"], False)
    assert _en_bandeja(mundo["ventas"], mundo["canal_id"]) is None


def test_un_solo_grupo_y_solo_quien_ve_la_plata(mundo):
    from src.models import Canal

    svc.marcar_pausa(mundo["ventas"], mundo["canal_id"], True)
    svc.marcar_vencido(mundo["ventas"], mundo["canal_id"], True)
    with db_session:
        c = Canal[mundo["canal_id"]]
        assert c.vencido is True and c.pausa is False and c.inactivo is False
    with pytest.raises(HTTPException) as e:
        svc.marcar_vencido(mundo["mkt"], mundo["canal_id"], False)
    assert e.value.status_code == 403
    svc.marcar_vencido(mundo["ventas"], mundo["canal_id"], False)
