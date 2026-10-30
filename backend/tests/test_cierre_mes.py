"""Cierre de mes: lo que se calcula solo. Funciones puras, sin base."""

from datetime import datetime

from src.services.cierre_service import nombre_mes, periodo_sugerido, tasas


def test_tasas_del_embudo():
    t = tasas({"conversaciones": 300, "agendas": 30, "llamadas": 24, "ventas": 6})
    assert t == {"agendamiento": 10.0, "asistencia": 80.0, "cierre": 25.0}
    assert tasas({"conversaciones": 0, "agendas": 0, "llamadas": 0, "ventas": 0})["cierre"] is None


def test_mes_sugerido_y_nombre():
    assert periodo_sugerido(datetime(2026, 10, 30)) == "2026-10"
    assert periodo_sugerido(datetime(2026, 11, 2)) == "2026-10"
    assert periodo_sugerido(datetime(2027, 1, 3)) == "2026-12"
    assert nombre_mes("2026-10") == "octubre 2026"
