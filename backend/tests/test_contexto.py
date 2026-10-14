"""Contexto del cliente (pase de guardia): lo que detecta el código sin IA."""
from src.services import contexto_service as cs


def test_detecta_pedidos_de_baja_sin_falsos_positivos():
    si = ["quiero que me devuelvan la plata", "pido el reembolso", "no quiero continuar con un programa de US$5.000", "quiero darme de baja", "la devolución del dinero"]
    no = ["devoluciones, entregables", "quería cancelar la reu por el momento", "listo, gracias", "te devuelvo el doc con correcciones"]
    assert all(cs._RIESGO.search(t) for t in si)
    assert not any(cs._RIESGO.search(t) for t in no)


def test_la_alerta_cita_la_oracion_y_no_el_saludo():
    texto = "Hola chicos. Estuve pensando mucho. No quiero continuar con un programa tan caro. Gracias igual"
    assert cs._frase(texto, cs._RIESGO) == "No quiero continuar con un programa tan caro"


def test_de_la_llamada_solo_queda_lo_que_tiene_cita_real():
    base = cs._norm("Franco: bueno, la fase 1 la cerramos esta semana. Ana: dale, armo el typeform")
    items = [
        {"texto": "Cerrar la fase 1 esta semana", "cita": "la fase 1 la cerramos esta semana"},
        {"texto": "Inventado", "cita": "vamos a duplicar la facturación"},
        {"texto": "", "cita": "armo el typeform"},
    ]
    assert [x["texto"] for x in cs._con_cita_real(items, base)] == ["Cerrar la fase 1 esta semana"]


def test_solo_el_equipo_ve_el_contexto():
    import pytest
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as e:
        cs.ContextoServices().de_cliente({"usuario_id": 5, "rol": "mid"}, 134)
    assert e.value.status_code == 403
