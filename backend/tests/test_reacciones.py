"""Reacciones como en Discord y el equipo del cliente viendo la comunidad igual que el titular.
Solo contra una base local (corta si DB_HOST no es 127.0.0.1). Todo lo creado se borra al final."""

import secrets

import pytest
from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.db import db, init_db
from src.services.mensajeria_service import MensajeriaServices
from src.services import mensajeria_service as ms
from src.services.tiempo_real import puede_ver

_P = f"test-reac-{secrets.token_hex(3)}"
svc = MensajeriaServices()
ADMIN = {"usuario_id": 999999301, "nombre": "Admin", "email": "a@atvos-prueba.com", "rol": "admin"}
CLIENTE = {"usuario_id": 999999302, "nombre": "Cliente", "email": "c@atvos-prueba.com", "rol": "boost"}
MIEMBRO = {**CLIENTE, "nombre": "Setter", "miembro_id": 999999303}
OTRO = {"usuario_id": 999999304, "nombre": "Otro", "email": "o@atvos-prueba.com", "rol": "mid"}


@pytest.fixture(scope="module", autouse=True)
def _base():
    if config("DB_HOST") != "127.0.0.1":
        pytest.skip("Solo contra una base local")
    if db.provider is None:
        init_db()
    yield
    from src.models import Canal, MensajeCanal, Reaccion

    with db_session:
        canales = [c for c in list(Canal.select()) if c.nombre.startswith(_P)]
        ids = {c.id for c in canales}
        for r in list(Reaccion.select()):
            if r.canal_id in ids:
                r.delete()
        for m in list(MensajeCanal.select()):
            if m.canal.id in ids:
                m.delete()
        for c in canales:
            c.delete()


@pytest.fixture(autouse=True)
def _sin_tope(monkeypatch):
    monkeypatch.setattr(ms, "_TOPE_EQUIPO_POR_MINUTO", 1000)


def _canal(tipo, roles=None):
    from src.models import Canal

    with db_session:
        c = Canal(tipo=tipo, nombre=f"{_P}-{tipo}-{secrets.token_hex(2)}", roles_json=None if roles is None else __import__("json").dumps(roles))
        db.flush()
        return c.id


def test_cliente_reacciona_en_anuncios_donde_no_escribe():
    cid = _canal("anuncios")
    m, _ = svc.enviar(ADMIN, cid, "Nueva clase", None)
    assert svc.mensajes(CLIENTE, cid)["puede_escribir"] is False
    ev, _ = svc.reaccionar(CLIENTE, m["id"], "🔥")
    assert ev["reacciones"] == [{"emoji": "🔥", "quienes": ["cliente:999999302"], "nombres": [ev["reacciones"][0]["nombres"][0]]}]
    # el setter del mismo cliente reacciona por su lado
    ev, _ = svc.reaccionar(MIEMBRO, m["id"], "🔥")
    assert ev["reacciones"][0]["quienes"] == ["cliente:999999302", "miembro:999999303"]
    # tocar de nuevo la saca, solo la suya
    ev, _ = svc.reaccionar(CLIENTE, m["id"], "🔥")
    assert ev["reacciones"][0]["quienes"] == ["miembro:999999303"]
    # y viene con el mensaje al listar
    lista = svc.mensajes(ADMIN, cid)["mensajes"]
    assert lista[-1]["reacciones"][0]["emoji"] == "🔥"


def test_reaccion_invalida_y_canal_ajeno():
    cid = _canal("grupo", ["equipo", "high"])
    m, _ = svc.enviar(ADMIN, cid, "solo high", None)
    with pytest.raises(HTTPException) as e:
        svc.reaccionar(ADMIN, m["id"], "hola")
    assert e.value.status_code == 422
    with pytest.raises(HTTPException) as e:
        svc.reaccionar(OTRO, m["id"], "👍")  # mid no ve un canal de high
    assert e.value.status_code == 404


def test_miembro_ve_la_comunidad_como_el_titular():
    for canal in ({"id": 1, "tipo": "anuncios", "cliente_id": None, "roles": []},
                  {"id": 2, "tipo": "grupo", "cliente_id": None, "roles": ["boost"]},
                  {"id": 3, "tipo": "cliente", "cliente_id": 999999302, "roles": []}):
        assert puede_ver(MIEMBRO, canal) == puede_ver(CLIENTE, canal) is True
    assert puede_ver(MIEMBRO, {"id": 4, "tipo": "grupo", "cliente_id": None, "roles": ["mid"]}) is False
    assert puede_ver(MIEMBRO, {"id": 5, "tipo": "directo", "cliente_id": None, "roles": [], "participantes": [999999302]}) is False
