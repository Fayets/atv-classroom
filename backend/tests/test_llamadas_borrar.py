"""Borrar una llamada del classroom: cada uno las suyas (un admin, cualquiera), y la sincronización con
Fathom no la vuelve a traer; si pegan su link a mano, sí."""

import secrets

import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import db, init_db
from src.services import fathom_service as fs
from src.services.llamadas_service import LlamadasServices

_P = f"test-borrar-{secrets.token_hex(3)}"
svc = LlamadasServices()
COACH = {"usuario_id": 999990301, "rol": "coach"}
OTRO = {"usuario_id": 999990302, "rol": "coach"}
ADMIN = {"usuario_id": 999990303, "rol": "admin"}


@pytest.fixture(autouse=True)
def _base():
    if db.provider is None:
        init_db()
    yield
    from src.models import Llamada, LlamadaBorrada

    with db_session:
        for x in list(Llamada.select()):
            if x.fathom_id.startswith(_P):
                x.delete()
        for x in list(LlamadaBorrada.select()):
            if x.fathom_id.startswith(_P):
                x.delete()


def _llamada(fid, admin_id):
    from src.models import Llamada

    with db_session:
        ll = Llamada(admin_id=admin_id, fathom_id=fid, titulo="prueba")
        ll.flush()
        return ll.id


def test_cada_uno_borra_las_suyas_y_no_vuelven_por_la_sincronizacion():
    from src.models import Llamada, LlamadaBorrada

    fid = f"{_P}-1"
    lid = _llamada(fid, COACH["usuario_id"])
    with pytest.raises(HTTPException) as e:
        svc.borrar(OTRO, lid)
    assert e.value.status_code == 403
    with pytest.raises(HTTPException) as e:
        svc.borrar({"usuario_id": 1, "rol": "boost"}, lid)
    assert e.value.status_code == 403
    svc.borrar(COACH, lid)
    with db_session:
        assert Llamada.get(id=lid) is None and LlamadaBorrada.get(fathom_id=fid) is not None
        # la sincronización (o el webhook) la vuelve a ver: no entra
        assert fs._guardar(COACH["usuario_id"], {"recording_id": fid, "title": "de nuevo"}, {}) is False
        assert Llamada.get(fathom_id=fid) is None
        # pegando el link a mano, sí vuelve y se olvida que estaba borrada
        assert fs._guardar(COACH["usuario_id"], {"recording_id": fid, "title": "de nuevo"}, {}, aunque_borrada=True) is True
        assert Llamada.get(fathom_id=fid) is not None and LlamadaBorrada.get(fathom_id=fid) is None


def test_un_admin_borra_cualquiera():
    lid = _llamada(f"{_P}-2", COACH["usuario_id"])
    assert svc.borrar(ADMIN, lid) == {"ok": True}
    with pytest.raises(HTTPException) as e:
        svc.borrar(ADMIN, lid)
    assert e.value.status_code == 404
