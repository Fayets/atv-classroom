"""Cuellos de botella: Loom → Jeremy → Juan corrige → la neurona mide y aprende. Jeremy y la IA, simulados."""

import pytest
from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db
from src.models import ClienteExterno
from src.services import cuellos_service as cs

JEREMY = """# Diagnóstico
El problema no es el tráfico: les entran 41 conversaciones por mes y solo 3 terminan en llamada.
Números:
- 41 conversaciones en octubre.
- 3 llamadas (7% de las conversaciones).
El chat informa en vez de abrir una conversación sobre el problema.

# Causas
### Causa 1: El primer mensaje cierra la conversación
El primer mensaje manda precio y PDF.
### Causa 2: No hay guion
No hay preguntas antes de invitar a la llamada.

# Causa vs potenciadores
Los anuncios son el potenciador; la conversación es la causa.

# Qué no hacer
- **No subir el presupuesto.** Más conversaciones son más gente en el "info".

# Solución
### 5.1 Primer mensaje con pregunta
Abrir con una pregunta sobre su situación.
> "¿Qué es lo que más te frena hoy para dormir tranquilo?"

# Métricas a mirar
- **Conversación → llamada:** hoy 7%, objetivo 25%.

# Expectativas
- **Semana 1:** primer mensaje y guion nuevos.
- **Objetivo:** 10 llamadas por mes.

# Cierre
Más tráfico no arregla una conversación que no existe."""


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
    # Numeradas como en el documento de Juan, y los nombres viejos se siguen leyendo.
    assert cs.secciones("# 2. Causas\nx\n# 4. Qué NO hacer\ny") == {"Causas": "x", "Qué no hacer": "y"}
    assert cs.secciones("# Roadmap\n## Semana 1\n- a\n# Meta\nb")["Expectativas"] == "## Semana 1\n- a\nb"
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

    final = JEREMY.replace("El primer mensaje manda precio y PDF.", "Contestan a las 4 horas: la demora pesa más que el precio.")
    r = cs.CuellosServices().aprobar({"usuario_id": 1}, d["id"], final, llamar=lambda *a: "Mirar cuánto tardan en contestar antes de culpar al guion.")
    assert r["estado"] == "aprobado" and r["version_cerebro"]
    assert 0 < r["coincidencia_jeremy"] < 1 and r["coincidencia_cerebro"] is not None
    assert [c["seccion"] for c in r["cambios"]] == ["Causas"] and r["cambios"][0]["propuesta"].startswith("Mirar")

    n = cs.CuellosServices().guardar_lecciones(d["id"], [{"seccion": "Causas", "texto": r["cambios"][0]["propuesta"]}])
    assert n["casos"] >= 1 and n["lecciones"][0]["texto"].startswith("Mirar")
    # La lección va en el próximo pedido.
    _, enviados2 = _pedir()
    assert "Mirar cuánto tardan" in enviados2[0]["lecciones"]


def test_capturas_del_loom(monkeypatch, tmp_path):
    from src.services import cuellos_capturas as cc

    con = JEREMY.replace("- 3 llamadas (7% de las conversaciones).\n", "- 3 llamadas (7% de las conversaciones).\n[captura 03:12]\n")
    assert cc.marcas(con + "\n[Captura 3:12]\n[captura 10:05]") == [192, 605]
    # Pegada al final de una viñeta o en medio de un párrafo (así vino Har Program): va abajo, en su línea.
    pegada = "- **4.602 seguidores:** el tráfico existe. [captura 05:29]\nLa oferta está bien. [captura 13:23] Pero no crea conversaciones."
    assert cc.separar(pegada) == "- **4.602 seguidores:** el tráfico existe.\n[captura 05:29]\nLa oferta está bien. Pero no crea conversaciones.\n[captura 13:23]"
    assert cc.marcas(pegada) == [329, 803]
    # Una foto no es redacción: no cambia cuánto se parece a la final de Juan.
    assert cs.coincidencia(con, JEREMY) == 1.0

    d, enviados = _pedir()
    token = enviados[0]["callback_url"].rsplit("/", 1)[1]
    assert cs.CuellosServices().detalle(d["id"])["captura_base"] == f"/api/cuellos/captura/{token}"
    pedidas = []
    monkeypatch.setattr(cc, "sacar", lambda loom, tok, seg, video=None: pedidas.append((loom, seg)) or tmp_path / "x.jpg")
    assert cs.CuellosServices().captura(token, 192) == tmp_path / "x.jpg" and pedidas == [("a" * 32, 192)]
    with pytest.raises(HTTPException):
        cs.CuellosServices().captura("no-existe", 192)
    # Sin Loom (cierre de mes o contado) no hay capturas.
    sin = cs.CuellosServices().pedir({"usuario_id": 1}, _cliente_id(), None, "No me agendan", None, en_fondo=lambda i: None)
    assert sin["captura_base"] is None


def test_errores_a_la_vista():
    with pytest.raises(HTTPException):
        cs.CuellosServices().pedir({"usuario_id": 1}, _cliente_id(), "https://youtube.com/x", None, None, en_fondo=lambda i: None)
    falla = lambda i: cs.procesar(i, llamar=lambda *a: "", mandar=lambda p: (_ for _ in ()).throw(RuntimeError("Falta configurar Jeremy")), leer_loom=lambda u: "x")  # noqa: E731
    d = cs.CuellosServices().pedir({"usuario_id": 1}, _cliente_id(), "https://www.loom.com/share/" + "b" * 32, None, None, en_fondo=falla)
    det = cs.CuellosServices().detalle(d["id"])
    assert det["estado"] == "error" and "Jeremy" in det["error"]
    with pytest.raises(HTTPException):
        cs.CuellosServices().recibir("no-existe", {"output": "x"})


def test_un_documento_vacio_no_pisa_el_borrador():
    d, enviados = _pedir()
    token = enviados[0]["callback_url"].rsplit("/", 1)[1]
    cs.CuellosServices().recibir(token, {"output": JEREMY})
    vacio = "\n\n".join(f"# {s}\n" for s in cs.SECCIONES)
    for hacer in (lambda: cs.CuellosServices().guardar(d["id"], vacio), lambda: cs.CuellosServices().aprobar({"usuario_id": 1}, d["id"], vacio)):
        with pytest.raises(HTTPException):
            hacer()
    assert cs.CuellosServices().detalle(d["id"])["version_final"] == JEREMY



def test_ultimo_del_cliente():
    d, _ = _pedir()
    assert cs.CuellosServices().de_cliente(d["cliente_id"], 1)["ultimo"] == d["id"]


def test_el_borrador_sin_enviar_es_de_quien_lo_pidio():
    d, enviados = _pedir()  # lo pide el usuario 1
    otro = 999
    assert cs.CuellosServices().de_cliente(d["cliente_id"], otro)["ultimo"] != d["id"]
    token = enviados[0]["callback_url"].rsplit("/", 1)[1]
    cs.CuellosServices().recibir(token, {"output": JEREMY})
    cs.CuellosServices().aprobar({"usuario_id": 1}, d["id"], JEREMY, llamar=lambda *a, **k: "[]")
    assert cs.CuellosServices().de_cliente(d["cliente_id"], otro)["ultimo"] == d["id"]  # enviado, lo ven todos


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


def test_borrar_un_diagnostico():
    d, _ = _pedir()
    assert cs.CuellosServices().borrar(d["id"]) == {"ok": True}
    with pytest.raises(HTTPException):
        cs.CuellosServices().detalle(d["id"])
