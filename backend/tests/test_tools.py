"""Sección Tools: arranca oculta, se prende desde el admin y cada tool tiene un estado por plan."""

import pytest
from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db
from src.services import tools_service as t


@pytest.fixture(autouse=True)
def limpio():
    # Nunca contra Neon: estas filas viven en permisos_plan, la misma tabla de los permisos de verdad.
    if config("DB_HOST", default="") not in ("127.0.0.1", "localhost"):
        pytest.skip("Solo con la base local.")
    if db.provider is None:
        init_db()
    borrar = f"DELETE FROM \"{DB_SCHEMA}\".\"permisos_plan\" WHERE plan = '*' OR clave LIKE 'tool:%'"
    with db_session:
        db.execute(borrar)
    yield
    with db_session:
        db.execute(borrar)


def test_arranca_oculta_para_el_cliente():
    with pytest.raises(HTTPException) as e:
        t.para_cliente("boost")
    assert e.value.status_code == 404
    assert t.para_equipo()["visible"] is False and len(t.para_equipo()["tools"]) == len(t.TOOLS)


def test_prendida_respeta_el_estado_por_plan():
    t.guardar(True, [{"plan": "boost", "tool": "audiencia", "estado": "incluida"},
                     {"plan": "boost", "tool": "competencia", "estado": "oculta"}], {"bottleneck": "USD 97/mes"})
    vista = {x["id"]: x for x in t.para_cliente("boost")["tools"]}
    assert vista["audiencia"]["estado"] == "incluida"
    assert "competencia" not in vista
    assert vista["bottleneck"]["estado"] == "paga" and vista["bottleneck"]["precio"] == "USD 97/mes"
    # High Level se guarda como "high" aunque el plan crudo sea advantage.
    assert {x["id"] for x in t.para_cliente("advantage")["tools"]} == {x["id"] for x in t.TOOLS}


def test_apagar_la_seccion_la_esconde_de_nuevo():
    t.guardar(True, [], {})
    t.guardar(False, [], {})
    assert not t.visible()


def test_cambio_invalido():
    with pytest.raises(HTTPException):
        t.guardar(None, [{"plan": "boost", "tool": "audiencia", "estado": "gratis"}], {})
