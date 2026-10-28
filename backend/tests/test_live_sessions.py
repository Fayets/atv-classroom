"""Live sessions: solo el equipo sube, y el título y el link se validan antes de tocar la base."""

import pytest
from fastapi import HTTPException

from src.services.live_sessions_service import LiveSessionsServices

svc = LiveSessionsServices()
EQUIPO = {"usuario_id": 62, "rol": "admin"}


def test_un_cliente_no_sube():
    with pytest.raises(HTTPException) as e:
        svc.subir({"usuario_id": 1, "rol": "boost"}, 15, "Clase", "https://fathom.video/share/x", None, None)
    assert e.value.status_code == 403
    with pytest.raises(HTTPException):
        svc.subir({"usuario_id": 1, "rol": "admin", "miembro_id": 3}, 15, "Clase", "https://x.com", None, None)


def test_pide_titulo_y_link():
    with pytest.raises(HTTPException) as e:
        svc.subir(EQUIPO, 15, "   ", "https://fathom.video/share/x", None, None)
    assert e.value.status_code == 422
    with pytest.raises(HTTPException) as e:
        svc.subir(EQUIPO, 15, "Clase del martes", "fathom.video/share/x", None, None)
    assert e.value.status_code == 422
