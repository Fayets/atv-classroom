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
    # Los cupos son de producción (la base es compartida): se guardan y se devuelven tal cual.
    with db_session:
        cupos = list(db.select(f'SELECT plan, maximo FROM "{DB_SCHEMA}"."limites_equipo"'))
    yield
    with db_session:
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."limites_equipo"')
        for plan, maximo in cupos:
            db.execute(f'INSERT INTO "{DB_SCHEMA}"."limites_equipo" (plan, maximo) VALUES ($plan, $maximo)', {"plan": plan, "maximo": maximo})
        ids = db.select(f'SELECT id FROM "{DB_SCHEMA}"."miembros_cliente" WHERE cliente_id = $c', {"c": CLIENTE_ID})
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."sesiones" WHERE miembro_id = ANY($ids)', {"ids": list(ids)})
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."miembros_cliente" WHERE cliente_id = $c', {"c": CLIENTE_ID})


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
    with db_session:
        assert svc.listar(TITULAR)["maximo"] == eq.limite_de("boost")  # el cupo configurado (o el de por defecto)
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


def test_el_equipo_ve_lo_mismo_que_su_cliente():
    miembro = {**TITULAR, "miembro_id": 1}
    for canal in ({"id": 1, "tipo": "cliente", "cliente_id": CLIENTE_ID}, {"id": 2, "tipo": "cliente", "cliente_id": 123},
                  {"id": 3, "tipo": "grupo", "roles": [TITULAR["rol"]]}, {"id": 4, "tipo": "anuncios"}):
        assert puede_ver(miembro, canal) == puede_ver(TITULAR, canal)


def test_cada_uno_edita_solo_sus_mensajes():
    from src.services.mensajeria_service import _es_mio

    del_titular = SimpleNamespace(autor_tipo="cliente", autor_id=CLIENTE_ID, miembro_id=None)
    del_setter = SimpleNamespace(autor_tipo="cliente", autor_id=CLIENTE_ID, miembro_id=7)
    assert _es_mio(del_titular, TITULAR) and not _es_mio(del_setter, TITULAR)
    assert _es_mio(del_setter, {**TITULAR, "miembro_id": 7}) and not _es_mio(del_titular, {**TITULAR, "miembro_id": 7})


def test_un_segundo_mail_de_la_misma_ficha_se_suma_y_entra_con_su_nombre(monkeypatch):
    # Como "Oscar Lina": los dos mails están en la ficha. Antes, el segundo entraba como el titular.
    con_dos = SimpleNamespace(**{**vars(FALSO), "emails_json": '["titular@atvos-prueba.com", "lina@atvos-prueba.com"]'})

    class _ConDos(_Clientes):
        @staticmethod
        def get(id=None, **_):
            return con_dos if id == CLIENTE_ID else None

        @staticmethod
        def select(*_):
            return [con_dos]

    monkeypatch.setattr(auth, "ClienteExterno", _ConDos)
    monkeypatch.setattr(eq, "ClienteExterno", _ConDos)
    svc = eq.EquipoClienteServices()
    antes = auth.login("lina@atvos-prueba.com", "prueba.equipo")
    assert antes["nombre"] == "Cliente Equipo"  # sin estar en el equipo, entra como la cuenta
    m = svc.agregar(TITULAR, "lina@atvos-prueba.com", "Lina Castillo", "socio")
    r = auth.login("lina@atvos-prueba.com", "prueba.equipo")
    assert r["usuario_id"] == CLIENTE_ID and r["nombre"] == "Lina Castillo" and r["miembro"]["rol"] == "socio"
    assert auth._validar_token(r["token"])["miembro_id"] == m["id"]
    # El mail principal sigue siendo del titular: no se suma.
    with pytest.raises(HTTPException) as e:
        svc.agregar(TITULAR, "titular@atvos-prueba.com", "Otro", "setter")
    assert e.value.status_code == 409


def test_el_mail_de_otro_cliente_no_se_suma(monkeypatch):
    otro = SimpleNamespace(**{**vars(FALSO), "id": 999994002, "email": "otro@atvos-prueba.com", "emails_json": None})

    class _ConOtro(_Clientes):
        @staticmethod
        def select(*_):
            return [FALSO, otro]

    monkeypatch.setattr(auth, "ClienteExterno", _ConOtro)
    monkeypatch.setattr(eq, "ClienteExterno", _ConOtro)
    with pytest.raises(HTTPException) as e:
        eq.EquipoClienteServices().agregar(TITULAR, "otro@atvos-prueba.com", "Otro", "setter")
    assert "otro cliente" not in e.value.detail and e.value.status_code == 409
