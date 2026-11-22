"""Onboarding del equipo del cliente: el coach se lo pide a un miembro, al miembro le queda pendiente hasta
que lo completa, y el titular no lo ve. Base local de prueba, nunca Neon."""

import secrets

import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import db, init_db
from src.services.onboarding_equipo_service import OnboardingEquipoServices

svc = OnboardingEquipoServices()
CLIENTE = 999994101
_P = f"test-onb-equipo-{secrets.token_hex(3)}"


@pytest.fixture()
def miembro():
    if db.provider is None:
        init_db()
    from src.models import MiembroCliente, OnboardingMiembro

    with db_session:
        m = MiembroCliente(cliente_id=CLIENTE, email=f"{_P}@atvos-prueba.com", nombre="Yousef", rol="socio")
        m.flush()
        mid = m.id
    yield mid
    with db_session:
        o = OnboardingMiembro.get(miembro_id=mid)
        if o:
            o.delete()
        MiembroCliente[mid].delete()


COACH = {"usuario_id": 1, "rol": "coach"}


def test_pedido_pendiente_y_completado(miembro):
    sesion = {"usuario_id": CLIENTE, "rol": "mid", "miembro_id": miembro}
    assert svc.pendiente(sesion)["pendiente"] is None
    fila = next(m for m in svc.pedir(COACH, miembro)["miembros"] if m["id"] == miembro)
    assert fila["estado"] == "pedido"
    assert svc.pendiente(sesion)["pendiente"] is not None
    assert svc.pendiente({"usuario_id": CLIENTE, "rol": "mid"})["pendiente"] is None  # el titular no lo ve
    with pytest.raises(HTTPException):
        svc.responder(sesion, {})
    svc.responder(sesion, {"1": "Yousef | +34 600 | y@x.com", "36": "Depender de ads, Falta de equipo", "99": "no entra"})
    assert svc.pendiente(sesion)["pendiente"] is None
    fila = next(m for m in svc.de_cliente(CLIENTE)["miembros"] if m["id"] == miembro)
    assert fila["estado"] == "completado" and fila["respuestas"]["36"] == "Depender de ads, Falta de equipo" and "99" not in fila["respuestas"]
    with pytest.raises(HTTPException):
        svc.cancelar(miembro)  # lo completado no se borra


def test_cancelar_un_pedido(miembro):
    svc.pedir(COACH, miembro)
    fila = next(m for m in svc.cancelar(miembro)["miembros"] if m["id"] == miembro)
    assert fila["estado"] is None
