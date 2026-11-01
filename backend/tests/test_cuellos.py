"""Cuellos de botella: Loom → Jeremy → Juan corrige → la neurona mide y aprende. Jeremy y la IA, simulados."""

import pytest
from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db
from src.models import ClienteExterno
from src.services import cuellos_service as cs

JEREMY = """# Diagnóstico
Le entran 41 conversaciones por mes y solo 3 pasan a llamada.

# Causas
- El primer mensaje manda precio y PDF [chat 22-10]
- No hay guion antes de invitar [Loom 07:40]

# Qué no hacer
- Subir el presupuesto de anuncios.

# Solución
Primer mensaje con una pregunta y un guion de 3 preguntas.

# Roadmap
## Semana 1 — 03-11
- Cambiar el primer mensaje.

# Meta
De 3 a 10 llamadas por mes."""


@pytest.fixture(autouse=True)
def base():
    if config("DB_HOST", default="") not in ("127.0.0.1", "localhost"):
        pytest.skip("Solo con la base local.")
    if db.provider is None:
        init_db()
    with db_session:
        antes = db.select(f'SELECT coalesce(max(id), 0) FROM "{DB_SCHEMA}"."cuellos_diagnosticos"')[0]
    yield
    with db_session:
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."cuellos_lecciones" WHERE diagnostico_id > $antes')
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."cuellos_diagnosticos" WHERE id > $antes')


def _cliente_id() -> int:
    with db_session:
        c = ClienteExterno.select().first()
        if c is None:
            pytest.skip("La base local no tiene clientes.")
        return c.id


def _pedir(**kw):
    enviados = []
    sync = lambda i: cs.procesar(i, llamar=lambda s, u, *a: JEREMY.replace("41", "40"), mandar=enviados.append, leer_loom=lambda u: "00:01 hola")  # noqa: E731
    d = cs.CuellosServices().pedir({"usuario_id": 1}, _cliente_id(), kw.get("loom", "https://www.loom.com/share/" + "a" * 32), None, "Coaching", en_fondo=sync)
    return d, enviados


def test_secciones_y_coincidencia():
    s = cs.secciones(JEREMY)
    assert list(s) == cs.SECCIONES and "41 conversaciones" in s["Diagnóstico"]
    assert cs.coincidencia(JEREMY, JEREMY) == 1.0
    assert cs.coincidencia("# Diagnóstico\notra cosa", JEREMY) < 0.3


def test_recorrido_completo():
    d, enviados = _pedir()
    det = cs.CuellosServices().detalle(d["id"])
    assert det["estado"] == "esperando" and det["transcripcion"] == "00:01 hola"
    p = enviados[0]
    assert "/api/cuellos/jeremy/" in p["callback_url"]
    assert p["diagnostico_id"] == str(d["id"]) and p["transcripcion"] == "00:01 hola"
    # El cerebro armó su versión pero no se ve hasta aprobar.
    assert det["cerebro_listo"] and det["version_cerebro"] is None

    token = p["callback_url"].rsplit("/", 1)[1]
    cs.CuellosServices().recibir(token, {"diagnostico_id": str(d["id"]), "output": JEREMY})
    assert cs.CuellosServices().detalle(d["id"])["estado"] == "borrador"

    final = JEREMY.replace("- El primer mensaje manda precio y PDF [chat 22-10]", "- Contestan a las 4 horas [chat 22-10]")
    r = cs.CuellosServices().aprobar({"usuario_id": 1}, d["id"], final, llamar=lambda *a: "Mirar cuánto tardan en contestar antes de culpar al guion.")
    assert r["estado"] == "aprobado" and r["version_cerebro"]
    assert 0 < r["coincidencia_jeremy"] < 1 and r["coincidencia_cerebro"] is not None
    assert [c["seccion"] for c in r["cambios"]] == ["Causas"] and r["cambios"][0]["propuesta"].startswith("Mirar")

    n = cs.CuellosServices().guardar_lecciones(d["id"], [{"seccion": "Causas", "texto": r["cambios"][0]["propuesta"]}])
    assert n["casos"] >= 1 and n["lecciones"][0]["texto"].startswith("Mirar")
    # La lección va en el próximo pedido.
    _, enviados2 = _pedir()
    assert "Mirar cuánto tardan" in enviados2[0]["lecciones"]


def test_errores_a_la_vista():
    with pytest.raises(HTTPException):
        cs.CuellosServices().pedir({"usuario_id": 1}, _cliente_id(), "https://youtube.com/x", None, None, en_fondo=lambda i: None)
    falla = lambda i: cs.procesar(i, llamar=lambda *a: "", mandar=lambda p: (_ for _ in ()).throw(RuntimeError("Falta configurar Jeremy")), leer_loom=lambda u: "x")  # noqa: E731
    d = cs.CuellosServices().pedir({"usuario_id": 1}, _cliente_id(), "https://www.loom.com/share/" + "b" * 32, None, None, en_fondo=falla)
    det = cs.CuellosServices().detalle(d["id"])
    assert det["estado"] == "error" and "Jeremy" in det["error"]
    with pytest.raises(HTTPException):
        cs.CuellosServices().recibir("no-existe", {"output": "x"})



def test_ultimo_del_cliente():
    d, _ = _pedir()
    assert cs.CuellosServices().de_cliente(d["cliente_id"])["ultimo"] == d["id"]


def test_desde_el_cierre_de_mes_o_contado():
    import json as _json

    cid = _cliente_id()
    r = {"conversaciones": 41, "agendas": 6, "llamadas": 3, "ventas": 1, "cash": 1500, "cuello": "Ventas", "cuello_por_que": "No cierro"}
    with db_session:
        db.execute(f'INSERT INTO "{DB_SCHEMA}"."cierres_respuestas" (periodo, cliente_id, creador, respuestas_json, completado_en) VALUES (\'2099-01\', $cid, \'\', $rj, now())',
                   {"cid": cid, "rj": _json.dumps(r)})
    try:
        assert {"periodo": "2099-01", "cuello": "Ventas", "typeform": False} in cs.CuellosServices().de_cliente(cid)["cierres"]
        enviados = []
        d = cs.CuellosServices().pedir({"usuario_id": 1}, cid, None, None, None, cierre_periodo="2099-01",
                                       en_fondo=lambda i: cs.procesar(i, llamar=lambda *a: "", mandar=enviados.append, leer_loom=None))
        t = enviados[0]["transcripcion"]
        assert t.startswith("Reporte de cierre de mes 2099-01") and "Conversaciones: 41" in t and "Su principal cuello de botella: Ventas" in t
        assert d["loom_url"] is None
        enviados.clear()
        cs.CuellosServices().pedir({"usuario_id": 1}, cid, None, "No me cierran las llamadas", None,
                                   en_fondo=lambda i: cs.procesar(i, llamar=lambda *a: "", mandar=enviados.append, leer_loom=None))
        assert enviados[0]["transcripcion"].startswith("Lo que contó el cliente")
        with pytest.raises(HTTPException):
            cs.CuellosServices().pedir({"usuario_id": 1}, cid, None, None, None, cierre_periodo="2098-01", en_fondo=lambda i: None)
    finally:
        with db_session:
            db.execute(f'DELETE FROM "{DB_SCHEMA}"."cierres_respuestas" WHERE periodo = \'2099-01\' AND cliente_id = $cid', {"cid": cid})


def test_si_el_cerebro_fallo_se_vuelve_a_armar():
    def falla(*a):
        raise RuntimeError("sin clave")

    d = cs.CuellosServices().pedir({"usuario_id": 1}, _cliente_id(), "https://www.loom.com/share/" + "e" * 32, None, None,
                                   en_fondo=lambda i: cs.procesar(i, llamar=falla, mandar=lambda p: None, leer_loom=lambda u: "x"))
    assert not cs.CuellosServices().detalle(d["id"])["cerebro_listo"]
    assert cs.armar_cerebro(d["id"], llamar=lambda *a: JEREMY)
    assert cs.CuellosServices().detalle(d["id"])["cerebro_listo"]
