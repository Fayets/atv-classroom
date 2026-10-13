"""Tope de mensajes por minuto: frena el spam de un cliente, no a un coach que contesta rápido."""

import pytest
from fastapi import HTTPException

from src.services import mensajeria_service as ms


def test_cliente_frenado_despues_de_20_y_equipo_no():
    ms._envios_recientes.clear()
    cliente, coach = ("cliente", 999990001), ("admin", 999990002)
    for _ in range(20):
        ms._frenar_rafaga(cliente)
    with pytest.raises(HTTPException) as e:
        ms._frenar_rafaga(cliente)
    assert e.value.status_code == 429
    for _ in range(60):  # un coach contestando a 60 clientes en un minuto
        ms._frenar_rafaga(coach)
    ms._envios_recientes.clear()
