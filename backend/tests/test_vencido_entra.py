"""Un cliente vencido por fecha entra igual (como en Pausa) con el cartel de extender la vigencia con Juampi.
El que está "inactivo" en atv-clients sigue sin entrar. Cliente falso: no toca fichas reales."""

from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from src.db import db, init_db
from src.services import auth_service as auth

CLIENTE_ID = 999994201
FICHA = SimpleNamespace(
    id=CLIENTE_ID, nombre="Brian Prueba", email="brian@atvos-prueba.com", emails_json=None, canal_discord="#brian-prueba",
    password_hash=None, plan_actual="mentoria", estado_cliente="vencido", fecha_vencimiento=date.today() - timedelta(days=20), responsable=None,
)


class _Clientes:
    @staticmethod
    def get(id=None, **_):
        return FICHA if id == CLIENTE_ID else None

    @staticmethod
    def select(*_):
        return [FICHA]


@pytest.fixture(autouse=True)
def _base(monkeypatch):
    if db.provider is None:
        init_db()
    monkeypatch.setattr(auth, "ClienteExterno", _Clientes)
    yield
    FICHA.estado_cliente = "vencido"


def _pedido(metodo, ruta, token):
    return Request({"type": "http", "method": metodo, "path": ruta, "headers": [(b"authorization", f"Bearer {token}".encode())], "query_string": b""})


def test_el_vencido_entra_con_el_cartel_de_juampi():
    r = auth.login("brian@atvos-prueba.com", "brian.prueba")
    sesion = auth.obtener_sesion_desde_request(_pedido("GET", "/api/auth/me", r["token"]))
    assert sesion["pausa"] is True and sesion["motivo"] == "vencido"
    perfil = auth.obtener_perfil_sesion(sesion)
    assert perfil["contacto_pausa"]["nombre"].startswith("Juampi") and perfil["contacto_pausa"]["link"].startswith("https://wa.me/")
    # Como en Pausa: el material y el roadmap, no.
    for ruta in ("/api/programas/3", "/api/roadmap"):
        with pytest.raises(HTTPException) as e:
            auth.obtener_sesion_desde_request(_pedido("GET", ruta, r["token"]))
        assert e.value.status_code == 423 and "Juampi" in e.value.detail and "vigencia" in e.value.detail
    auth.cerrar_sesion(r["token"])


def test_el_inactivo_sigue_sin_entrar():
    FICHA.estado_cliente = "inactivo"
    with pytest.raises(HTTPException) as e:
        auth.login("brian@atvos-prueba.com", "brian.prueba")
    assert e.value.status_code == 403
