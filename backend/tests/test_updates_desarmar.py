"""El cerebro lee los updates de Mauri con reglas, sin IA. Solo funciones puras: no toca la base."""

from src.services.updates_service import _horas, _tipo, desarmar, nucleo

UPDATE = """@Juan
⚠️ ⏳ 1d 9h vicente-dicapore Contenidos: CTA baja o nula conversión
⚠️ har-program Feedback: Loom, situación del negocio
📓 patric-hlosta Calendario de Contenidos

@Juampi
⚠️ 23h laura-grasseler Entregable: Roadmap de Lanzamiento
-- #alvaro-manrique Agenda: Coordinar horario de llamada"""


def test_desarma_cada_renglon_con_su_responsable():
    r = desarmar(UPDATE)
    assert [x["responsable"] for x in r] == ["Juan", "Juan", "Juan", "Juampi", "Juampi"]
    assert [x["slug"] for x in r] == ["vicente-dicapore", "har-program", "patric-hlosta", "laura-grasseler", "alvaro-manrique"]
    assert [x["tipo"] for x in r] == ["Contenidos", "Feedback", None, "Entregable", "Agenda"]


def test_urgencia_y_espera():
    r = desarmar(UPDATE)
    assert (r[0]["alerta"], r[0]["reloj"], r[0]["espera_horas"]) == (True, True, 33)
    assert (r[3]["alerta"], r[3]["reloj"], r[3]["espera_horas"]) == (True, False, 23)
    assert r[4]["espera_horas"] is None and r[4]["marca"] == "--"
    assert _horas("2h 30m") == 2.5


def test_la_clave_es_la_misma_que_la_del_tilde():
    # Si Mauri actualiza el contador o el ícono, la clave no cambia (así el tilde sobrevive).
    assert nucleo("⚠️ ⏳ 1d 9h scalify Entregable: X") == nucleo("⚠️ ⏳ 1d 8h scalify Entregable: X") == "scalify Entregable: X"
    assert nucleo("-- #alvaro-manrique Agenda") == "alvaro-manrique Agenda"


def test_tipos_en_mayuscula_son_el_mismo():
    assert _tipo("CONSULTA") == _tipo("Consulta") == "Consulta"
