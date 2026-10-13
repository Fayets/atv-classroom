"""Roadmap tipo Miro: versiones por coach y título, el vigente, el que hay que seguir, y quién lo ve."""

import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db
from src.services.roadmap_service import RoadmapServices

CLIENTE = 999995001
EQUIPO = {"usuario_id": 62, "rol": "admin", "nombre": "Admin", "email": "a@x.com"}
TITULAR = {"usuario_id": CLIENTE, "rol": "boost", "nombre": "Cliente", "email": "c@x.com"}
OTRO = {"usuario_id": CLIENTE + 1, "rol": "boost", "nombre": "Otro", "email": "o@x.com"}
DOC = "https://docs.google.com/document/d/1abcdefghijklmnopqrstuv/edit"


@pytest.fixture(autouse=True)
def _base():
    if db.provider is None:
        init_db()
    yield
    with db_session:
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."roadmap_docs" WHERE cliente_id = $c', {"c": CLIENTE})


def test_versiones_vigente_y_el_que_hay_que_seguir():
    svc = RoadmapServices()
    svc.crear(EQUIPO, CLIENTE, {"titulo": "Roadmap inicial", "tipo": "inicial", "url": DOC, "fecha": "2026-08-15"})
    svc.crear(EQUIPO, CLIENTE, {"titulo": "Ventas", "url": DOC, "fecha": "2026-09-01"})
    r = svc.crear(EQUIPO, CLIENTE, {"titulo": "ventas", "url": DOC, "fathom_url": "https://fathom.video/share/abc", "fecha": "2026-10-01", "pasos_total": 7, "paso_actual": 3})
    assert r["principal"]["fathom_url"] == "https://fathom.video/share/abc"
    docs = r["grupos"][0]["docs"]
    assert [(d["titulo"].lower(), d["version"], d["estado"]) for d in docs] == [
        ("roadmap inicial", 1, "vigente"), ("ventas", 1, "reemplazado"), ("ventas", 2, "vigente")]
    assert r["principal"]["fecha"] == "2026-10-01" and r["vigentes"] == 2
    inicial = docs[0]["id"]
    r = svc.editar(EQUIPO, inicial, {"principal": True})
    assert r["principal"]["id"] == inicial
    with pytest.raises(HTTPException):
        svc.editar(EQUIPO, inicial, {"pasos_total": 2, "paso_actual": 5})


def test_lo_ve_el_cliente_y_lo_carga_solo_el_equipo():
    svc = RoadmapServices()
    svc.crear(EQUIPO, CLIENTE, {"titulo": "Ventas", "url": DOC})
    assert svc.ver(TITULAR)["total"] == 1
    assert svc.ver({**TITULAR, "miembro_id": 3})["total"] == 1  # su equipo también
    with pytest.raises(HTTPException):
        svc.ver(OTRO, CLIENTE)
    with pytest.raises(HTTPException):
        svc.crear(TITULAR, CLIENTE, {"titulo": "Mío", "url": DOC})
    with pytest.raises(HTTPException):
        svc.crear(EQUIPO, CLIENTE, {"titulo": "Sin link", "url": "no es un link"})
    with pytest.raises(HTTPException):
        svc.crear(EQUIPO, CLIENTE, {"titulo": "Fathom roto", "url": DOC, "fathom_url": "fathom"})
