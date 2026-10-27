"""Clientes en pausa: el equipo los arrastra a "Pausa" y desde ahí solo pueden leer su canal. Todo lo
demás (módulos, IA, roadmaps, escribir) se corta en el servidor con 423 y el cartel de hablar con Lucas."""

import secrets

import pytest
from fastapi import HTTPException
from pony.orm import db_session
from starlette.requests import Request

from src.db import db, init_db
from src.services import auth_service as auth
from src.services.mensajeria_service import MensajeriaServices

_P = f"test-pausa-{secrets.token_hex(3)}"
svc = MensajeriaServices()


def _pedido(metodo: str, ruta: str, token: str) -> Request:
    return Request({"type": "http", "method": metodo, "path": ruta, "headers": [(b"authorization", f"Bearer {token}".encode())], "query_string": b""})


@pytest.fixture(scope="module")
def equipo():
    if db.provider is None:
        init_db()
    from src.models import Admin

    sesiones = {}
    with db_session:
        for clave, rol, area in (("ventas", "coach", "ventas"), ("fulfillment", "coach", "fulfillment")):
            a = Admin(email=f"{_P}-{clave}@atvos-prueba.com", nombre=clave, rol=rol, area=area)
            a.flush()
            sesiones[clave] = {"usuario_id": a.id, "rol": rol, "nombre": clave, "email": a.email}
    yield sesiones
    with db_session:
        for a in list(Admin.select()):
            if a.email.startswith(_P):
                a.delete()


@pytest.fixture(scope="module")
def cliente():
    """Un cliente de prueba (mail @atvos-prueba.com) con canal propio, creado para el test y borrado al final:
    así la prueba nunca le corta el acceso a un cliente real."""
    if db.provider is None:
        init_db()
    from src.models import Canal, SesionGuardada

    email = f"{_P}@atvos-prueba.com"
    with db_session:
        cur = db.get_connection().cursor()
        cur.execute("INSERT INTO clients.clientes (nombre, email, plan_actual, estado_cliente) VALUES (%s, %s, 'high', 'vigente') RETURNING id", (_P, email))
        cid = cur.fetchone()[0]
        canal = Canal(tipo="cliente", cliente_id=cid, nombre=_P)
        canal.flush()
        canal_id = canal.id
    token = auth._crear_token({"usuario_id": cid, "tipo": "cliente", "rol": "high", "nombre": _P, "email": email})
    yield {"canal_id": canal_id, "cliente_id": cid, "token": token}
    auth.cerrar_sesion(token)
    with db_session:
        Canal[canal_id].delete()
        for x in list(SesionGuardada.select()):
            if x.email == email:
                x.delete()
        db.execute("DELETE FROM clients.clientes WHERE id = $cid", {"cid": cid})


def test_solo_admins_ventas_y_sistemas_pausan(equipo, cliente):
    with pytest.raises(HTTPException) as e:
        svc.marcar_pausa(equipo["fulfillment"], cliente["canal_id"], True)
    assert e.value.status_code == 403
    with pytest.raises(HTTPException) as e:
        svc.marcar_pausa({"usuario_id": cliente["cliente_id"], "rol": "high"}, cliente["canal_id"], True)
    assert e.value.status_code == 403


def test_en_pausa_solo_lee_su_canal(equipo, cliente):
    cid, token = cliente["canal_id"], cliente["token"]
    svc.marcar_pausa(equipo["ventas"], cid, True)
    perfil = auth.obtener_perfil_sesion(auth.obtener_sesion_desde_request(_pedido("GET", "/api/auth/me", token)))
    assert perfil["pausa"] is True and perfil["contacto_pausa"]["nombre"]
    # Recorrer el classroom y leer su canal, sí.
    for metodo, ruta in (("GET", "/api/mensajes/canales"), ("GET", f"/api/mensajes/canales/{cid}/mensajes"), ("POST", f"/api/mensajes/canales/{cid}/leido"),
                         ("GET", "/api/programas"), ("GET", "/api/frentes")):
        assert auth.obtener_sesion_desde_request(_pedido(metodo, ruta, token))["pausa"] is True
    # Entrar a un programa o clase, escribir, la IA y el roadmap, no.
    for metodo, ruta in (("POST", f"/api/mensajes/canales/{cid}/mensajes"), ("POST", f"/api/mensajes/canales/{cid}/adjuntos"),
                         ("GET", "/api/programas/3"), ("GET", "/api/clases/10"), ("POST", "/api/chat"), ("GET", "/api/roadmap"), ("GET", "/api/frentes/oferta")):
        with pytest.raises(HTTPException) as e:
            auth.obtener_sesion_desde_request(_pedido(metodo, ruta, token))
        assert e.value.status_code == 423 and "pausa" in e.value.detail
    # Al reanudar vuelve todo.
    svc.marcar_pausa(equipo["ventas"], cid, False)
    assert auth.obtener_sesion_desde_request(_pedido("POST", f"/api/mensajes/canales/{cid}/mensajes", token))["pausa"] is False


def test_pausa_lo_saca_de_inactivos(equipo, cliente):
    from src.models import Canal

    with db_session:
        Canal[cliente["canal_id"]].inactivo = True
    svc.marcar_pausa(equipo["ventas"], cliente["canal_id"], True)
    with db_session:
        c = Canal[cliente["canal_id"]]
        assert c.inactivo is False and c.pausa is True  # está en un solo grupo a la vez
    svc.marcar_pausa(equipo["ventas"], cliente["canal_id"], False)


def test_en_pausa_la_comunidad_queda_con_candado(equipo, cliente):
    from src.models import Canal
    from src.services.tiempo_real import Hub

    with db_session:
        grupo = next((c for c in list(Canal.select()) if c.tipo in ("grupo", "anuncios")), None)
        if grupo is None:
            pytest.skip("No hay canales de comunidad")
        grupo_id = grupo.id
    svc.marcar_pausa(equipo["ventas"], cliente["canal_id"], True)
    try:
        sesion = auth.obtener_sesion_desde_request(_pedido("GET", "/api/mensajes/canales", cliente["token"]))
        # El canal se lista (con candado), pero sin último mensaje ni no leídos…
        fila = next((c for c in svc.listar_canales(sesion) if c["id"] == grupo_id), None)
        if fila is not None:
            assert fila["bloqueado"] is True and fila["ultimo"] is None and fila["no_leidos"] == 0
        # …y los mensajes no salen del servidor.
        with pytest.raises(HTTPException) as e:
            svc.mensajes(sesion, grupo_id)
        assert e.value.status_code in (404, 423)
        # Su propio canal, sí.
        assert "mensajes" in svc.mensajes(sesion, cliente["canal_id"])
    finally:
        svc.marcar_pausa(equipo["ventas"], cliente["canal_id"], False)


def test_inactivo_corta_como_pausa_con_otro_cartel(equipo, cliente):
    from src.models import Canal

    cid, token = cliente["canal_id"], cliente["token"]
    with pytest.raises(HTTPException) as e:
        svc.marcar_inactivo(equipo["fulfillment"], cid, True)
    assert e.value.status_code == 403
    svc.marcar_inactivo(equipo["ventas"], cid, True)
    try:
        perfil = auth.obtener_perfil_sesion(auth.obtener_sesion_desde_request(_pedido("GET", "/api/auth/me", token)))
        assert perfil["pausa"] is True and perfil["motivo_pausa"] == "inactivo"
        assert auth.obtener_sesion_desde_request(_pedido("GET", f"/api/mensajes/canales/{cid}/mensajes", token))["pausa"] is True
        with pytest.raises(HTTPException) as e:
            auth.obtener_sesion_desde_request(_pedido("POST", f"/api/mensajes/canales/{cid}/mensajes", token))
        assert e.value.status_code == 423 and "inactiva" in e.value.detail
        # Pasarlo de Inactivos a Pausa lo deja en un solo grupo y con el cartel de pausa.
        svc.marcar_pausa(equipo["ventas"], cid, True)
        with db_session:
            assert Canal[cid].inactivo is False
        assert auth.obtener_sesion_desde_request(_pedido("GET", "/api/auth/me", token))["motivo"] == "pausa"
        svc.marcar_pausa(equipo["ventas"], cid, False)
    finally:
        svc.marcar_inactivo(equipo["ventas"], cid, False)
    assert auth.obtener_sesion_desde_request(_pedido("POST", f"/api/mensajes/canales/{cid}/mensajes", token))["pausa"] is False


def test_contacto_segun_plan():
    for plan in ("mentoria", "entry", "2k"):
        assert auth.contacto_pausa(plan)["nombre"] == "Alejandro Ramirez"
    for plan in ("mid", "high", "advantage", "boost", "BOOST"):
        c = auth.contacto_pausa(plan)
        assert c["nombre"] == "Juampi Toledo" and c["link"] == "https://wa.me/5493804660274"
    assert "Alejandro Ramirez al +506 7103 0224" in auth.mensaje_pausa("inactivo", "entry")


def test_el_cliente_high_ve_a_juampi(equipo, cliente):
    svc.marcar_pausa(equipo["ventas"], cliente["canal_id"], True)
    try:
        perfil = auth.obtener_perfil_sesion(auth.obtener_sesion_desde_request(_pedido("GET", "/api/auth/me", cliente["token"])))
        assert perfil["contacto_pausa"]["nombre"] == "Juampi Toledo"
        with pytest.raises(HTTPException) as e:
            auth.obtener_sesion_desde_request(_pedido("GET", "/api/roadmap", cliente["token"]))
        assert "Juampi Toledo" in e.value.detail
    finally:
        svc.marcar_pausa(equipo["ventas"], cliente["canal_id"], False)
