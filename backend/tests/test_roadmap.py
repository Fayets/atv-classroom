"""Roadmap tipo Miro: versiones por coach y título, el vigente, el que hay que seguir, y quién lo ve."""

import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db
from src.services.roadmap_service import RoadmapServices

CLIENTE = 999995001
EQUIPO = {"usuario_id": 62, "rol": "admin", "nombre": "Admin", "email": "a@x.com"}
TITULAR = {"usuario_id": CLIENTE, "rol": "boost", "nombre": "Cliente", "email": "c@x.com"}
OTRO = {"usuario_id": CLIENTE + 1, "rol": "boost", "nombre": "Otro", "email": "o@x.com"}
DOC = "https://docs.google.com/document/d/1abcdefghijklmnopqrstuv/edit"


@pytest.fixture(autouse=True)
def _base():
    if db.provider is None:
        init_db()
    yield
    with db_session:
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."roadmap_docs" WHERE cliente_id = $c', {"c": CLIENTE})
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."cerebro_roadmaps" WHERE cliente_id = $c', {"c": CLIENTE})


def test_versiones_vigente_y_el_que_hay_que_seguir():
    svc = RoadmapServices()
    svc.crear(EQUIPO, CLIENTE, {"titulo": "Roadmap inicial", "tipo": "inicial", "url": DOC, "fecha": "2026-08-15"})
    svc.crear(EQUIPO, CLIENTE, {"titulo": "Ventas", "url": DOC, "fecha": "2026-09-01"})
    r = svc.crear(EQUIPO, CLIENTE, {"titulo": "ventas", "url": DOC, "fathom_url": "https://fathom.video/share/abc", "fecha": "2026-10-01", "pasos_total": 7, "paso_actual": 3})
    assert r["principal"]["fathom_url"] == "https://fathom.video/share/abc"
    docs = r["grupos"][0]["docs"]
    assert [(d["titulo"].lower(), d["version"], d["estado"]) for d in docs] == [
        ("roadmap inicial", 1, "vigente"), ("ventas", 1, "reemplazado"), ("ventas", 2, "vigente")]
    assert r["principal"]["fecha"] == "2026-10-01" and r["vigentes"] == 2
    inicial = docs[0]["id"]
    r = svc.editar(EQUIPO, inicial, {"principal": True})
    assert r["principal"]["id"] == inicial
    with pytest.raises(HTTPException):
        svc.editar(EQUIPO, inicial, {"pasos_total": 2, "paso_actual": 5})


def test_lo_ve_el_cliente_y_lo_carga_solo_el_equipo():
    svc = RoadmapServices()
    svc.crear(EQUIPO, CLIENTE, {"titulo": "Ventas", "url": DOC})
    assert svc.ver(TITULAR)["total"] == 1
    assert svc.ver({**TITULAR, "miembro_id": 3})["total"] == 1  # su equipo también
    with pytest.raises(HTTPException):
        svc.ver(OTRO, CLIENTE)
    with pytest.raises(HTTPException):
        svc.crear(TITULAR, CLIENTE, {"titulo": "Mío", "url": DOC})
    with pytest.raises(HTTPException):
        svc.crear(EQUIPO, CLIENTE, {"titulo": "Sin link", "url": "no es un link"})
    with pytest.raises(HTTPException):
        svc.crear(EQUIPO, CLIENTE, {"titulo": "Fathom roto", "url": DOC, "fathom_url": "fathom"})


def test_pasos_escritos_en_el_roadmap_los_tildan_el_cliente_y_el_coach():
    svc = RoadmapServices()
    with pytest.raises(HTTPException):
        svc.crear(EQUIPO, CLIENTE, {"titulo": "Ventas"})  # ni pasos ni link
    pasos = [{"texto": "Grabá 3 historias por día", "quien": "cliente"}, {"texto": "Reunión con Juampi", "quien": "atv"}]
    r = svc.crear(EQUIPO, CLIENTE, {"titulo": "Ventas", "pasos": pasos})
    doc = r["principal"]
    assert doc["url"] is None and doc["pasos_total"] == 2 and doc["paso_actual"] == 0
    r = svc.marcar_paso(TITULAR, doc["id"], 1, True)  # lo tilda el cliente
    assert r["principal"]["paso_actual"] == 1 and r["principal"]["pasos"][0]["hecho_por"]["tipo"] == "cliente"
    with pytest.raises(HTTPException):
        svc.marcar_paso(OTRO, doc["id"], 2, True)  # otro cliente no
    svc.marcar_paso(EQUIPO, doc["id"], 2, True)  # el coach también
    r = svc.editar(EQUIPO, doc["id"], {"pasos": pasos + [{"texto": "Paso nuevo", "quien": "cliente"}]})
    assert r["principal"]["paso_actual"] == 2 and r["principal"]["pasos_total"] == 3  # editar no destilda


def test_el_borrador_con_ia_trae_pasos_mensaje_con_link_y_entregables(monkeypatch):
    from src.services import roadmap_ia_service as ria

    vistos = {}

    def falso(sistema, usuario):
        vistos["prompt"] = sistema + usuario
        return '{"titulo": "Contenido", "area": "Historias", "pasos": [{"texto": "Grabá el CTA nuevo", "quien": "cliente"}, {"texto": "", "quien": "x"}], "mensaje": "buenas, te dejé todo", "entregables": ["Plantilla de guion"], "resumen": "Hablamos de historias."}'

    monkeypatch.setattr(ria.ClienteExterno, "get", staticmethod(lambda **kw: type("C", (), {"nombre": "Ana Scheffer", "email": "a@x.com", "plan_actual": "mentoria"})()))
    with pytest.raises(HTTPException):
        ria.RoadmapIAServices().generar(TITULAR, CLIENTE, "x" * 300, llamar=falso)  # el cliente no
    b = ria.RoadmapIAServices().generar(EQUIPO, CLIENTE, "Coach: hola Ana. " * 30, llamar=falso)
    assert b["pasos"] == [{"texto": "Grabá el CTA nuevo", "quien": "cliente"}]
    assert ria.ENLACE_ROADMAP in b["mensaje"] and b["entregables"] == ["Plantilla de guion"]
    assert b["mensaje"].endswith("Plantilla de guion: [LINK]")  # la línea del entregable la pone el código
    assert "Ana" in vistos["prompt"] and "Transcripción" in vistos["prompt"]



def test_el_cerebro_aprende_de_las_correcciones_y_de_los_resultados(monkeypatch):
    from src.services import roadmap_ia_service as ria
    from src.services import roadmaps_aprendidos as apr

    coach = {"usuario_id": 999990062, "rol": "admin", "nombre": "Coach Test", "email": "c@x.com"}
    monkeypatch.setattr(ria.ClienteExterno, "get", staticmethod(lambda **kw: type("C", (), {"nombre": "Ana Scheffer", "email": "a@x.com", "plan_actual": "mentoria"})()))
    prompts = []

    def ia(respuesta):
        def llamar(sistema, usuario):
            prompts.append(sistema + usuario)
            return respuesta
        return llamar

    svc, gen = RoadmapServices(), ria.RoadmapIAServices()
    primera = '{"titulo": "Contenido", "pasos": [{"texto": "Grabá 3 historias por día con el CTA PLAN", "quien": "cliente"}, {"texto": "Leé un libro de marketing", "quien": "cliente"}], "mensaje": "hola ana [ROADMAP]"}'
    b1 = gen.generar(coach, CLIENTE, "Coach: hola Ana. " * 30, llamar=ia(primera))
    # El coach saca un paso, reescribe otro y agrega uno.
    r = svc.crear(coach, CLIENTE, {
        "titulo": "Contenido", "borrador_id": b1["borrador_id"], "mensaje_final": "ana! [ROADMAP]", "enviado": True,
        "pasos": [{"texto": "Grabá 3 historias por día con el CTA PLAN y medí respuestas", "quien": "cliente"}, {"texto": "Reunión con Nick", "quien": "atv"}],
    })
    doc = r["principal"]
    with db_session:
        fila = apr.RoadmapAprendido.get(doc_id=doc["id"])
        cambios = apr._j(fila.cambios_json)
    assert cambios["sacados"] == ["Leé un libro de marketing"] and cambios["agregados"] == ["Reunión con Nick"]
    assert cambios["reescritos"][0]["antes"].startswith("Grabá 3 historias") and fila.enviado
    svc.marcar_paso(TITULAR, doc["id"], 1, True)  # el cliente lo tildó

    # Llamada siguiente: la IA revisa los pasos del roadmap anterior y cuenta el resultado.
    segunda = '{"titulo": "Ventas", "pasos": [{"texto": "Pasá las conversaciones a llamada", "quien": "cliente"}], "mensaje": "[ROADMAP]", "seguimiento": [{"id": 1, "estado": "hecho", "resultado": "le entraron 14 conversaciones en la semana"}, {"id": 2, "estado": "no_se_hablo"}]}'
    b2 = gen.generar(coach, CLIENTE, "Coach: ¿cómo te fue Ana? " * 30, llamar=ia(segunda))
    assert "SACÓ" in prompts[-1] and "Leé un libro de marketing" in prompts[-1]  # aprendió la corrección
    assert "Roadmap anterior" in prompts[-1] and "[el cliente lo tildó como hecho]" in prompts[-1]
    assert b2["seguimiento"]["pasos"][0]["resultado"] == "le entraron 14 conversaciones en la semana"
    svc.crear(coach, CLIENTE, {"titulo": "Ventas", "borrador_id": b2["borrador_id"], "pasos": b2["pasos"]})
    hist = apr.de_cliente(CLIENTE)
    assert hist[-1]["titulo"] == "Contenido" and hist[-1]["resultado"][0]["estado"] == "hecho"
    stats = apr.de_coach(coach["usuario_id"])
    assert stats["guardados"] == 2 and stats["pasos_sacados"] == 1 and stats["enviados"] == 1
    # Editarlo después también cuenta.
    svc.editar(coach, doc["id"], {"pasos": [{"texto": "Grabá 3 historias por día con el CTA PLAN y medí respuestas", "quien": "cliente"}]})
    with db_session:
        assert apr.RoadmapAprendido.get(doc_id=doc["id"]).editado_despues


def test_los_pasos_en_infinitivo_se_reescriben():
    from src.services import roadmap_ia_service as ria

    b = {"pasos": [{"texto": "Armá el Typeform", "quien": "cliente"}, {"texto": "Enviarme el Typeform", "quien": "cliente"}, {"texto": "Hacer seguimiento cada dos días", "quien": "atv"}]}
    pedidos = []

    def llamar(sistema, usuario):
        pedidos.append(usuario)
        return '["Mandame el Typeform", "Te hago seguimiento cada dos días"]'

    r = ria._corregir_persona(b, "Franco", llamar)
    assert [p["texto"] for p in r["pasos"]] == ["Armá el Typeform", "Mandame el Typeform", "Te hago seguimiento cada dos días"]
    assert "Armá" not in pedidos[0]  # solo se mandan a reescribir los que estaban mal
