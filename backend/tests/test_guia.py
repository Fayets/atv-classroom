import asyncio

from src.services import guia_service


def _con_ia(respuesta):
    async def falsa(_texto):
        return respuesta

    return falsa


def test_acepta_la_ia_si_la_frase_esta_en_el_mensaje(monkeypatch):
    monkeypatch.setattr(guia_service, "_por_ia", _con_ia(("no-se-presentan", "no aparece")))
    r = asyncio.run(guia_service.elegir_frente("la gente agenda pero después no aparece"))
    assert r == {"slug": "no-se-presentan", "fuente": "ia"}


def test_descarta_la_ia_si_inventa_la_frase(monkeypatch):
    monkeypatch.setattr(guia_service, "_por_ia", _con_ia(("oferta", "mi oferta es mala")))
    r = asyncio.run(guia_service.elegir_frente("tengo 3 closers y cada uno hace lo que quiere"))
    assert r == {"slug": "equipo-ventas", "fuente": "palabras"}


def test_ninguno_deriva_al_coach(monkeypatch):
    monkeypatch.setattr(guia_service, "_por_ia", _con_ia(("ninguno", "")))
    r = asyncio.run(guia_service.elegir_frente("me conviene abrir una LLC para facturar a España"))
    assert r == {"slug": None, "fuente": "ia"}


def test_sin_ia_usa_palabras_clave(monkeypatch):
    monkeypatch.setattr(guia_service, "_por_ia", _con_ia(None))
    assert asyncio.run(guia_service.elegir_frente("agendan y no vienen a la llamada"))["slug"] == "no-se-presentan"
    assert asyncio.run(guia_service.elegir_frente("¿me conviene una LLC?"))["slug"] is None
