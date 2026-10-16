"""Webhook de Fathom: se crea al conectar, se verifica la firma y guarda la llamada sin buscar cada 15 min."""
import base64
import hashlib
import hmac
import json
import time

import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db
from src.models import FathomConexion, Llamada
from src.services import fathom_service as fs
from src.services.cifrado import cifrar

ADMIN = 999998801
SECRETO = "whsec_" + base64.b64encode(b"secreto-de-prueba-123456").decode()


def _firmar(cuerpo: bytes, msg_id="msg_1", marca=None):
    marca = str(int(time.time())) if marca is None else marca
    clave = base64.b64decode(SECRETO.split("_", 1)[1])
    firma = base64.b64encode(hmac.new(clave, f"{msg_id}.{marca}.".encode() + cuerpo, hashlib.sha256).digest()).decode()
    return {"webhook-id": msg_id, "webhook-timestamp": marca, "webhook-signature": f"v1,{firma}"}


@pytest.fixture
def conexion(monkeypatch):
    if db.provider is None:
        init_db()
    monkeypatch.setattr(fs, "WEBHOOK", True)
    with db_session:
        FathomConexion(admin_id=ADMIN, clave_cifrada=cifrar("clave-fathom-de-prueba-123456"))
    yield
    with db_session:
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."llamadas" WHERE admin_id = $a', {"a": ADMIN})
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."fathom_conexiones" WHERE admin_id = $a', {"a": ADMIN})


class _Resp:
    def __init__(self, status, datos):
        self.status_code, self._d = status, datos

    def json(self):
        return self._d


def test_al_conectar_se_crea_el_webhook_y_el_aviso_firmado_guarda_la_llamada(conexion):
    pedido = {}

    def post(url, json=None, headers=None, timeout=None):
        pedido.update(url=url, cuerpo=json)
        return _Resp(201, {"id": "wh_123", "secret": SECRETO})

    assert fs.crear_webhook(ADMIN, http=post)
    assert pedido["url"].endswith("/webhooks") and pedido["cuerpo"]["triggered_for"] == ["my_recordings"]
    assert pedido["cuerpo"]["include_transcript"] is True
    token = pedido["cuerpo"]["destination_url"].rsplit("/", 1)[1]
    assert not fs.crear_webhook(ADMIN, http=post)  # ya tiene uno: no crea otro

    item = {"recording_id": 999998801001, "title": "Prueba webhook", "url": "https://fathom.video/calls/999998801001",
            "recording_start_time": "2026-10-16T01:00:00Z", "recording_end_time": "2026-10-16T01:30:00Z",
            "calendar_invitees": [], "transcript": [{"speaker": {"display_name": "Ana"}, "text": "hola"}]}
    cuerpo = json.dumps(item).encode()
    assert fs.recibir_webhook(token, _firmar(cuerpo), cuerpo) is True
    assert fs.recibir_webhook(token, _firmar(cuerpo, "msg_2"), cuerpo) is False  # reenvío: no duplica
    with db_session:
        assert Llamada.get(fathom_id="999998801001").duracion_min == 30


def test_rechaza_firma_falsa_aviso_viejo_y_token_desconocido(conexion):
    fs.crear_webhook(ADMIN, http=lambda *a, **k: _Resp(201, {"id": "wh_9", "secret": SECRETO}))
    with db_session:
        token = FathomConexion.get(admin_id=ADMIN).webhook_token
    cuerpo = b'{"recording_id": 1}'
    falsa = {**_firmar(cuerpo), "webhook-signature": "v1,AAAA"}
    with pytest.raises(HTTPException) as e:
        fs.recibir_webhook(token, falsa, cuerpo)
    assert e.value.status_code == 401
    with pytest.raises(HTTPException):
        fs.recibir_webhook(token, _firmar(cuerpo, marca=str(int(time.time()) - 3600)), cuerpo)  # de hace una hora
    with pytest.raises(HTTPException) as e:
        fs.recibir_webhook("no-existe", _firmar(cuerpo), cuerpo)
    assert e.value.status_code == 404


def test_si_fathom_falla_queda_el_error_y_sigue_la_revision(conexion):
    assert not fs.crear_webhook(ADMIN, http=lambda *a, **k: _Resp(400, {}))
    with db_session:
        con = FathomConexion.get(admin_id=ADMIN)
        assert con.webhook_id is None and "revisión diaria" in con.error
    assert fs.sin_webhook() >= 1
