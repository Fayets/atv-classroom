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


def test_pase_firmado_vence_y_no_se_puede_falsificar():
    from src.services.tools_pase import firmar, verificar

    p = firmar({"tool": "bottleneck", "cliente_id": 29}, "clave", ahora=1000)
    assert verificar(p, "clave", ahora=1030)["cliente_id"] == 29
    assert verificar(p, "clave", ahora=1061) is None  # venció a los 60 s
    assert verificar(p, "otra-clave", ahora=1030) is None
    cuerpo, firma = p.split(".")
    assert verificar(cuerpo[:-2] + "xx." + firma, "clave", ahora=1030) is None


def test_sin_proyecto_de_agentes_configurado_dice_muy_pronto(monkeypatch):
    monkeypatch.setattr(t, "TOOLS_URL", "")
    with pytest.raises(HTTPException) as e:
        t.pase({"rol": "admin", "usuario_id": 1}, "bottleneck")
    assert e.value.status_code == 409


def test_pase_del_equipo_lleva_a_la_tool(monkeypatch):
    from src.services.tools_pase import verificar

    monkeypatch.setattr(t, "TOOLS_URL", "https://tools.atvos.io")
    monkeypatch.setattr(t, "TOOLS_PASE_SECRET", "clave")
    monkeypatch.setattr(t, "TOOLS_ACTIVAS", {"bottleneck"})
    url = t.pase({"rol": "admin", "usuario_id": 7, "nombre": "Franco"}, "bottleneck")["url"]
    assert url.startswith("https://tools.atvos.io/bottleneck?pase=")
    datos = verificar(url.split("pase=")[1], "clave")
    assert datos["tipo"] == "equipo" and datos["admin_id"] == 7 and datos["tool"] == "bottleneck"
    with pytest.raises(HTTPException):
        t.pase({"rol": "admin", "usuario_id": 7}, "audiencia")  # no está activa todavía
