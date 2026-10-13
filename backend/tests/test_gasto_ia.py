"""Gasto de la IA: se registran los tokens reales y el historial de Discord frena en el tope diario."""

from types import SimpleNamespace

import pytest
from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db
from src.services import aprendizaje_service as ap
from src.services import gasto_ia


@pytest.fixture(autouse=True)
def _base():
    if db.provider is None:
        init_db()
    yield
    with db_session:
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."cerebro_gasto" WHERE uso = \'prueba-test\'')


def test_registra_y_suma_por_dia():
    u = SimpleNamespace(input_tokens=1000, cache_creation_input_tokens=0, cache_read_input_tokens=2000, output_tokens=500)
    gasto_ia.registrar("prueba-test", u)
    gasto_ia.registrar("prueba-test", u)
    fila = next(f for f in gasto_ia.resumen(1) if f["uso"] == "prueba-test")
    assert (fila["llamadas"], fila["entrada"], fila["cache_leida"], fila["salida"]) == (2, 2000, 4000, 1000)
    esperado = (2000 * gasto_ia.PRECIOS["entrada"] + 4000 * gasto_ia.PRECIOS["cache_leida"] + 1000 * gasto_ia.PRECIOS["salida"]) / 1e6
    assert gasto_ia.gastado_hoy("prueba-test") == pytest.approx(esperado)


def test_el_historial_frena_en_el_tope_y_lo_nuevo_sigue(monkeypatch):
    aprendidos = []
    monkeypatch.setattr(ap.db, "select", lambda *a, **k: [(10, True), (11, False), (12, False)])
    monkeypatch.setattr(ap, "aprender_canal", lambda c, llamar: aprendidos.append(c) or {"canal": c, "hechos": 0})
    monkeypatch.setattr(ap, "actualizar_voces", lambda: 0)
    monkeypatch.setattr(ap.gasto_ia, "gastado_hoy", lambda uso: ap.TOPE_DIARIO_USD + 0.01)
    r = ap.ciclo(llamar=lambda p: None)
    assert aprendidos == [10]  # el chat con mensajes nuevos del classroom se aprende igual
    assert r["tope_alcanzado"] and r["pendientes"] == 2

    aprendidos.clear()
    monkeypatch.setattr(ap.gasto_ia, "gastado_hoy", lambda uso: 0.0)
    assert not ap.ciclo(llamar=lambda p: None)["tope_alcanzado"]
    assert aprendidos == [10, 11, 12]
