"""Cerebro del admin: el grafo sale de los datos reales y cada neurona se puede abrir.
Solo lectura: estos tests no escriben nada en la base."""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from src.db import db, init_db
from src.services import cerebro_service as cs
from src.services.auth_service import obtener_sesion_desde_request

svc = cs.CerebroServices()


@pytest.fixture(scope="module", autouse=True)
def _base():
    if db.provider is None:
        init_db()
    yield


@pytest.fixture(scope="module")
def grafo():
    return svc.grafo()


def test_el_grafo_tiene_el_conocimiento_y_los_clientes(grafo):
    tipos = grafo["resumen"]["por_tipo"]
    for tipo in ("modulo", "clase", "concepto", "frente", "coach", "plan"):
        assert tipos.get(tipo, 0) > 0, tipo
    ids = {n["id"] for n in grafo["nodos"]}
    assert len(ids) == len(grafo["nodos"]), "ids repetidos"
    # Ningún enlace apunta a una neurona que no existe, ni a sí misma.
    for e in grafo["enlaces"]:
        assert e["a"] in ids and e["b"] in ids and e["a"] != e["b"]
    assert grafo["resumen"]["neuronas"] == len(grafo["nodos"])
    assert grafo["resumen"]["conexiones"] == len(grafo["enlaces"])


def test_cada_clase_cuelga_de_su_modulo(grafo):
    contiene = {(e["a"], e["b"]) for e in grafo["enlaces"] if e["tipo"] == "contiene"}
    clases = [n["id"] for n in grafo["nodos"] if n["tipo"] == "clase"]
    sueltas = [c for c in clases if not any(b == c or a == c for a, b in contiene)]
    assert not sueltas


def test_abrir_una_clase_trae_su_contenido_y_vecinas(grafo):
    clase = next(n for n in grafo["nodos"] if n["tipo"] == "clase")
    nodo = svc.nodo(clase["id"])
    assert nodo["nombre"] == clase["nombre"]
    assert nodo["detalle"].get("enlace", "").startswith("/classroom/")
    assert any(v["tipo"] == "modulo" for v in nodo["vecinos"])
    for v in nodo["vecinos"]:
        assert {"id", "tipo", "nombre", "vinculo", "veces", "creado_en"} <= v.keys()


def test_abrir_un_concepto_trae_su_definicion(grafo):
    concepto = next(n for n in grafo["nodos"] if n["tipo"] == "concepto")
    nodo = svc.nodo(concepto["id"])
    assert nodo["detalle"].get("definicion")
    assert any(v["tipo"] == "clase" for v in nodo["vecinos"])


def test_neurona_inexistente_da_404():
    with pytest.raises(HTTPException) as e:
        svc.nodo("clase:no-existe-jamas")
    assert e.value.status_code == 404


def test_los_conceptos_aparecen_en_texto_de_cliente():
    hallados = cs.conceptos_en("no sé cuánto cobrar por mi servicio, me da miedo subir el precio")
    assert hallados, "la frase de un cliente sobre precio debería tocar algún concepto"


def test_solo_el_admin_puede_ver_el_cerebro():
    import main

    http = TestClient(main.app)
    try:
        main.app.dependency_overrides[obtener_sesion_desde_request] = lambda: {"usuario_id": 1, "nombre": "Coach", "email": "c@x.com", "rol": "coach"}
        assert http.get("/api/admin/cerebro").status_code == 403
        assert http.get("/api/admin/cerebro/nodo", params={"id": "coach:juan"}).status_code == 403
        main.app.dependency_overrides[obtener_sesion_desde_request] = lambda: {"usuario_id": 1, "nombre": "Cliente", "email": "c@x.com", "rol": "mid"}
        assert http.get("/api/admin/cerebro").status_code == 403
        main.app.dependency_overrides[obtener_sesion_desde_request] = lambda: {"usuario_id": 1, "nombre": "Admin", "email": "a@x.com", "rol": "admin"}
        r = http.get("/api/admin/cerebro")
        assert r.status_code == 200 and r.json()["nodos"]
    finally:
        main.app.dependency_overrides.clear()
    assert http.get("/api/admin/cerebro").status_code == 401
