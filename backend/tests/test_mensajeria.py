"""Mensajería: permisos, respuestas, edición, borrado, no leídos, bandeja y tiempo real.
Los clientes son ids ficticios (no se tocan clientes reales de atv-clients) y todo se borra al final."""

import secrets

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pony.orm import db_session

from src.db import db, init_db
from src.services import google_service
from src.services.mensajeria_service import MensajeriaServices
from src.services import mensajeria_service as ms

CLI_A = 999999101
CLI_B = 999999102
_PREFIJO = f"test-msj-{secrets.token_hex(3)}"
svc = MensajeriaServices()


def _cliente(cid):
    return {"usuario_id": cid, "nombre": f"Cliente {cid}", "email": "x@y.com", "rol": "mid"}


@pytest.fixture(scope="module", autouse=True)
def _base():
    if db.provider is None:
        init_db()
    yield
    from src.models import Admin, Canal, LecturaCanal, MensajeCanal, SesionGuardada

    with db_session:
        ids_canal = []
        for c in Canal.select()[:]:
            if (c.cliente_id or 0) >= 999999000 or c.nombre.startswith(_PREFIJO):
                ids_canal.append(c.id)
        for m in MensajeCanal.select()[:]:
            if m.canal.id in ids_canal:
                m.delete()
        for l in LecturaCanal.select()[:]:
            if l.canal_id in ids_canal:
                l.delete()
        for c in Canal.select()[:]:
            if c.id in ids_canal:
                c.delete()
        admins = []
        for a in Admin.select()[:]:
            if a.email.startswith(_PREFIJO):
                admins.append(a.id)
                a.delete()
        for s in SesionGuardada.select()[:]:
            if s.tipo == "admin" and s.usuario_id in admins:
                s.delete()


@pytest.fixture(autouse=True)
def _sin_tope(monkeypatch):
    monkeypatch.setattr(ms, "_TOPE_POR_MINUTO", 1000)


@pytest.fixture(scope="module")
def coach():
    from src.models import Admin

    with db_session:
        a = Admin(email=f"{_PREFIJO}-coach@atvos-prueba.com", nombre="Coach Test", rol="coach", area="ventas")
        db.flush()
        return {"usuario_id": a.id, "nombre": "Coach Test", "email": a.email, "rol": "coach"}


def _canal_de(sesion_cliente):
    for c in svc.listar_canales(sesion_cliente):
        if c["tipo"] == "cliente":
            return c["id"]
    raise AssertionError("sin canal")


def test_cada_cliente_ve_solo_su_canal(coach):
    canal_a = _canal_de(_cliente(CLI_A))
    canal_b = _canal_de(_cliente(CLI_B))
    assert canal_a != canal_b
    svc.enviar(_cliente(CLI_A), canal_a, "hola, soy A", None)
    with pytest.raises(HTTPException) as e:
        svc.mensajes(_cliente(CLI_B), canal_a)
    assert e.value.status_code == 404
    with pytest.raises(HTTPException):
        svc.enviar(_cliente(CLI_B), canal_a, "me meto", None)
    # El equipo ve el canal de A.
    assert svc.mensajes(coach, canal_a)["mensajes"][-1]["texto"] == "hola, soy A"


def test_respuesta_edicion_borrado_y_no_leidos(coach):
    a = _cliente(CLI_A)
    canal = _canal_de(a)
    pregunta, _ = svc.enviar(a, canal, "¿cuántos follow-ups hago?", None)
    respuesta, _ = svc.enviar(coach, canal, "Tres, en 7 días", pregunta["id"])
    assert respuesta["respuesta_a"]["id"] == pregunta["id"]
    assert respuesta["autor"]["tipo"] == "equipo" and respuesta["autor"]["area"] == "ventas"

    # El cliente tiene la respuesta del coach sin leer; al marcarla, baja a cero.
    assert svc.no_leidos(a)["no_leidos"] >= 1
    svc.marcar_leido(a, canal, respuesta["id"])
    assert svc.no_leidos(a)["no_leidos"] == 0

    editado, _ = svc.editar(coach, respuesta["id"], "Tres, en 10 días")
    assert editado["editado"] and editado["texto"] == "Tres, en 10 días"
    with pytest.raises(HTTPException):
        svc.editar(a, respuesta["id"], "lo cambio yo")

    borrado, _ = svc.borrar(a, pregunta["id"])
    assert borrado["borrado"] and borrado["texto"] is None
    ultimos = svc.mensajes(coach, canal)["mensajes"]
    assert ultimos[-1]["respuesta_a"]["texto"] is None  # la cita de un borrado no muestra el texto


def test_bandeja_del_equipo_marca_quien_espera(coach):
    b = _cliente(CLI_B)
    canal = _canal_de(b)
    svc.enviar(b, canal, "necesito ayuda con el guion", None)
    # Los canales de ids ficticios no salen en la bandeja (no son clientes con acceso),
    # así que se mira el resumen crudo que la arma.
    with db_session:
        resumen = ms._resumen_canales(("admin", coach["usuario_id"]))
    assert resumen[canal]["esperando_desde"] is not None
    svc.enviar(coach, canal, "Dale, lo vemos", None)
    with db_session:
        resumen = ms._resumen_canales(("admin", coach["usuario_id"]))
    assert resumen[canal]["esperando_desde"] is None


def test_anuncios_los_lee_el_cliente_pero_no_escribe(coach):
    canal = svc.crear_canal_anuncios(f"{_PREFIJO} anuncios", "Novedades")
    svc.enviar(coach, canal["id"], "Nuevo SOP en el classroom", None)
    a = _cliente(CLI_A)
    assert svc.mensajes(a, canal["id"])["puede_escribir"] is False
    with pytest.raises(HTTPException) as e:
        svc.enviar(a, canal["id"], "gracias!", None)
    assert e.value.status_code == 403


def test_paginacion_y_recupero(coach):
    canal = _canal_de(_cliente(CLI_B))
    ids = []
    for i in range(55):
        m, _ = svc.enviar(coach, canal, f"m{i}", None)
        ids.append(m["id"])
    pagina = svc.mensajes(coach, canal)
    assert len(pagina["mensajes"]) == 50 and pagina["hay_mas"]
    anterior = svc.mensajes(coach, canal, antes_de=pagina["mensajes"][0]["id"])
    assert anterior["mensajes"][-1]["id"] < pagina["mensajes"][0]["id"]
    nuevos = svc.mensajes(coach, canal, despues_de=ids[-3])
    assert [m["id"] for m in nuevos["mensajes"]] == ids[-2:]


def test_websocket_entrega_en_vivo(coach, monkeypatch):
    import main

    http = TestClient(main.app)
    email = f"{_PREFIJO}-ws@atvos-prueba.com"
    from src.models import Admin

    with db_session:
        Admin(email=email, nombre="Coach WS", rol="coach")
    monkeypatch.setattr(google_service, "verificar_credencial", lambda _c: {"sub": "ws", "email": email, "nombre": "Coach WS", "foto": None})
    token = http.post("/api/auth/google", json={"credencial": "x" * 30}).json()["token"]
    canal = _canal_de(_cliente(CLI_A))

    with http.websocket_connect("/api/ws") as ws:
        ws.send_json({"tipo": "auth", "token": token})
        assert ws.receive_json()["tipo"] == "listo"
        ws.send_json({"tipo": "ping"})
        assert ws.receive_json()["tipo"] == "pong"
        r = http.post(
            f"/api/mensajes/canales/{canal}/mensajes",
            json={"texto": "llega en vivo"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 201
        evento = ws.receive_json()
        assert evento["tipo"] == "mensaje" and evento["mensaje"]["texto"] == "llega en vivo"

    with http.websocket_connect("/api/ws") as ws:
        ws.send_json({"tipo": "auth", "token": "token-falso"})
        assert ws.receive_json()["tipo"] == "error"


def test_clientes_no_entran_hasta_el_lanzamiento(monkeypatch):
    from src.controllers import mensajeria_controller as mc
    from src.services import mensajeria_service

    monkeypatch.setattr(mensajeria_service, "config", lambda *a, **k: False)
    with pytest.raises(HTTPException) as e:
        mc.sesion_mensajes(_cliente(CLI_A))
    assert e.value.status_code == 403
    assert mc.sesion_mensajes({"usuario_id": 1, "nombre": "x", "email": "x@y.com", "rol": "coach"})["rol"] == "coach"


def test_escribiendo_le_llega_al_otro_y_no_a_quien_escribe(coach, monkeypatch):
    import main

    http = TestClient(main.app)
    from src.models import Admin

    tokens = []
    for n in ("uno", "dos"):
        email = f"{_PREFIJO}-tipeo-{n}@atvos-prueba.com"
        with db_session:
            Admin(email=email, nombre=f"Coach {n}", rol="coach")
        monkeypatch.setattr(
            google_service, "verificar_credencial", lambda _c, e=email, n=n: {"sub": f"tipeo-{n}", "email": e, "nombre": f"Coach {n}", "foto": None}
        )
        tokens.append(http.post("/api/auth/google", json={"credencial": "x" * 30}).json()["token"])
    canal = _canal_de(_cliente(CLI_A))

    with http.websocket_connect("/api/ws") as uno, http.websocket_connect("/api/ws") as dos:
        for ws, tok in ((uno, tokens[0]), (dos, tokens[1])):
            ws.send_json({"tipo": "auth", "token": tok})
            assert ws.receive_json()["tipo"] == "listo"
        uno.send_json({"tipo": "escribiendo", "canal_id": canal})
        evento = dos.receive_json()
        assert evento == {"tipo": "escribiendo", "canal_id": canal, "nombre": "Coach uno", "activo": True}
        uno.send_json({"tipo": "escribiendo", "canal_id": canal, "activo": False})
        assert dos.receive_json()["activo"] is False
        # Quien escribe no recibe su propio aviso: su próximo evento es el pong.
        uno.send_json({"tipo": "ping"})
        assert uno.receive_json()["tipo"] == "pong"
