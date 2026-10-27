"""El titular (mail principal) elige cómo se llama él, aparte del nombre de la cuenta y del canal: "Oscar Lina"
es la cuenta, "Oscar Triana" quien escribe. Cliente de prueba falso: no toca fichas reales."""

from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db
from src.services import auth_service as auth
from src.services import cuenta_service as cuenta

CLIENTE_ID = 999994101
FALSO = SimpleNamespace(
    id=CLIENTE_ID, nombre="Oscar Lina", email="oscar@atvos-prueba.com", emails_json=None, canal_discord="#oscar-lina",
    password_hash=None, plan_actual="entry", estado_cliente="activo", fecha_vencimiento=date.today() + timedelta(days=30), responsable=None,
)


class _Clientes:
    @staticmethod
    def get(id=None, **_):
        return FALSO if id == CLIENTE_ID else None

    @staticmethod
    def select(*_):
        return [FALSO]


@pytest.fixture(autouse=True)
def _base(monkeypatch):
    if db.provider is None:
        init_db()
    monkeypatch.setattr(auth, "ClienteExterno", _Clientes)
    monkeypatch.setattr(cuenta, "ClienteExterno", _Clientes)
    yield
    with db_session:
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."nombres_titular" WHERE cliente_id = $c', {"c": CLIENTE_ID})


def test_el_titular_se_pone_su_nombre_y_la_cuenta_sigue_igual():
    r = auth.login("oscar@atvos-prueba.com", "oscar.lina")
    assert r["nombre"] == "Oscar Lina"
    sesion = auth._validar_token(r["token"])
    assert cuenta.CuentaServices().cambiar_nombre(sesion, "  Oscar   Triana ") == {"nombre": "Oscar Triana", "propio": True}
    # La sesión abierta lo toma sin volver a entrar, y el próximo login también.
    assert auth.obtener_perfil_sesion(sesion)["nombre"] == "Oscar Triana"
    assert auth.login("oscar@atvos-prueba.com", "oscar.lina")["nombre"] == "Oscar Triana"
    assert auth.nombre_titular(CLIENTE_ID) == "Oscar Triana"
    # Vacío vuelve al nombre de la cuenta.
    assert cuenta.CuentaServices().cambiar_nombre(sesion, "")["nombre"] == "Oscar Lina"
    assert auth.nombre_titular(CLIENTE_ID) is None


def test_solo_el_titular_cambia_su_nombre():
    with pytest.raises(HTTPException) as e:
        cuenta.CuentaServices().cambiar_nombre({"usuario_id": CLIENTE_ID, "rol": "entry", "miembro_id": 5, "nombre": "Lina"}, "Otro")
    assert e.value.status_code == 403
