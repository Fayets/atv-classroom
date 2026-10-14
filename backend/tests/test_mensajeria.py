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
        from src.models import Adjunto, Mencion

        for men in list(Mencion.select()):
            if men.canal_id in ids_canal:
                men.delete()
        from src.storage import adjuntos as almacen

        for adj in list(Adjunto.select()):
            if adj.canal_id in ids_canal:
                ruta = almacen.ruta_de(adj.archivo)
                if ruta:
                    ruta.unlink()
                adj.delete()
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
    """Admin del equipo: ve todos los canales (el coach solo ve donde lo etiquetan)."""
    from src.models import Admin

    with db_session:
        a = Admin(email=f"{_PREFIJO}-admin@atvos-prueba.com", nombre="Admin Test", rol="admin", area="ventas")
        db.flush()
        return {"usuario_id": a.id, "nombre": "Admin Test", "email": a.email, "rol": "admin"}


@pytest.fixture(scope="module")
def coach_real():
    from src.models import Admin

    with db_session:
        a = Admin(email=f"{_PREFIJO}-juampi@atvos-prueba.com", nombre="Zebedeo Pruebatest", rol="coach", area="ventas")
        db.flush()
        return {"usuario_id": a.id, "nombre": "Zebedeo Pruebatest", "email": a.email, "rol": "coach"}


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
    # Como en Discord: el borrado desaparece y la respuesta que lo citaba queda sin texto.
    assert pregunta["id"] not in [m["id"] for m in ultimos]
    assert ultimos[-1]["respuesta_a"]["texto"] is None


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
        Admin(email=email, nombre="Coach WS", rol="admin")
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
            Admin(email=email, nombre=f"Coach {n}", rol="admin")
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


def test_el_coach_ve_la_bandeja_y_la_alerta_mide_la_demora(coach, coach_real):
    a = _cliente(CLI_A)
    canal = _canal_de(a)
    # El coach ve los chats de los clientes como el admin, aunque no lo hayan etiquetado.
    assert svc.mensajes(dict(coach_real), canal)["mensajes"] is not None

    m, _ = svc.enviar(a, canal, "@Zebedeo no me queda claro el paso 3", None)
    assert m["menciones"] == [coach_real["usuario_id"]]

    alertas = svc.menciones(dict(coach_real))
    assert alertas["pendientes"] == 1 and alertas["alertas"][0]["estado"] == "pendiente"
    assert alertas["alertas"][0]["autor"]["tipo"] == "cliente"

    # Al responder, la alerta queda respondida con su demora.
    assert svc.mensajes(dict(coach_real), canal)["mensajes"][-1]["id"] == m["id"]
    svc.enviar(dict(coach_real), canal, "Te lo explico: es el guion de setting", None)
    alertas = svc.menciones(dict(coach_real))
    assert alertas["pendientes"] == 0 and alertas["alertas"][0]["estado"] == "respondida"
    assert alertas["promedio_minutos"] is not None

    # Etiquetar por el autocompletado (ids) también vale, aunque el texto diga otra cosa.
    m2, _ = svc.enviar(coach, canal, "¿lo ves vos?", None, [coach_real["usuario_id"]])
    assert m2["menciones"] == [coach_real["usuario_id"]]
    pend = svc.menciones(dict(coach_real))["alertas"][0]
    assert svc.resolver_mencion(dict(coach_real), pend["id"])["respondida_en"]
    assert svc.menciones(dict(coach_real))["pendientes"] == 0


def test_mail_de_prueba_la_ve_antes_del_lanzamiento(monkeypatch):
    from src.services import mensajeria_service

    valores = {"MENSAJES_CLIENTES": False, "MENSAJES_PRUEBA": "Prueba@Atvos.io, otro@x.com"}
    monkeypatch.setattr(mensajeria_service, "config", lambda clave, **k: valores.get(clave, k.get("default")))
    assert mensajeria_service.habilitada_para({"usuario_id": 5, "email": "prueba@atvos.io", "rol": "mid"})
    assert not mensajeria_service.habilitada_para({"usuario_id": 6, "email": "cliente@x.com", "rol": "mid"})


def test_adjuntos_se_suben_se_atan_y_se_bajan_con_link_firmado(coach):
    import main

    http = TestClient(main.app)
    a = _cliente(CLI_A)
    canal = _canal_de(a)
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 2000

    adj = svc.subir_adjunto(a, canal, "captura del funnel.png", iter([png]))
    assert adj["tipo_mime"] == "image/png" and adj["tamano"] == len(png)
    with pytest.raises(HTTPException) as e:
        svc.subir_adjunto(a, canal, "pagina.html", iter([b"<script>"]))
    assert e.value.status_code == 415
    # Otro cliente no puede subir al canal de A ni usar su archivo.
    with pytest.raises(HTTPException):
        svc.subir_adjunto(_cliente(CLI_B), canal, "x.png", iter([png]))

    m, _ = svc.enviar(a, canal, "", None, None, [adj["id"]])
    assert m["texto"] == "" and m["adjuntos"][0]["nombre"] == "captura del funnel.png"
    with pytest.raises(HTTPException):
        svc.enviar(a, canal, "de nuevo", None, None, [adj["id"]])  # ya está atado a un mensaje

    url = svc.mensajes(coach, canal)["mensajes"][-1]["adjuntos"][0]["url"]
    r = http.get(url)
    assert r.status_code == 200 and r.content == png and r.headers["x-content-type-options"] == "nosniff"
    assert http.get(url.split("?")[0] + "?f=1.falsa").status_code == 403

    # Borrado el mensaje, el archivo deja de servirse.
    svc.borrar(a, m["id"])
    assert http.get(url).status_code == 404


def test_el_cliente_manda_notas_de_voz_y_el_equipo_no(coach):
    a = _cliente(CLI_A)
    canal = _canal_de(a)
    audio = b"\x1aE\xdf\xa3" + b"0" * 3000  # cabecera de webm
    adj = svc.subir_adjunto(a, canal, "nota-de-voz.webm", iter([audio]))
    assert adj["tipo_mime"] == "audio/webm"
    m, _ = svc.enviar(a, canal, "", None, None, [adj["id"]])
    assert m["adjuntos"][0]["tipo_mime"] == "audio/webm"
    with pytest.raises(HTTPException) as e:
        svc.subir_adjunto(coach, canal, "respuesta.m4a", iter([audio]))
    assert e.value.status_code == 403
    svc.borrar(a, m["id"])


def test_en_el_chat_del_cliente_se_puede_etiquetar_al_cliente(coach):
    a = _cliente(CLI_A)
    canal = _canal_de(a)
    lista = svc.participantes(coach, canal)
    assert lista and lista[0]["clave"] == f"c{CLI_A}" and lista[0]["detalle"] == "Cliente"
    with pytest.raises(HTTPException):
        svc.participantes(_cliente(CLI_B), canal)  # otro cliente no ve ese chat


def test_el_equipo_pasa_un_chat_a_inactivos_y_lo_devuelve(coach):
    canal = _canal_de(_cliente(CLI_A))
    with pytest.raises(HTTPException) as e:
        svc.marcar_inactivo(_cliente(CLI_A), canal, True)  # el cliente no archiva su propio chat
    assert e.value.status_code == 403
    svc.marcar_inactivo(coach, canal, True)
    from src.models import Canal

    with db_session:
        assert Canal.get(id=canal).inactivo is True
    assert all(c["inactivo"] is False for c in svc.listar_canales(_cliente(CLI_A)))  # el cliente no se entera
    svc.marcar_inactivo(coach, canal, False)
    with db_session:
        assert Canal.get(id=canal).inactivo is False
