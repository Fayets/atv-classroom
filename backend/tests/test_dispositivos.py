"""Dispositivos: se anota el equipo y la ciudad de cada sesión, la cuenta se marca para revisar con 4+
dispositivos o 3+ ciudades del titular en 7 días, y cerrar una sesión la corta también en memoria.
Solo contra una base local. Lo creado se borra al final."""

import time
from types import SimpleNamespace

import pytest
from decouple import config
from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db
from src.services import auth_service, dispositivos_service as ds

CLIENTE = 999999501
UAS = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0",
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
]


@pytest.fixture(scope="module", autouse=True)
def _base():
    if config("DB_HOST") != "127.0.0.1":
        pytest.skip("Solo contra una base local")
    if db.provider is None:
        init_db()
    yield
    with db_session:
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."sesiones" WHERE usuario_id = $c', {"c": CLIENTE})


def test_describe_dispositivos():
    assert ds.describir(UAS[0]) == ("iPhone", "Safari")
    assert ds.describir(UAS[1]) == ("Mac", "Chrome")
    assert ds.describir(UAS[2]) == ("Windows", "Edge")
    assert ds.describir(UAS[3]) == ("Android", "Chrome")


def test_alerta_y_cerrar(monkeypatch):
    ciudades = iter([("Córdoba", "AR"), ("Lima", "PE"), ("Rosario", "AR"), ("Córdoba", "AR")])
    monkeypatch.setattr(ds, "_ubicar", lambda ip: next(ciudades))
    datos = {"usuario_id": CLIENTE, "tipo": "cliente", "rol": "boost", "nombre": "Prueba", "email": "p@atvos-prueba.com"}
    tokens = [auth_service._crear_token(datos) for _ in UAS]
    for tok, ua in zip(tokens, UAS):
        req = SimpleNamespace(headers={"user-agent": ua, "x-real-ip": "8.8.8.8"}, client=None)
        ds.registrar(auth_service._hash_token(tok), req)
    time.sleep(1.5)  # se anota en segundo plano
    info = ds.de_cliente(CLIENTE)
    assert len(info["dispositivos"]) == 4 and info["alerta"] == "alta" and info["ciudades_7d"] == 3
    assert ds.alertas_por_cliente().get(CLIENTE) == "alta"
    sesion = {"usuario_id": CLIENTE, "tipo": "cliente"}
    mios = ds.mios(sesion, auth_service._hash_token(tokens[0]))
    assert sum(d["actual"] for d in mios) == 1
    otro = next(d for d in mios if not d["actual"])
    ds.cerrar_mio(sesion, otro["id"])
    assert len(ds.mios(sesion, "")) == 3
    with db_session:
        vivos = set(db.select(f'SELECT token_hash FROM "{DB_SCHEMA}"."sesiones" WHERE usuario_id = {CLIENTE}'))
    cerrado = next(t for t in tokens if auth_service._hash_token(t) not in vivos)
    assert auth_service._obtener_sesion(cerrado) is None  # cortado también en memoria
