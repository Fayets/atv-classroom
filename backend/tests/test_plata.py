"""Plata y notas de la caja: solo admins, Ventas y Sistemas. El resto del equipo ve quién dejó seña,
pero no cuánto ni las notas. Las cuentas de prueba se borran al final."""

import secrets

import pytest
from pony.orm import db_session

from src.db import db, init_db
from src.services.alta_service import AltaServices
from src.services.auth_service import ve_plata

_P = f"test-plata-{secrets.token_hex(3)}"
svc = AltaServices()


@pytest.fixture(scope="module")
def equipo():
    if db.provider is None:
        init_db()
    from src.models import Admin

    sesiones = {}
    with db_session:
        for clave, rol, area in (("admin", "admin", None), ("ventas", "coach", "ventas"), ("sistemas", "coach", "sistemas"),
                                 ("fulfillment", "coach", "fulfillment"), ("sin_area", "coach", None)):
            a = Admin(email=f"{_P}-{clave}@atvos-prueba.com", nombre=clave, rol=rol, area=area)
            a.flush()
            sesiones[clave] = {"usuario_id": a.id, "rol": rol, "nombre": clave, "email": a.email}
    yield sesiones
    with db_session:
        for a in list(Admin.select()):
            if a.email.startswith(_P):
                a.delete()


def test_quien_ve_la_plata(equipo):
    assert ve_plata(equipo["admin"]) and ve_plata(equipo["ventas"]) and ve_plata(equipo["sistemas"])
    assert not ve_plata(equipo["fulfillment"]) and not ve_plata(equipo["sin_area"])
    assert not ve_plata({"usuario_id": 1, "rol": "boost"})


def test_senas_sin_monto_ni_notas_para_el_resto(equipo):
    ocultas = svc.senas(equipo["fulfillment"])
    assert all(s["monto"] is None and s["notas"] is None for s in ocultas)
    completas = svc.senas(equipo["ventas"])
    assert [s["id"] for s in completas] == [s["id"] for s in ocultas]  # ve las mismas señas, sin la plata
    if any(s["monto"] for s in svc.senas(equipo["admin"])):
        assert any(s["monto"] for s in completas)


def test_nuevo_onboarding_muestra_la_sena_a_todo_el_equipo(equipo):
    # Sirve para reconocer la seña que hizo Nick, así que no se esconde.
    assert all("monto" in c for c in svc.buscar_ficha(equipo["fulfillment"], "a"))
