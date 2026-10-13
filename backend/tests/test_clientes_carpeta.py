"""Carpeta Clientes del escritorio: lista, ficha completa y solo para el admin. Solo lectura."""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from src.db import db, init_db
from src.services.auth_service import obtener_sesion_desde_request
from src.services.clientes_service import ClientesServices

svc = ClientesServices()


@pytest.fixture(scope="module", autouse=True)
def _base():
    if db.provider is None:
        init_db()


def test_la_carpeta_trae_a_todos_con_su_estado():
    carpeta = svc.carpeta()
    assert carpeta
    for c in carpeta:
        assert {"id", "nombre", "plan", "estado", "estado_texto", "vence", "responsable"} <= c.keys()
        assert c["nombre"]


def test_la_ficha_trae_todo_y_nada_secreto():
    cliente = svc.carpeta()[0]
    f = svc.ficha(cliente["id"])
    assert f["cliente"]["id"] == cliente["id"]
    assert "password_hash" not in f["cliente"] and "session_id" not in f["cliente"]
    for parte in ("pagos", "cuotas", "observaciones", "proximos_pasos", "archivos"):
        assert isinstance(f[parte], list)
    assert {"clases_completadas", "ultimas_clases", "frentes", "consultas_guia"} <= f["classroom"].keys()


def test_cliente_inexistente_da_404():
    with pytest.raises(HTTPException) as e:
        svc.ficha(999999999)
    assert e.value.status_code == 404


def test_solo_el_admin_abre_la_carpeta():
    import main

    http = TestClient(main.app)
    try:
        for rol in ("coach", "mid"):
            main.app.dependency_overrides[obtener_sesion_desde_request] = lambda rol=rol: {"usuario_id": 1, "nombre": "X", "email": "x@x.com", "rol": rol}
            assert http.get("/api/admin/clientes").status_code == 403
            assert http.get("/api/admin/clientes/1").status_code == 403
    finally:
        main.app.dependency_overrides.clear()
    assert http.get("/api/admin/clientes").status_code == 401
