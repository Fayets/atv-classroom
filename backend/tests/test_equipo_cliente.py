"""Equipo del cliente: entra con su mail y la clave del cliente, ve solo el chat de ese cliente y todo
el classroom, el cupo depende del plan y si el cliente lo saca se le corta la sesión."""

from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db
from src.services import auth_service as auth
from src.services import equipo_cliente_service as eq
from src.services.tiempo_real import puede_ver

CLIENTE_ID = 999994001
TITULAR = {"usuario_id": CLIENTE_ID, "nombre": "Cliente Equipo", "email": "titular@atvos-prueba.com", "rol": "boost"}
FALSO = SimpleNamespace(
    id=CLIENTE_ID, nombre="Cliente Equipo", email="titular@atvos-prueba.com", emails_json=None, canal_discord="#prueba-equipo",
    password_hash=None, plan_actual="boost", estado_cliente="activo", fecha_vencimiento=date.today() + timedelta(days=30), responsable=None,
)


class _Clientes:
    @staticmethod
    def get(id=None, **_):
        return FALSO if id == CLIENTE_ID else None

    @staticmethod
    def select(*_):
        return []  # ningún mail de cliente real choca con los de la prueba


@pytest.fixture(autouse=True)
def _base(monkeypatch):
    if db.provider is None:
        init_db()
    monkeypatch.setattr(auth, "ClienteExterno", _Clientes)
    monkeypatch.setattr(eq, "ClienteExterno", _Clientes)
    yield
    with db_session:
        ids = db.select(f'SELECT id FROM "{DB_SCHEMA}"."miembros_cliente" WHERE cliente_id = $c', {"c": CLIENTE_ID})
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."sesiones" WHERE miembro_id = ANY($ids)', {"ids": list(ids)})
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."miembros_cliente" WHERE cliente_id = $c', {"c": CLIENTE_ID})
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."limites_equipo" WHERE plan = \'boost\' AND maximo = 2')


def test_el_setter_entra_con_su_mail_y_la_clave_del_cliente_y_se_corta_al_sacarlo():
    svc = eq.EquipoClienteServices()
    m = svc.agregar(TITULAR, " Leo@Atvos-Prueba.com ", "Leonardo", "setter")
    assert m["email"] == "leo@atvos-prueba.com" and m["rol_nombre"] == "Setter"
    with pytest.raises(HTTPException):
        auth.login("leo@atvos-prueba.com", "otra.clave")
    r = auth.login("leo@atvos-prueba.com", "prueba.equipo")
    assert r["usuario_id"] == CLIENTE_ID and r["nombre"] == "Leonardo" and r["miembro"]["rol"] == "setter"
    sesion = auth._validar_token(r["token"])
    assert sesion["miembro_id"] == m["id"] and sesion["miembro_rol"] == "setter"
    assert auth.persona(sesion) == ("miembro", m["id"])
    svc.quitar(TITULAR, m["id"])
    with pytest.raises(HTTPException) as e:
        auth._validar_token(r["token"])
    assert e.value.status_code == 401


def test_solo_el_titular_maneja_el_equipo_y_respeta_el_cupo_del_plan():
    svc = eq.EquipoClienteServices()
    assert svc.listar(TITULAR)["maximo"] == eq.LIMITE_POR_DEFECTO
    svc.guardar_limites({"boost": 2})
    svc.agregar(TITULAR, "a@atvos-prueba.com", "A", "closer")
    m = svc.agregar(TITULAR, "b@atvos-prueba.com", "B", "socio")
    with pytest.raises(HTTPException) as e:
        svc.agregar(TITULAR, "c@atvos-prueba.com", "C", "editor")
    assert "hasta 2" in e.value.detail
    with pytest.raises(HTTPException):
        svc.agregar(TITULAR, "a@atvos-prueba.com", "A otra vez", "closer")  # repetido
    with pytest.raises(HTTPException) as e:
        svc.agregar({**TITULAR, "miembro_id": m["id"]}, "d@atvos-prueba.com", "D", "otro")
    assert e.value.status_code == 403
    with pytest.raises(HTTPException):
        svc.guardar_limites({"boost": -1})


def test_el_equipo_ve_solo_el_chat_de_su_cliente():
    miembro = {**TITULAR, "miembro_id": 1}
    assert puede_ver(miembro, {"id": 1, "tipo": "cliente", "cliente_id": CLIENTE_ID})
    assert not puede_ver(miembro, {"id": 2, "tipo": "cliente", "cliente_id": 123})
    assert not puede_ver(miembro, {"id": 3, "tipo": "grupo", "roles": ["boost"]})
    assert not puede_ver(miembro, {"id": 4, "tipo": "anuncios"})
    assert puede_ver(TITULAR, {"id": 4, "tipo": "anuncios"})


def test_cada_uno_edita_solo_sus_mensajes():
    from src.services.mensajeria_service import _es_mio

    del_titular = SimpleNamespace(autor_tipo="cliente", autor_id=CLIENTE_ID, miembro_id=None)
    del_setter = SimpleNamespace(autor_tipo="cliente", autor_id=CLIENTE_ID, miembro_id=7)
    assert _es_mio(del_titular, TITULAR) and not _es_mio(del_setter, TITULAR)
    assert _es_mio(del_setter, {**TITULAR, "miembro_id": 7}) and not _es_mio(del_titular, {**TITULAR, "miembro_id": 7})
