"""2K (backend offer): tiene su canal privado (para pedir sus sesiones 1 a 1) pero no ve la comunidad,
no usa la guía con IA y no suma equipo. Solo contra una base local. Lo creado se borra al final."""

import secrets

import pytest
from decouple import config
from pony.orm import db_session

from src.db import db, init_db
from src.services import mensajeria_service as ms
from src.services.mensajeria_service import MensajeriaServices
from src.services.tiempo_real import puede_ver

svc = MensajeriaServices()
DOSK = {"usuario_id": 999999401, "nombre": "Cliente 2K", "email": "2k@atvos-prueba.com", "rol": "2k"}
ADMIN = {"usuario_id": 999999402, "nombre": "Admin", "email": "a2k@atvos-prueba.com", "rol": "admin"}


@pytest.fixture(scope="module", autouse=True)
def _base():
    if config("DB_HOST") != "127.0.0.1":
        pytest.skip("Solo contra una base local")
    if db.provider is None:
        init_db()
    yield
    from src.models import Canal, MensajeCanal

    with db_session:
        for c in [c for c in list(Canal.select()) if c.cliente_id == DOSK["usuario_id"]]:
            for m in list(MensajeCanal.select()):
                if m.canal.id == c.id:
                    m.delete()
            c.delete()


def test_ve_solo_su_canal():
    assert puede_ver(DOSK, {"id": 1, "tipo": "cliente", "cliente_id": DOSK["usuario_id"], "roles": []})
    for canal in ({"id": 2, "tipo": "anuncios", "cliente_id": None, "roles": []},
                  {"id": 3, "tipo": "grupo", "cliente_id": None, "roles": ["equipo", "high", "boost", "mid", "entry", "mentoria"]},
                  {"id": 4, "tipo": "cliente", "cliente_id": 123, "roles": []}):
        assert not puede_ver(DOSK, canal)


def test_ve_la_guia_para_todos():
    assert puede_ver(DOSK, {"id": 9, "tipo": "anuncios", "cliente_id": None, "roles": ["todos"]})
    assert not puede_ver(DOSK, {"id": 10, "tipo": "anuncios", "cliente_id": None, "roles": []})


def test_escribe_en_su_canal(monkeypatch):
    monkeypatch.setattr(ms, "_TOPE_EQUIPO_POR_MINUTO", 1000)
    monkeypatch.setattr(ms, "_TOPE_POR_MINUTO", 1000)
    from src.models import Canal

    with db_session:
        c = Canal(tipo="cliente", cliente_id=DOSK["usuario_id"], nombre="cliente-2k-prueba")
        db.flush()
        cid = c.id
    svc.enviar(ADMIN, cid, "Te dejé el roadmap", None)
    datos = svc.mensajes(DOSK, cid)
    assert datos["puede_escribir"] is True and datos["mensajes"][-1]["texto"] == "Te dejé el roadmap"
    assert svc.enviar(DOSK, cid, "Quiero agendar mi sesión 2", None)[0]["texto"] == "Quiero agendar mi sesión 2"


def test_sin_equipo():
    from src.services.equipo_cliente_service import limite_de

    assert limite_de("2k") == 0
