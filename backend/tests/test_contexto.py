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


def test_plazos_relativos_al_dia_en_que_se_dijo():
    from datetime import date

    lunes = date(2026, 10, 5)
    assert cs.plazo_de("Necesito el guion para el viernes", lunes) == date(2026, 10, 9)
    assert cs.plazo_de("lo vemos el viernes", date(2026, 10, 9)) == date(2026, 10, 16)  # dicho un viernes: el siguiente
    assert cs.plazo_de("para el 05/01", date(2025, 12, 20)) == date(2026, 1, 5)  # dd/mm pasado rueda de año
    assert cs.plazo_de("a fin de mes", date(2026, 8, 12)) == date(2026, 8, 31)
    assert cs.plazo_de("te lo paso mañana", lunes) == date(2026, 10, 6)
    assert cs.plazo_de("que la reunión sea durante la mañana", lunes) is None  # horario, no plazo
    assert cs.plazo_de("en 2 semanas", lunes) == date(2026, 10, 19)
    assert cs.plazo_de("la semana que viene", lunes) == date(2026, 10, 18)
    assert cs.plazo_de("los viernes hacemos daily", lunes) is None
    assert cs.plazo_de("pide el roadmap de protocolos", lunes) is None


def test_con_plazo_gana_sobre_agenda_y_el_link_no_es_agenda():
    assert cs.plazo_de("Paso el rol el viernes a las 3", date_lunes()) is not None
    assert cs._AGENDA.search("Paso el rol el viernes a las 3")  # matchea agenda, pero R4 va antes
    assert not cs._AGENDA.search("te mando el link del documento")
    assert cs._AGENDA.search("pidió la hora de la reunión")


def date_lunes():
    from datetime import date

    return date(2026, 10, 5)


def test_similitud_para_fusionar():
    assert cs.similitud("duda sobre el costo de tokens del agente", "preocupación por el costo de tokens del agente de WhatsApp") >= 0.6
    assert cs.similitud("rompieron récords de facturación", "contratar un community manager") < 0.6


def test_silencios_de_7_dias():
    from datetime import date, timedelta

    hoy = date(2026, 10, 29)
    assert cs.silencios({hoy - timedelta(days=8)}, hoy) == [{"desde": hoy - timedelta(days=8), "dias": 8, "abierto": True}]
    assert cs.silencios({hoy - timedelta(days=6)}, hoy) == []
    tramo = cs.silencios({date(2026, 8, 9), date(2026, 9, 8), date(2026, 9, 12), hoy - timedelta(days=2)}, hoy)
    assert tramo == [{"desde": date(2026, 8, 9), "dias": 30, "abierto": False}, {"desde": date(2026, 9, 12), "dias": 45, "abierto": False}]


def test_trabado_solo_con_vencidos_recientes():
    from datetime import date, timedelta

    hoy = date(2026, 10, 29)
    reciente = {"plazo": hoy - timedelta(days=29)}
    viejo = {"plazo": hoy - timedelta(days=31)}
    for c in (reciente, viejo):
        c["estado"] = cs.estado_compromiso(c, hoy)
    assert reciente["estado"] == viejo["estado"] == "vencido"
    assert cs.en_panel(reciente, hoy) and not cs.en_panel(viejo, hoy)
    sin_plazo = {"plazo": None}
    assert cs.estado_compromiso(sin_plazo, hoy) == "abierto"
    assert cs.estado_compromiso({"plazo": hoy - timedelta(days=3), "cerrado": True}, hoy) == "cerrado"


def test_solo_se_cierran_a_mano_los_del_chat_y_las_llamadas():
    import pytest
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as e:
        cs.ContextoServices().cerrar_compromiso({"usuario_id": 62, "rol": "admin"}, 89, "rm:3:1", True)
    assert e.value.status_code == 422
    with pytest.raises(HTTPException) as e:
        cs.ContextoServices().cerrar_compromiso({"usuario_id": 5, "rol": "mid"}, 89, "ch:1", True)
    assert e.value.status_code == 403
