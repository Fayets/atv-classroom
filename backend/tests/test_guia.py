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
    assert r["recomendaciones"] == [] and r["coach"]["nombre"] == "Juan Cruz" and "agenda_url" not in r["coach"]


# ---------- buscador de SOPs ----------
from src.services import buscador_sops_service as buscador


@pytest.mark.parametrize("texto", ["SOP de onboarding", "guion de cierre", "VSL de chat", "busco la plantilla de seguimiento", "onboarding de clientes"])
def test_detecta_busquedas_de_sop(texto):
    assert buscador.parece_busqueda(texto)


@pytest.mark.parametrize("texto", ["Me dicen que lo van a pensar", "Todo depende de mí", "No sé si estoy ganando plata", "agendan y no vienen a la llamada"])
def test_un_problema_no_es_busqueda(texto):
    assert not buscador.parece_busqueda(texto)


def test_busqueda_lista_sops_validados(monkeypatch):
    # Una lección que sigue solo en Skool: va con su link de Skool.
    skool = next(c for c in buscador.sops_service.catalogo() if c["fuente"] == "skool")

    async def falsa(_texto):
        return [skool["id"], 999999999, skool["id"]]

    monkeypatch.setattr(buscador, "_por_ia", falsa)
    r = asyncio.run(guia_service.recomendar("SOP de VSL de chat ya"))
    assert r["modo"] == "sops"
    assert [s["titulo"] for s in r["sops"]] == [skool["titulo"]]
    assert r["sops"][0]["fuente"] == "skool" and r["sops"][0]["url"].startswith("https://www.skool.com/")


def test_vsl_de_chat_ya_esta_en_el_classroom():
    # Desde la Guía 50k (24-10-2026) la VSL de chat es una clase del classroom, no solo un link de Skool.
    assert any(c["titulo"].lower() == "vsl de chat" and c["fuente"] == "classroom" for c in buscador.sops_service.catalogo())


def test_busqueda_sin_ia_por_palabras(monkeypatch):
    async def sin_ia(_texto):
        return None

    monkeypatch.setattr(buscador, "_por_ia", sin_ia)
    r = asyncio.run(guia_service.recomendar("plantilla de VSL de chat"))
    assert r["modo"] == "sops" and r["fuente"] == "palabras"
    assert r["sops"] and r["sops"][0]["titulo"] == "VSL de chat"


def test_busqueda_sin_resultados(monkeypatch):
    async def nada(_texto):
        return []

    monkeypatch.setattr(buscador, "_por_ia", nada)
    r = asyncio.run(guia_service.recomendar("SOP de rutina de gimnasio"))
    assert r["modo"] == "sops" and r["sops"] == []
