"""Login del equipo con Google, roles y sesiones guardadas en la base.
Crea miembros de prueba con mails @atvos-prueba.com y los borra al terminar."""

import secrets

import pytest
from fastapi.testclient import TestClient
from pony.orm import db_session

from src.db import db, init_db
from src.services import auth_service, google_service

_PREFIJO = f"test-{secrets.token_hex(3)}"


@pytest.fixture(scope="module")
def cliente_http():
    if db.provider is None:
        init_db()
    import main

    # Sin "with": no corre el arranque de la app, que volvería a enlazar la base.
    yield TestClient(main.app)
    from src.models import Admin, SesionGuardada

    with db_session:
        ids = []
        for a in Admin.select()[:]:
            if a.email.startswith(_PREFIJO):
                ids.append(a.id)
                a.delete()
        for s in SesionGuardada.select()[:]:
            if s.tipo == "admin" and s.usuario_id in ids:
                s.delete()


def _google(monkeypatch, email, sub="sub-1"):
    monkeypatch.setattr(
        google_service,
        "verificar_credencial",
        lambda _c: {"sub": sub, "email": email, "nombre": "Coach Prueba", "foto": "https://foto/x.jpg"},
    )


def _crear_miembro(email, rol="coach", area="ventas"):
    from src.models import Admin

    with db_session:
        admin = Admin(email=email, nombre="", rol=rol, area=area)
        db.flush()
        return admin.id


def test_config_expone_client_id(cliente_http, monkeypatch):
    monkeypatch.setattr(google_service, "client_id", lambda: "abc.apps.googleusercontent.com")
    assert cliente_http.get("/api/auth/config").json()["google_client_id"] == "abc.apps.googleusercontent.com"


def test_cuenta_que_no_es_del_equipo_no_entra(cliente_http, monkeypatch):
    _google(monkeypatch, f"{_PREFIJO}-desconocido@gmail.com")
    r = cliente_http.post("/api/auth/google", json={"credencial": "x" * 30})
    assert r.status_code == 403


def test_coach_entra_con_google_y_queda_atado(cliente_http, monkeypatch):
    email = f"{_PREFIJO}-coach@atvos-prueba.com"
    miembro_id = _crear_miembro(email)
    _google(monkeypatch, email, sub="sub-coach")
    r = cliente_http.post("/api/auth/google", json={"credencial": "x" * 30})
    assert r.status_code == 200, r.text
    datos = r.json()
    assert datos["rol"] == "coach" and datos["usuario_id"] == miembro_id
    assert datos["nombre"] == "Coach Prueba" and datos["foto_url"] == "https://foto/x.jpg"

    # Ve el classroom pero no el panel de admin.
    h = {"Authorization": f"Bearer {datos['token']}"}
    assert cliente_http.get("/api/programas", headers=h).status_code == 200
    assert cliente_http.get("/api/admin/programas", headers=h).status_code == 403

    # Otra cuenta de Google con el mismo mail no puede usar ese lugar.
    _google(monkeypatch, email, sub="otro-sub")
    assert cliente_http.post("/api/auth/google", json={"credencial": "x" * 30}).status_code == 403


def test_la_sesion_sobrevive_a_un_reinicio_y_el_logout_la_corta(cliente_http, monkeypatch):
    email = f"{_PREFIJO}-reinicio@atvos-prueba.com"
    _crear_miembro(email)
    _google(monkeypatch, email, sub="sub-reinicio")
    token = cliente_http.post("/api/auth/google", json={"credencial": "x" * 30}).json()["token"]
    h = {"Authorization": f"Bearer {token}"}

    auth_service._sessions.clear()  # como si se reiniciara el backend
    assert cliente_http.get("/api/auth/me", headers=h).status_code == 200

    assert cliente_http.post("/api/auth/logout", headers=h).status_code == 204
    auth_service._sessions.clear()
    assert cliente_http.get("/api/auth/me", headers=h).status_code == 401


def test_admin_gestiona_el_equipo_y_la_baja_corta_la_sesion(cliente_http, monkeypatch):
    admin_email = f"{_PREFIJO}-admin@atvos-prueba.com"
    _crear_miembro(admin_email, rol="admin", area=None)
    _google(monkeypatch, admin_email, sub="sub-admin")
    h_admin = {"Authorization": "Bearer " + cliente_http.post("/api/auth/google", json={"credencial": "x" * 30}).json()["token"]}

    nuevo = cliente_http.post(
        "/api/admin/equipo", headers=h_admin, json={"email": f"{_PREFIJO}-nuevo@atvos-prueba.com", "nombre": "Nuevo", "area": "marketing"}
    )
    assert nuevo.status_code == 201, nuevo.text
    assert nuevo.json()["rol"] == "coach"
    lista = cliente_http.get("/api/admin/equipo", headers=h_admin)
    assert lista.status_code == 200 and any(m["email"] == f"{_PREFIJO}-nuevo@atvos-prueba.com" for m in lista.json())
    repetido = cliente_http.post("/api/admin/equipo", headers=h_admin, json={"email": f"{_PREFIJO}-nuevo@atvos-prueba.com"})
    assert repetido.status_code == 409

    _google(monkeypatch, f"{_PREFIJO}-nuevo@atvos-prueba.com", sub="sub-nuevo")
    h_nuevo = {"Authorization": "Bearer " + cliente_http.post("/api/auth/google", json={"credencial": "x" * 30}).json()["token"]}
    assert cliente_http.get("/api/auth/me", headers=h_nuevo).status_code == 200

    baja = cliente_http.patch(f"/api/admin/equipo/{nuevo.json()['id']}", headers=h_admin, json={"activo": False})
    assert baja.status_code == 200 and baja.json()["activo"] is False
    assert cliente_http.get("/api/auth/me", headers=h_nuevo).status_code == 401
    assert cliente_http.post("/api/auth/google", json={"credencial": "x" * 30}).status_code == 403

    # Nadie se saca a sí mismo el rol de admin.
    yo = cliente_http.get("/api/auth/me", headers=h_admin).json()["usuario_id"]
    assert cliente_http.patch(f"/api/admin/equipo/{yo}", headers=h_admin, json={"rol": "coach"}).status_code == 409


def test_el_admin_con_clave_sigue_entrando(cliente_http):
    r = cliente_http.post("/api/auth/login", json={"email": "admin@atvos.io", "contrasena": "atv-admin-2024"})
    assert r.status_code == 200 and r.json()["rol"] == "admin"
    cliente_http.post("/api/auth/logout", headers={"Authorization": f"Bearer {r.json()['token']}"})
