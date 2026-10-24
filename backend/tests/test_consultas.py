"""Consultas al cerebro: la IA solo lee las vistas permitidas, en solo lectura y sin plata para quien no la ve.
Acá no se llama a la IA: se prueban los candados de la consulta SQL."""

import pytest

from src.db import db, init_db
from src.services import cerebro_chat_service as c

COACH = {"usuario_id": 1, "rol": "coach", "area": "fulfillment"}
ADMIN = {"usuario_id": 1, "rol": "admin", "area": "sistemas"}


@pytest.fixture(autouse=True, scope="module")
def _base():
    if db.provider is None:
        init_db()


def test_cuenta_sobre_las_vistas():
    r = c.ejecutar_sql(COACH, "SELECT tipo, count(*) FROM hechos GROUP BY tipo")
    assert not r.get("error") and r["cantidad"] > 0


def test_las_busquedas_con_palabras_no_chocan_con_el_control():
    r = c.ejecutar_sql(COACH, "SELECT count(*) FROM mensajes WHERE texto ILIKE '%no se donde set create%'")
    assert not r.get("error")


@pytest.mark.parametrize("q", [
    "SELECT * FROM classroom.admins",
    'SELECT * FROM "classroom"."sesiones"',
    "SELECT 1; DELETE FROM mensajes",
    "WITH d AS (DELETE FROM hechos RETURNING 1) SELECT * FROM d",
    "SELECT pg_sleep(5)",
    "UPDATE hechos SET texto = ''",
])
def test_bloquea_lo_prohibido(q):
    assert c.ejecutar_sql(COACH, q).get("error")


def test_no_hay_tablas_reales_ni_columnas_sensibles():
    assert c.ejecutar_sql(COACH, "SELECT * FROM admins").get("error")
    assert c.ejecutar_sql(COACH, "SELECT password_hash FROM equipo").get("error")


def test_sin_directos_entre_el_equipo():
    r = c.ejecutar_sql(ADMIN, "SELECT count(*) FROM canales WHERE tipo = 'directo'")
    assert r["filas"] == [[0]]


def test_la_plata_solo_para_quien_la_ve():
    assert c.ejecutar_sql(COACH, "SELECT count(*) FROM pagos").get("error")
    assert c.ejecutar_sql(COACH, "SELECT total_pagado_usd FROM clientes").get("error")
    assert not c.ejecutar_sql(ADMIN, "SELECT count(*) FROM pagos").get("error")


def test_tope_de_filas():
    r = c.ejecutar_sql(COACH, "SELECT id FROM mensajes LIMIT 500")
    assert r["cantidad"] == c.MAX_FILAS and r["hay_mas"]
