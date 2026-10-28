"""Cuánto gasta la IA del classroom: tokens por día y por uso, y su costo en dólares.

Los precios por millón de tokens se pueden cambiar por variable de entorno. Los valores por defecto
salen de lo que marcó la consola de Anthropic con el uso real (13-10-2026).
"""

from datetime import datetime

from decouple import config
from pony.orm import db_session

from src.db import DB_SCHEMA, db

PRECIOS = {  # US$ por millón de tokens
    "entrada": config("PRECIO_ENTRADA_MTOK", default=1.0, cast=float),
    "cache_escrita": config("PRECIO_CACHE_ESCRITA_MTOK", default=1.25, cast=float),
    "cache_leida": config("PRECIO_CACHE_LEIDA_MTOK", default=0.10, cast=float),
    "salida": config("PRECIO_SALIDA_MTOK", default=5.0, cast=float),
}


def hoy():
    return datetime.utcnow().date()


# Los precios de arriba son los de Haiku. Un uso que corre en Sonnet se guarda como "<uso>:sonnet" y cuesta 3 veces más
# (US$ 3 / 15 por millón contra 1 / 5).
FACTOR_MODELO = {"sonnet": 3.0}


def costo(fila: dict) -> float:
    factor = FACTOR_MODELO.get((fila.get("uso") or "").partition(":")[2], 1.0)
    return factor * sum(fila.get(k, 0) * p for k, p in PRECIOS.items()) / 1_000_000


def registrar(uso: str, usage) -> None:
    """Suma el uso de una llamada (el objeto usage de la respuesta de Anthropic)."""
    if usage is None:
        return
    valores = {
        "fecha": hoy(),
        "uso": uso,
        "entrada": usage.input_tokens or 0,
        "cache_escrita": getattr(usage, "cache_creation_input_tokens", 0) or 0,
        "cache_leida": getattr(usage, "cache_read_input_tokens", 0) or 0,
        "salida": usage.output_tokens or 0,
    }
    with db_session:
        db.execute(
            f'INSERT INTO "{DB_SCHEMA}"."cerebro_gasto" (fecha, uso, llamadas, entrada, cache_escrita, cache_leida, salida) '
            "VALUES ($fecha, $uso, 1, $entrada, $cache_escrita, $cache_leida, $salida) "
            "ON CONFLICT (fecha, uso) DO UPDATE SET llamadas = cerebro_gasto.llamadas + 1, "
            "entrada = cerebro_gasto.entrada + EXCLUDED.entrada, cache_escrita = cerebro_gasto.cache_escrita + EXCLUDED.cache_escrita, "
            "cache_leida = cerebro_gasto.cache_leida + EXCLUDED.cache_leida, salida = cerebro_gasto.salida + EXCLUDED.salida",
            valores,
        )


def gastado_hoy(uso: str) -> float:
    with db_session:
        filas = db.select(
            f'SELECT entrada, cache_escrita, cache_leida, salida FROM "{DB_SCHEMA}"."cerebro_gasto" WHERE fecha = $f AND uso = $uso',
            {"f": hoy(), "uso": uso},
        )
    return sum(costo({"uso": uso, "entrada": e, "cache_escrita": cw, "cache_leida": cr, "salida": s}) for e, cw, cr, s in filas)


def resumen(dias: int = 30) -> list[dict]:
    with db_session:
        filas = db.select(
            f'SELECT fecha, uso, llamadas, entrada, cache_escrita, cache_leida, salida FROM "{DB_SCHEMA}"."cerebro_gasto" '
            "WHERE fecha >= current_date - $dias ORDER BY fecha DESC, uso",
            {"dias": dias},
        )
    out = []
    for f, uso, n, e, cw, cr, s in filas:
        d = {"fecha": f.isoformat(), "uso": uso, "llamadas": n, "entrada": e, "cache_escrita": cw, "cache_leida": cr, "salida": s}
        d["usd"] = round(costo(d), 4)
        out.append(d)
    return out
