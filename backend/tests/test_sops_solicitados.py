"""Carpeta "SOPs solicitados": la ve todo el equipo, cambia de estado y guarda el link del SOP entregado."""
import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db
from src.models import SolicitudSop
from src.services.solicitud_service import SolicitudServices

if db.provider is None:
    init_db()
COACH = {"usuario_id": 999990077, "rol": "coach", "nombre": "Coach", "email": "c@x.com"}
CLIENTE = {"usuario_id": 999999401, "rol": "boost", "nombre": "Cliente", "email": "cl@x.com"}


@pytest.fixture
def solicitud():
    with db_session:
        s = SolicitudSop(usuario_id=CLIENTE["usuario_id"], tipo_usuario="cliente", nombre="GUION DE SETTING", area="ventas", problema="No sé qué responder", consulta="¿cómo respondo a un lead frío?")
        db.flush()
        sid = s.id
    yield sid
    with db_session:
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."solicitud_sop" WHERE id = $i', {"i": sid})


def test_el_equipo_la_ve_y_la_entrega_con_el_link(solicitud):
    svc = SolicitudServices()
    with pytest.raises(HTTPException):
        svc.listar(CLIENTE)  # el cliente no ve la carpeta
    fila = next(x for x in svc.listar(COACH)["solicitudes"] if x["id"] == solicitud)
    assert fila["estado"] == "pendiente" and fila["area_nombre"] == "Ventas" and fila["consulta"].startswith("¿cómo")
    with pytest.raises(HTTPException):
        svc.actualizar(COACH, solicitud, "entregado", "no es un link")
    r = svc.actualizar(COACH, solicitud, "entregado", "https://docs.google.com/sop-setting")
    assert r["estado"] == "entregado" and r["entrega_url"].endswith("sop-setting") and r["resuelto_en"]
    r = svc.actualizar(COACH, solicitud, "en_proceso", None)
    assert r["resuelto_en"] is None and r["entrega_url"]  # el link queda guardado
