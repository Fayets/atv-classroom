"""Pizarra del onboarding: lo que dice la IA pasa por el código (citas literales, preguntas respondidas),
lo que se lee directo del formulario no usa IA, y se arma una vez por formulario."""

import json

import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import db, init_db
from src.services import pizarra_service as ps

RESP = {
    "5": "Entrenamiento de closers high ticket",
    "8": "Low ticket de 200 o 300 (no definido) y high ticket de 1.5K",
    "9": "Aun no creo contenido, tengo 800 contactos en LinkedIn",
    "10": "NA", "16": "NA", "14": "", "15": "na", "18": "-", "20": "NA", "21": "NA",
    "29": "Falta de claridad para escalar, Falta de leads calificados",
    "30": "Falta de saber por donde empezar, quiero estructurar bien el producto",
    "32": "Instagram", "40": "El roadmap y claridad que podía obtener, Los casos de éxito",
    "41": "Que no frenaron cuando dije que estaba desde 0", "45": "8",
}

CRUDO = {
    "negocios": [{
        "persona": "Oscar", "marca": "ASSENSUS", "rubro": "closing",
        "que_vende": {"texto": "Entrenamiento de closers", "p": "5"},
        "contexto": [{"texto": "800 contactos en LinkedIn", "p": "9"}, {"texto": "inventado", "p": "10"}, {"texto": "sin pregunta"}],
        "cuellos": [
            {"titulo": "Sin evidencia", "sintoma": {"texto": "algo", "evidencia": [{"cita": "una frase que nunca escribió", "p": "9"}]},
             "causa": "x", "solucion": "y"},
            {"titulo": "Oferta sin precio", "sintoma": {"texto": "No tiene precio definido", "evidencia": [
                {"cita": "200 o 300 (no definido)", "p": "8"}, {"dato": "de una pregunta NA", "p": "10"}]},
             "causa": "No validó la oferta con clientes", "impacto": "No puede vender", "solucion": "Definir un precio y venderlo a 5",
             "su_frase": {"cita": "Falta de saber por donde empezar", "p": "30"}, "falta": "¿Cuánto cobra hoy?"},
            {"titulo": "Sin causa", "sintoma": {"texto": "z", "evidencia": [{"dato": "800 contactos", "p": "9"}]}, "solucion": "y"},
        ],
        "prioridad": {"cuello": 2, "por_que": "Sin precio no hay nada que vender"},
        "decidir": ["¿Qué precio vas a cobrar?", "", "¿A quién le vendés primero?"],
        "freno": {"cita": "Falta de saber por donde empezar", "p": "30"},
        "hoy": [{"texto": "Sin contenido", "p": "P9"}],
        "meta": None,
    }],
    "termometro": [
        {"nombre": "Contenido publicado", "estado": "nada", "nota": "nada", "p": "9"},
        {"nombre": "Proceso de ventas", "estado": "algo", "nota": "de otra pregunta", "p": "5"},
        {"nombre": "Inventado", "estado": "listo", "p": "5"},
    ],
    "alertas": [{"texto": "Depende solo de LinkedIn", "p": "9"}, {"texto": "No mide nada", "p": None}, {"texto": "Inventada", "p": "10"}],
    "esperan": [{"texto": "No frenaron", "p": "41"}, {"texto": "Su meta", "p": "31"}],
    "citas": [
        {"cita": "Que no frenaron cuando dije que estaba desde 0", "quien": "Oscar", "p": "41"},
        {"cita": "una frase que nunca escribió en el formulario", "p": "41"},
        {"cita": "Falta de saber por donde empezar", "p": "30"},
    ],
}


def test_validar_descarta_lo_que_no_se_puede_comprobar():
    d = ps.validar(CRUDO, RESP)
    n = d["negocios"][0]
    assert [a["texto"] for a in n["contexto"]] == ["800 contactos en LinkedIn"]  # la de una pregunta "NA" y la sin pregunta no
    # Solo queda el cuello con evidencia comprobable y causa + solución; su evidencia de una pregunta NA se cae.
    assert [c["titulo"] for c in n["cuellos"]] == ["Oferta sin precio"]
    c = n["cuellos"][0]
    assert c["sintoma"]["evidencia"] == [{"cita": "200 o 300 (no definido)", "dato": None, "p": "8"}]
    assert c["su_frase"]["cita"] == "Falta de saber por donde empezar" and c["falta"] == "¿Cuánto cobra hoy?"
    assert n["prioridad"] == {"cuello": 1, "por_que": "Sin precio no hay nada que vender"}  # el 2 de la IA es el 1 que quedó
    assert n["decidir"] == ["¿Qué precio vas a cobrar?", "¿A quién le vendés primero?"]
    assert n["freno"]["cita"] == "Falta de saber por donde empezar"
    assert n["hoy"] == [{"texto": "Sin contenido", "p": "9"}]  # "P9" se normaliza
    termo = {t["nombre"]: t for t in d["termometro"]}
    assert termo["Contenido publicado"]["estado"] == "nada"
    assert termo["Proceso de ventas"]["estado"] == "sin_dato"  # la IA lo sacó de otra pregunta: no vale
    assert termo["Equipo"]["estado"] == "sin_dato"
    assert "Inventado" not in termo
    assert [a["texto"] for a in d["alertas"]] == ["Depende solo de LinkedIn", "No mide nada"]  # la de una pregunta NA no
    assert [e["texto"] for e in d["esperan"]] == ["No frenaron"]
    assert [c["cita"] for c in d["citas"]] == ["Que no frenaron cuando dije que estaba desde 0"]


def test_prioridad_que_apunta_a_un_cuello_descartado_no_va():
    crudo = {"negocios": [{**CRUDO["negocios"][0], "prioridad": {"cuello": 1, "por_que": "el que no tenía evidencia"}}]}
    assert ps.validar(crudo, RESP)["negocios"][0]["prioridad"] is None


def test_validar_aguanta_basura():
    d = ps.validar({"negocios": "x", "termometro": [1, None], "citas": "y", "alertas": "z"}, RESP)
    assert d["negocios"] == [] and d["citas"] == [] and d["alertas"] == []
    d = ps.validar({"negocios": [{"cuellos": "x", "decidir": 3, "prioridad": {"cuello": "a"}}]}, RESP)
    assert d["negocios"] == []
    assert ps.validar(None, {})["negocios"] == []


def test_lo_del_formulario_sale_sin_ia():
    d = ps.del_formulario(RESP)
    assert [p["texto"] for p in d["problemas"]] == ["Falta de claridad para escalar", "Falta de leads calificados"]
    assert [p["texto"] for p in d["por_que_entro"]] == ["El roadmap y claridad que podía obtener", "Los casos de éxito"]
    assert {"etiqueta": "Convencido antes de la llamada", "valor": "8/10", "p": "45"} in d["llegada"]
    assert "10" in d["sin_responder"] and "5" not in d["sin_responder"]


def test_ver_arma_una_vez_y_la_guarda():
    if db.provider is None:
        init_db()
    from src.models import PizarraOnboarding

    with db_session:
        fila = db.select("SELECT s.id::text FROM onboarding.sessions s JOIN onboarding.forms f ON f.session_id = s.id LIMIT 1")
    if not fila:
        pytest.skip("No hay formularios en la base")
    sid = fila[0]
    with db_session:
        previa = PizarraOnboarding.get(session_id=sid)
        guardada = (previa.datos_json, previa.respondido_en, previa.modelo, previa.creado_en) if previa else None
    llamadas = []

    def falsa(s, u):
        llamadas.append(u)
        return CRUDO

    coach = {"usuario_id": 1, "rol": "coach"}
    try:
        with pytest.raises(HTTPException) as e:
            ps.PizarraServices().ver({"usuario_id": 1, "rol": "boost"}, sid, llamar=falsa)
        assert e.value.status_code == 403
        with pytest.raises(HTTPException) as e:
            ps.PizarraServices().ver(coach, sid, rearmar=True, llamar=falsa)
        assert e.value.status_code == 403
        d1 = ps.PizarraServices().ver({"usuario_id": 1, "rol": "admin"}, sid, rearmar=True, llamar=falsa, esperar=True)
        d2 = ps.PizarraServices().ver(coach, sid, llamar=falsa)
        assert len(llamadas) == 1  # la segunda vez se lee guardada
        assert d1["negocios"] == d2["negocios"] and d2["version"] == ps.VERSION
    finally:
        with db_session:
            p = PizarraOnboarding.get(session_id=sid)
            if guardada:
                p.datos_json, p.respondido_en, p.modelo, p.creado_en = guardada
            elif p:
                p.delete()


def test_sin_formulario_es_404():
    if db.provider is None:
        init_db()
    with pytest.raises(HTTPException) as e:
        ps.PizarraServices().ver({"usuario_id": 1, "rol": "coach"}, "00000000-0000-0000-0000-000000000000", llamar=lambda s, u: CRUDO)
    assert e.value.status_code == 404
