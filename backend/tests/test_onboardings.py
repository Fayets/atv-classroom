"""Carpeta Onboardings: el equipo ve las sesiones de atv-onboarding (solo lectura); un cliente no."""

import pytest
from fastapi import HTTPException

from src.db import db, init_db
from src.services.onboardings_service import OnboardingsServices


@pytest.fixture(autouse=True)
def _base():
    if db.provider is None:
        init_db()


def test_el_equipo_ve_los_onboardings_con_su_avance():
    lista = OnboardingsServices().listar({"usuario_id": 1, "rol": "coach"})
    assert isinstance(lista, list)
    if lista:
        o = lista[0]
        assert set(o["pasos"]) == {"entro", "discord", "skool", "formulario"} and o["estado"] in ("sin_empezar", "en_curso", "completo")
        assert "respuestas" in OnboardingsServices().detalle({"usuario_id": 1, "rol": "coach"}, o["id"])


def test_un_cliente_no_ve_los_onboardings():
    with pytest.raises(HTTPException):
        OnboardingsServices().listar({"usuario_id": 1, "rol": "boost"})
