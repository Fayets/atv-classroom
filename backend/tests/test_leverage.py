"""Entrar con el classroom desde ATV Leverage: código de un solo uso, clave personal y quién es.

No tocan ninguna base: las tablas (Admin, CodigoLeverage, ClaveLeverage) se reemplazan por listas en memoria
y db_session por un contexto vacío."""

import contextlib
import hashlib
from datetime import datetime, timedelta
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from src.services import leverage_service as svc

VUELTA = "http://127.0.0.1:4710/classroom/vuelta"
ESTADO = "estado-de-prueba-123456"


class _Tabla:
    """Lo mínimo de una entidad de Pony: crear con kwargs y get(**filtros)."""

    def __init__(self, **defaults):
        self.filas = []
        self.defaults = defaults

    def __call__(self, **campos):
        fila = SimpleNamespace(id=len(self.filas) + 1, **{**self.defaults, **campos})
        self.filas.append(fila)
        return fila

    def get(self, **filtros):
        return next((f for f in self.filas if all(getattr(f, k) == v for k, v in filtros.items())), None)


@pytest.fixture
def base(monkeypatch):
    admins = _Tabla()
    admins(nombre="Franco", email="franco@atv.com", rol="admin", area="sistemas", activo=True, borrado=False)
    admins(nombre="Nick", email="nick@atv.com", rol="coach", area="ventas", activo=True, borrado=False)
    admins(nombre="Ex", email="ex@atv.com", rol="coach", area="fulfillment", activo=True, borrado=True)
    admins(nombre="Maite", email="maite@atv.com", rol="coach", area="marketing", activo=True, borrado=False)
    codigos = _Tabla(creado_en=datetime.utcnow(), usado_en=None)
    claves = _Tabla(usada_en=None, revocada_en=None)
    monkeypatch.setattr(svc, "Admin", admins)
    monkeypatch.setattr(svc, "CodigoLeverage", codigos)
    monkeypatch.setattr(svc, "ClaveLeverage", claves)
    monkeypatch.setattr(svc, "db_session", contextlib.nullcontext())
    return SimpleNamespace(admins=admins, codigos=codigos, claves=claves)


def _codigo_de(url: str) -> str:
    return parse_qs(urlparse(url).query)["codigo"][0]


def test_el_equipo_acepta_y_leverage_canjea_una_sola_vez(base):
    r = svc.autorizar({"rol": "admin", "usuario_id": 1}, VUELTA, ESTADO)
    assert r["url"].startswith(f"{VUELTA}?")
    assert parse_qs(urlparse(r["url"]).query)["estado"] == [ESTADO]
    codigo = _codigo_de(r["url"])
    # En la base queda el hash del código, nunca el código.
    assert base.codigos.filas[0].sha256 == hashlib.sha256(codigo.encode()).hexdigest()

    c = svc.canjear(codigo, VUELTA)
    assert c["persona"] == {"id": 1, "nombre": "Franco", "rol": "admin", "area": "sistemas"}
    assert c["scopes"] == ["lectura", "piloto", "plata"]
    assert c["clave"].startswith("lev_")
    assert base.claves.filas[0].sha256 == hashlib.sha256(c["clave"].encode()).hexdigest()

    with pytest.raises(HTTPException) as e:
        svc.canjear(codigo, VUELTA)
    assert e.value.status_code == 400


def test_el_codigo_vence_y_no_sirve_para_otra_vuelta(base):
    codigo = _codigo_de(svc.autorizar({"rol": "coach", "usuario_id": 2}, VUELTA, ESTADO)["url"])
    with pytest.raises(HTTPException):
        svc.canjear(codigo, "http://127.0.0.1:9999/classroom/vuelta")
    with pytest.raises(HTTPException):
        svc.canjear(codigo, VUELTA, ahora=datetime.utcnow() + timedelta(minutes=6))
    assert svc.canjear(codigo, VUELTA)["scopes"] == ["lectura", "piloto", "plata"]  # Nick es de ventas: ve plata


def test_solo_el_equipo_y_solo_esta_compu(base):
    with pytest.raises(HTTPException) as e:
        svc.autorizar({"rol": "cliente", "usuario_id": 1}, VUELTA, ESTADO)
    assert e.value.status_code == 403
    with pytest.raises(HTTPException) as e:
        svc.autorizar({"rol": "coach", "usuario_id": 3}, VUELTA, ESTADO)  # borrado del equipo
    assert e.value.status_code == 403
    for vuelta in ["https://otro.com/classroom/vuelta", "http://127.0.0.1:4710/otra", "http://127.0.0.1.otro.com:80/classroom/vuelta"]:
        with pytest.raises(HTTPException) as e:
            svc.autorizar({"rol": "admin", "usuario_id": 1}, vuelta, ESTADO)
        assert e.value.status_code == 422
    with pytest.raises(HTTPException):
        svc.autorizar({"rol": "admin", "usuario_id": 1}, VUELTA, "corto")


def test_la_clave_dice_quien_es_y_se_corta_al_desconectar(base):
    c = svc.canjear(_codigo_de(svc.autorizar({"rol": "coach", "usuario_id": 4}, VUELTA, ESTADO)["url"]), VUELTA)
    huella = hashlib.sha256(c["clave"].encode()).hexdigest()
    agente = svc.agente_de_clave(huella)
    assert agente["persona"]["nombre"] == "Maite"
    assert agente["scopes"] == ["lectura", "piloto"]  # marketing no ve plata
    assert base.claves.filas[0].usada_en is not None
    assert svc.desconectar(agente) == {"desconectado": True}
    assert svc.agente_de_clave(huella) is None
    assert svc.agente_de_clave("no-existe") is None
    with pytest.raises(HTTPException):
        svc.desconectar({"nombre": "general", "scopes": ["lectura"]})


def test_si_la_persona_deja_el_equipo_su_clave_deja_de_andar(base):
    c = svc.canjear(_codigo_de(svc.autorizar({"rol": "coach", "usuario_id": 2}, VUELTA, ESTADO)["url"]), VUELTA)
    base.admins.get(id=2).activo = False
    assert svc.agente_de_clave(hashlib.sha256(c["clave"].encode()).hexdigest()) is None


def test_la_api_de_agentes_acepta_la_clave_personal(base, monkeypatch):
    """agente_desde_request: si la clave no es una general, se busca entre las personales."""
    from src.controllers.agentes_controller import router
    from src.services import agentes_service

    monkeypatch.setattr(agentes_service, "_claves", lambda: {"general": {"sha256": "x" * 64, "scopes": ["lectura"]}})
    c = svc.canjear(_codigo_de(svc.autorizar({"rol": "admin", "usuario_id": 1}, VUELTA, ESTADO)["url"]), VUELTA)
    app = FastAPI()
    app.include_router(router)
    cliente = TestClient(app)
    r = cliente.get("/api/agentes/yo", headers={"X-Agente-Key": c["clave"]})
    assert r.status_code == 200
    assert r.json()["persona"]["nombre"] == "Franco"
    assert cliente.get("/api/agentes/yo", headers={"X-Agente-Key": "lev_inventada"}).status_code == 401
    assert cliente.post("/api/agentes/desconectar", headers={"X-Agente-Key": c["clave"]}).json() == {"desconectado": True}
    assert cliente.get("/api/agentes/yo", headers={"X-Agente-Key": c["clave"]}).status_code == 401


def test_dejar_un_mensaje_listo_solo_a_nombre_de_la_persona(base, monkeypatch):
    """POST /api/agentes/piloto/borradores: con la clave personal queda a nombre de esa persona; con la general, no."""
    from src.controllers.agentes_controller import router
    from src.services import agentes_service, piloto_service

    general = "clave-general-con-piloto"
    monkeypatch.setattr(agentes_service, "_claves", lambda: {"leverage-piloto": {"sha256": hashlib.sha256(general.encode()).hexdigest(), "scopes": ["lectura", "piloto"]}})
    pedidos = []
    monkeypatch.setattr(piloto_service, "preparar_por_persona", lambda admin_id, texto, canal_id=None, cliente_id=None: pedidos.append((admin_id, texto, canal_id, cliente_id)) or {"id": 9, "estado": "pendiente"})
    c = svc.canjear(_codigo_de(svc.autorizar({"rol": "coach", "usuario_id": 2}, VUELTA, ESTADO)["url"]), VUELTA)
    app = FastAPI()
    app.include_router(router)
    cliente = TestClient(app)
    r = cliente.post("/api/agentes/piloto/borradores", headers={"X-Agente-Key": c["clave"]}, json={"cliente_id": 68, "texto": "buenas! ya miro la landing"})
    assert r.status_code == 200
    assert pedidos == [(2, "buenas! ya miro la landing", None, 68)]
    assert cliente.post("/api/agentes/piloto/borradores", headers={"X-Agente-Key": general}, json={"cliente_id": 68, "texto": "x"}).status_code == 403
    assert cliente.post("/api/agentes/piloto/borradores", headers={"X-Agente-Key": c["clave"]}, json={"texto": "x"}).status_code == 422
    assert len(pedidos) == 1
