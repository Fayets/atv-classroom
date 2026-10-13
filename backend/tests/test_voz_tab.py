"""Cada persona del equipo elige con la voz de quién le sugiere el Tab (por defecto, la propia)."""

import pytest
from fastapi import HTTPException
from pony.orm import commit, db_session

from src.db import DB_SCHEMA, db, init_db
from src.models import Admin, VozEquipo
from src.services import cuenta_service as cs
from src.services import sugerencias_service as sg

MAILS = ("voz-yo@atvos-prueba.com", "voz-juan@atvos-prueba.com", "voz-sin@atvos-prueba.com")


@pytest.fixture()
def equipo():
    if db.provider is None:
        init_db()
    with db_session:
        yo, juan, sin = (Admin(email=m, nombre=n, rol="coach") for m, n in zip(MAILS, ("Yo Prueba", "Juan Prueba", "Sin Voz")))
        commit()
        VozEquipo(admin_id=juan.id, rasgos_json='{"palabras_promedio": 9}', muestras_json="[]", mensajes_analizados=50)
        commit()
        ids = (yo.id, juan.id, sin.id)
    yield ids
    with db_session:
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."cerebro_voz" WHERE admin_id = ANY($ids)', {"ids": list(ids)})
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."admins" WHERE email = ANY($m)', {"m": list(MAILS)})


def test_elige_la_voz_de_otro_y_vuelve_a_la_propia(equipo):
    yo, juan, sin = equipo
    sesion = {"usuario_id": yo, "rol": "coach", "nombre": "Yo Prueba", "email": MAILS[0]}
    svc = cs.CuentaServices()
    assert svc.voces(sesion)["elegida"] == yo
    assert svc.elegir_voz(sesion, juan)["elegida"] == juan
    with pytest.raises(HTTPException):
        svc.elegir_voz(sesion, sin)  # sin voz aprendida
    with pytest.raises(HTTPException):
        svc.voces({"usuario_id": 1, "rol": "boost"})  # un cliente no
    assert svc.elegir_voz(sesion, None)["elegida"] == yo


def test_el_tab_escribe_con_la_voz_elegida(equipo, monkeypatch):
    yo, juan, _ = equipo
    with db_session:
        Admin[yo].voz_tab = juan
    usados = {}
    monkeypatch.setattr(sg.ap, "contexto_para_responder", lambda canal, voz, incluir_nicho=True: usados.setdefault("voz", voz) and {"voz": {}, "conversacion": []})
    monkeypatch.setattr(sg, "config", lambda *a, **k: "clave")
    sistema, _, sid = sg.SugerenciasServices().preparar({"usuario_id": yo, "rol": "coach"}, {"id": 1, "tipo": "cliente"}, "")
    assert usados["voz"] == juan and sistema.startswith("Sos Juan")
    with db_session:
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."cerebro_sugerencias" WHERE id = $i', {"i": sid})
