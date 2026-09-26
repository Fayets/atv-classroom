import asyncio

import pytest

from src.db import db, init_db
from src.services import guia_service


@pytest.fixture(autouse=True, scope="module")
def _base():
    # Se conecta recién acá para no chocar con los tests que arman su propia base.
    if db.provider is None:
        init_db()


def _con_ia(respuesta):
    async def falsa(_texto):
        return respuesta

    return falsa


def test_recomienda_clases_reales_y_valida_la_cita(monkeypatch):
    monkeypatch.setattr(
        guia_service,
        "_por_ia",
        _con_ia({"recomendaciones": [{"clase_id": 71, "cubre": "no aparece"}, {"clase_id": 41, "cubre": "frase inventada"}], "frente": "no-se-presentan"}),
    )
    r = asyncio.run(guia_service.recomendar("la gente agenda pero después no aparece"))
    assert [x["clase_id"] for x in r["recomendaciones"]] == [71, 41]
    assert r["recomendaciones"][0]["cubre"] == "no aparece"
    assert r["recomendaciones"][1]["cubre"] is None
    assert r["frente"]["slug"] == "no-se-presentan"


def test_descarta_ids_que_no_existen(monkeypatch):
    monkeypatch.setattr(guia_service, "_por_ia", _con_ia({"recomendaciones": [{"clase_id": 999999, "cubre": "x"}], "frente": "oferta"}))
    r = asyncio.run(guia_service.recomendar("mi oferta no se diferencia"))
    assert r["recomendaciones"] == []
    assert r["frente"] is None


def test_lista_vacia_deriva_al_coach(monkeypatch):
    monkeypatch.setattr(guia_service, "_por_ia", _con_ia({"recomendaciones": [], "frente": "ninguno"}))
    r = asyncio.run(guia_service.recomendar("me conviene abrir una LLC para facturar a España"))
    assert r["recomendaciones"] == [] and r["frente"] is None and r["fuente"] == "ia"


def test_sin_ia_usa_el_frente_por_palabras(monkeypatch):
    monkeypatch.setattr(guia_service, "_por_ia", _con_ia(None))
    r = asyncio.run(guia_service.recomendar("agendan y no vienen a la llamada"))
    assert r["frente"]["slug"] == "no-se-presentan"
    assert [x["clase_id"] for x in r["recomendaciones"]] == [71, 41]


def test_acepta_la_lista_como_texto_json():
    salida = guia_service._normalizar_salida({"recomendaciones": '[{"clase_id": 71, "cubre": "no aparece"}, "basura"]', "frente": "no-se-presentan"})
    assert salida == {"recomendaciones": [{"clase_id": 71, "cubre": "no aparece"}], "frente": "no-se-presentan", "area": "ninguno"}
    assert guia_service._normalizar_salida("no es json") is None


def test_sin_clases_deriva_al_coach_del_area(monkeypatch):
    monkeypatch.setattr(guia_service, "_por_ia", _con_ia({"recomendaciones": [], "frente": "ninguno", "area": "juan-cruz"}))
    r = asyncio.run(guia_service.recomendar("no tengo clara la visión de mi empresa"))
    assert r["recomendaciones"] == [] and r["coach"]["nombre"] == "Juan Cruz" and r["coach"]["agenda_url"]
