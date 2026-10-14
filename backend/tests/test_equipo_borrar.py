"""Borrar del equipo a alguien dado de baja: desaparece de la lista pero su fila queda (historial)."""
import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db
from src.services.equipo_service import EquipoServices

if db.provider is None:
    init_db()
MAIL = "borrar-test@atvos-prueba.com"


@pytest.fixture
def miembro():
    svc = EquipoServices()
    m = svc.crear({"email": MAIL, "nombre": "Borrar Test", "rol": "coach", "area": None})
    yield svc, m
    with db_session:
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."admins" WHERE email = $m', {"m": MAIL})


def test_se_borra_solo_dado_de_baja_y_puede_volver(miembro):
    svc, m = miembro
    yo = {"usuario_id": -1, "rol": "admin"}
    with pytest.raises(HTTPException) as e:
        svc.borrar(m["id"], yo)  # activo: primero hay que darlo de baja
    assert e.value.status_code == 409
    svc.actualizar(m["id"], {"activo": False}, yo)
    svc.borrar(m["id"], yo)
    assert all(x["email"] != MAIL for x in svc.listar())
    with db_session:
        assert db.select(f'SELECT borrado FROM "{DB_SCHEMA}"."admins" WHERE email = $m', {"m": MAIL}) == [True]
    vuelve = svc.crear({"email": MAIL, "nombre": "Borrar Test", "rol": "coach", "area": None})
    assert vuelve["id"] == m["id"] and vuelve["activo"] is True  # reusa su fila y su historial
