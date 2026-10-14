"""El cerebro lee el formulario de onboarding: ficha copiada de las respuestas, nicho y hechos con cita
verificada, y el perfil solo se completa donde estaba vacío."""
import json
from datetime import datetime

from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db
from src.models import PerfilCliente
from src.services import cerebro_onboarding as co

if db.provider is None:
    init_db()
CLI = 999999501
FORM = {"5": "Mentoría de nutrición deportiva para corredores", "8": "USD 300 por 3 meses", "13": "Unos USD 2.000 por mes, inestable",
        "29": "No consigo leads calificados y todo pasa por mí", "47": "El precio, no sabía si lo iba a poder pagar", "31": "Llegar a USD 6.000 por mes"}


def test_lee_el_formulario_y_completa_lo_vacio():
    def llamar(sistema, usuario):
        assert "Mentoría de nutrición deportiva" in usuario and "29." in usuario
        return {"nicho": "nutricion", "que_vende": "Mentoría de nutrición para corredores", "etapa": "vendiendo", "hechos": [
            {"tipo": "dolor", "texto": "No consigue leads calificados", "cita": "No consigo leads calificados"},
            {"tipo": "objecion", "texto": "Dudaba por el precio", "cita": "El precio, no sabía si lo iba a poder pagar"},
            {"tipo": "logro", "texto": "Inventado", "cita": "facturé USD 50.000 en un mes"},  # no está en el formulario: afuera
        ]}

    try:
        with db_session:
            PerfilCliente(cliente_id=CLI, objetivo="lo que dijo en el chat")  # esto no se pisa
        r = co.importar(CLI, "sesion-test", "Test", json.dumps(FORM), datetime(2026, 10, 1), llamar=llamar)
        assert r == {"cliente_id": CLI, "nicho": "nutricion", "hechos": 2}
        d = co.de_cliente(CLI)
        assert d["ficha"]["precio"] == "USD 300 por 3 meses" and d["ficha"]["nicho"] == "nutricion"
        with db_session:
            p = PerfilCliente.get(cliente_id=CLI)
            assert p.nicho == "nutricion" and p.objetivo == "lo que dijo en el chat" and p.facturacion.startswith("Unos USD 2.000")
            tipos = sorted(db.select(f'SELECT tipo FROM "{DB_SCHEMA}"."cerebro_hechos" WHERE cliente_id = $c', {"c": CLI}))
            assert tipos == ["dolor", "objecion"]
        co.importar(CLI, "sesion-test", "Test", json.dumps(FORM), datetime(2026, 10, 2), llamar=llamar)  # releer no duplica
        with db_session:
            assert db.select(f'SELECT count(*) FROM "{DB_SCHEMA}"."cerebro_hechos" WHERE cliente_id = $c', {"c": CLI})[0] == 2
    finally:
        with db_session:
            for t in ("cerebro_hechos", "cerebro_onboarding", "cerebro_perfil_cliente"):
                db.execute(f'DELETE FROM "{DB_SCHEMA}"."{t}" WHERE cliente_id = $c', {"c": CLI})
