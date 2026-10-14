"""Avisos por mail: solo lo que el cliente no leyó, con demora, sin repetir y nunca si está conectado."""
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db
from src.models import Canal, MensajeCanal
from src.services import avisos_service as av

if db.provider is None:
    init_db()
CLI = 999999301


@pytest.fixture
def chat(monkeypatch):
    monkeypatch.setattr(av.ClienteExterno, "get", staticmethod(lambda **kw: SimpleNamespace(email="cliente@ejemplo.com", nombre="Ana Prueba") if kw.get("id") == CLI else None))
    monkeypatch.setattr(av, "_tiene_acceso", lambda c: True)
    with db_session:
        c = Canal(tipo="cliente", cliente_id=CLI, nombre="Ana Prueba")
        db.flush()
        canal_id = c.id
    yield canal_id
    with db_session:
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = $c', {"c": canal_id})
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."lecturas_canal" WHERE canal_id = $c', {"c": canal_id})
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."avisos_mail" WHERE canal_id = $c', {"c": canal_id})
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."canales" WHERE id = $c', {"c": canal_id})


def _mensaje(canal_id, hace_min, autor_tipo="admin", texto="Te dejé el roadmap"):
    with db_session:
        m = MensajeCanal(canal=Canal[canal_id], autor_tipo=autor_tipo, autor_id=62 if autor_tipo == "admin" else CLI, texto=texto,
                         creado_en=datetime.utcnow() - timedelta(minutes=hace_min))
        db.flush()
        return m.id


def test_avisa_una_vez_lo_que_no_leyo_y_respeta_conectados_y_lecturas(chat):
    salieron = []
    mandar = lambda para, asunto, cuerpo: salieron.append((para, asunto, cuerpo))
    _mensaje(chat, 3)  # muy reciente: todavía no
    assert av.ciclo(set(), mandar=mandar) == 0
    ultimo = _mensaje(chat, 15, texto="¿Pudiste ver el Typeform?")
    assert av.ciclo({CLI}, mandar=mandar) == 0  # está conectado: no
    assert av.ciclo(set(), mandar=mandar) == 1
    assert salieron[0][0] == "cliente@ejemplo.com" and "te dejó 2 mensajes" in salieron[0][1]
    assert av.ciclo(set(), mandar=mandar) == 0  # ya se le avisó
    # Un mensaje nuevo dentro de las 3 horas no genera otro mail.
    _mensaje(chat, 12, texto="otro")
    assert av.ciclo(set(), mandar=mandar) == 0
    # Si lo leyó, nunca se avisa.
    with db_session:
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."avisos_mail" WHERE canal_id = $c', {"c": chat})
        db.execute(f'INSERT INTO "{DB_SCHEMA}"."lecturas_canal" (canal_id, lector_tipo, lector_id, ultimo_leido_id) VALUES ($c, \'cliente\', $cli, 2147483000)', {"c": chat, "cli": CLI})
    assert av.ciclo(set(), mandar=mandar) == 0


def test_si_el_ultimo_lo_escribio_el_cliente_no_se_avisa(chat):
    _mensaje(chat, 30)
    _mensaje(chat, 20, autor_tipo="cliente", texto="gracias!")
    assert av.ciclo(set(), mandar=lambda *a: (_ for _ in ()).throw(AssertionError("no debía mandar"))) == 0
