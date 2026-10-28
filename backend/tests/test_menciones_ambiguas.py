"""'@Franco' en el chat de Franco Ascurra es el cliente, no Franco del equipo: solo se etiqueta al equipo si se
eligió de la lista. Sin base: el equipo se simula."""

from src.services import mensajeria_service as ms

EQUIPO = [{"id": 62, "nombre": "Franco"}, {"id": 1076, "nombre": "Alejandro Ramírez"}]


def test_nombre_del_cliente_no_etiqueta_al_equipo(monkeypatch):
    monkeypatch.setattr(ms, "equipo_para_mencionar", lambda: EQUIPO)
    assert ms._detectar_menciones("@Franco mirá esto", [], {"franco"}) == set()
    # Elegido de la lista: sí.
    assert ms._detectar_menciones("@Franco mirá esto", [62], {"franco"}) == {62}
    # Sin choque de nombres, como siempre.
    assert ms._detectar_menciones("@Franco mirá esto", [], {"kilian"}) == {62}
    assert ms._detectar_menciones("@Alejandro Ramírez te paso esto", [], {"franco"}) == {1076}
