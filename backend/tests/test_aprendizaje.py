"""El cerebro aprende de las conversaciones: solo guarda hechos con cita literal y del autor correcto.
Usa un modelo falso (sin IA) y un canal de prueba que se borra al final."""

from datetime import datetime

import pytest
from pony.orm import db_session

from src.db import db, init_db
from src.services import aprendizaje_service as ap

CID = 999996001
M = [
    {"id": 10, "autor_tipo": "cliente", "autor_id": CID, "autor": "x", "texto": "Soy coach fitness y la mitad no se presenta a las llamadas", "creado_en": datetime.utcnow()},
    {"id": 11, "autor_tipo": "admin", "autor_id": 1, "autor": "Coach", "texto": "Mandá un audio de confirmación apenas agendan", "creado_en": datetime.utcnow()},
    {"id": 12, "autor_tipo": "cliente", "autor_id": CID, "autor": "x", "texto": "Mi objetivo es llegar a 10k por mes", "creado_en": datetime.utcnow()},
]


def test_solo_pasa_lo_que_tiene_cita_literal_y_autor_correcto():
    respuesta = {
        "perfil": {"nicho": "fitness", "facturacion": "50000 usd", "etapa": "inventada"},
        "hechos": [
            {"mensaje_id": 10, "tipo": "dolor", "texto": "No se presentan", "cita": "la mitad no se presenta a las llamadas"},
            {"mensaje_id": 10, "tipo": "dolor", "texto": "Inventado", "cita": "no tengo clientes"},  # no está en el mensaje
            {"mensaje_id": 11, "tipo": "dolor", "texto": "Mal autor", "cita": "audio de confirmación"},  # el equipo no tiene dolores
            {"mensaje_id": 11, "tipo": "recomendacion", "texto": "Audio", "cita": "Mandá un audio de confirmación", "concepto": "no-show"},
            {"mensaje_id": 10, "tipo": "recomendacion", "texto": "Mal autor", "cita": "coach fitness"},  # el cliente no recomienda
            {"mensaje_id": 12, "tipo": "logro", "texto": "Objetivo", "cita": "Mi objetivo es llegar a 10k"},  # es objetivo, no logro
            {"mensaje_id": 99, "tipo": "tema", "texto": "Otro mensaje", "cita": "algo"},
            {"mensaje_id": 10, "tipo": "inventado", "texto": "x", "cita": "coach fitness"},
        ],
    }
    perfil, hechos = ap.validar(respuesta, M, 10)
    assert [(h["mensaje_id"], h["tipo"]) for h in hechos] == [(10, "dolor"), (11, "recomendacion")]
    assert hechos[1]["concepto"] == "no-show"
    assert perfil == {"nicho": "fitness"}  # facturación sin evidencia y etapa fuera de la lista se descartan


def test_lee_json_con_texto_alrededor():
    assert ap.leer_json('Acá va:\n```json\n{"hechos": []}\n```') == {"hechos": []}
    assert ap.leer_json("sin json") is None


def test_rasgos_de_voz():
    r = ap.rasgos_de(["Hola! ¿cómo andás? Contame 😊", "Dale, mandame el link", "Genial!! Fijate esto"])
    assert r["mensajes"] == 3 and r["voseo_pct"] > 0 and r["emojis_top"] == ["😊"]


@pytest.fixture
def canal_prueba():
    if db.provider is None:
        init_db()
    from src.models import Canal, EstadoAprendizaje, HechoCerebro, MensajeCanal, PerfilCliente

    with db_session:
        c = Canal(tipo="cliente", cliente_id=CID, nombre="test-aprendizaje")
        db.flush()
        MensajeCanal(canal=c, autor_tipo="cliente", autor_id=CID, texto=M[0]["texto"])
        canal_id = c.id
    yield canal_id
    with db_session:
        for h in list(HechoCerebro.select()):
            if h.cliente_id == CID:
                h.delete()
        p = PerfilCliente.get(cliente_id=CID)
        if p:
            p.delete()
        e = EstadoAprendizaje.get(canal_id=canal_id)
        if e:
            e.delete()
        for m in list(MensajeCanal.select()):
            if m.canal.id == canal_id:
                m.delete()
        Canal[canal_id].delete()


def test_aprende_una_vez_y_no_relee(canal_prueba):
    llamadas = []

    def falso(prompt):
        llamadas.append(prompt)
        mid = int(prompt.split("[")[1].split("]")[0])
        return {"perfil": {"nicho": "fitness"}, "hechos": [{"mensaje_id": mid, "tipo": "dolor", "texto": "No se presentan", "cita": "no se presenta a las llamadas"}]}

    r = ap.aprender_canal(canal_prueba, llamar=falso)
    assert r["hechos"] == 1 and r["perfil"] == {"nicho": "fitness"}
    assert ap.aprender_canal(canal_prueba, llamar=falso)["hechos"] == 0
    assert len(llamadas) == 1  # sin mensajes nuevos no se llama al modelo
    assert ap.perfil_de(CID)["perfil"]["nicho"] == "fitness"
