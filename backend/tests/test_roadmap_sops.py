"""SOPs del classroom en los entregables del roadmap: la IA elige de una lista cerrada (por número), el
código valida, arma el link a la clase y escribe las líneas "Entregable: [LINK]"."""

import json

import pytest

from src.db import db, init_db
from src.services import roadmap_ia_service as ri
from src.services import sops_service as sops


@pytest.fixture(scope="module", autouse=True)
def _base():
    if db.provider is None:
        init_db()


def _una_clase():
    c = sops.catalogo()
    if not c:
        pytest.skip("Sin clases con contenido")
    return c[0], c[1] if len(c) > 1 else c[0]


def test_limpiar_arma_el_link_y_no_inventa():
    a, _ = _una_clase()
    datos = {
        "titulo": "Ventas", "pasos": [{"texto": "Armá X", "quien": "cliente"}],
        "mensaje": "hola [ROADMAP]\n\nOtro título del sop: [LINK]",
        "entregables": [{"titulo": "Plantilla a medida", "sop": None}, {"titulo": a["titulo"].capitalize(), "sop": a["id"]},
                        {"titulo": "Algo", "sop": 999999}, "Plantilla a medida"],
    }
    b = ri._limpiar(datos, None)
    por = {e["titulo"]: e for e in b["entregables"]}
    assert por[a["titulo"].capitalize()]["url"] == a["url"]
    assert por["Plantilla a medida"]["url"] is None and por["Algo"]["url"] is None  # número inexistente: sin link
    assert len([e for e in b["entregables"] if e["titulo"] == "Plantilla a medida"]) == 1
    # las líneas las pone el código, una por entregable, sin la que inventó la IA con otro título
    assert "Otro título del sop: [LINK]" not in b["mensaje"]
    assert b["mensaje"].count("[LINK]") == len(b["entregables"])


def test_segunda_pasada_suma_los_sops_de_los_pasos_con_tope():
    a, c2 = _una_clase()
    borrador = {"mensaje": "hola [ROADMAP]", "pasos": [{"texto": "uno", "quien": "cliente"}, {"texto": "dos", "quien": "cliente"}],
                "entregables": [{"titulo": "Script a medida", "url": None, "clase": None}]}
    respuesta = {"pasos": [{"n": 1, "sop": a["id"]}, {"n": 2, "sop": a["id"]}, {"n": 2, "sop": "basura"}],
                 "entregables": [{"n": 1, "sop": None}, {"n": 7, "sop": c2["id"]}]}
    b = ri._sumar_sops(borrador, lambda s, u: json.dumps(respuesta))
    titulos = [e["titulo"] for e in b["entregables"]]
    assert titulos == ["Script a medida", a["titulo"].capitalize()]  # sin repetir la misma clase
    assert b["entregables"][1]["url"] == a["url"]
    assert f"{a['titulo'].capitalize()}: [LINK]" in b["mensaje"]


def test_si_la_ia_falla_queda_el_borrador():
    borrador = {"mensaje": "hola", "pasos": [{"texto": "uno", "quien": "cliente"}], "entregables": []}
    assert ri._sumar_sops(dict(borrador), lambda s, u: "no es json")["entregables"] == []


def test_por_titulo_no_fuerza_parecidos():
    assert sops.por_titulo("Plantilla de avatar") is None
    assert sops.por_titulo("Grabación de la llamada") is None
