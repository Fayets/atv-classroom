"""Acciones rápidas del chat: cada coach las suyas, con tope, y el link de agenda sugerido de sus mensajes."""

import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import db, init_db
from src.services import acciones_service as acs

COACH = {"usuario_id": 999993101, "tipo": "admin", "rol": "coach", "nombre": "Coach Prueba", "email": "c@atvos-prueba.com"}
OTRO = {**COACH, "usuario_id": 999993102}
CLIENTE = {"usuario_id": 999993103, "tipo": "cliente", "rol": "boost", "nombre": "Cliente", "email": "x@atvos-prueba.com"}


@pytest.fixture(autouse=True)
def _base():
    if db.provider is None:
        init_db()
    yield
    from src.models import AccionRapida

    with db_session:
        for a in list(AccionRapida.select()):
            if a.admin_id in (COACH["usuario_id"], OTRO["usuario_id"]):
                a.delete()


def test_crea_edita_y_borra_solo_las_suyas():
    svc = acs.AccionesServices()
    a = svc.crear(COACH, " Enviar mi agenda ", "{nombre}, agendá acá: https://cal.com/coach")
    assert a["nombre"] == "Enviar mi agenda"
    assert [x["id"] for x in svc.listar(COACH)["acciones"]] == [a["id"]]
    assert svc.listar(OTRO)["acciones"] == []
    with pytest.raises(HTTPException) as e:
        svc.editar(OTRO, a["id"], "x", "y")
    assert e.value.status_code == 404
    assert svc.editar(COACH, a["id"], "Agenda", "otro texto")["texto"] == "otro texto"
    with pytest.raises(HTTPException):
        svc.borrar(OTRO, a["id"])
    svc.borrar(COACH, a["id"])
    assert svc.listar(COACH)["acciones"] == []


def test_valida_y_tiene_tope():
    svc = acs.AccionesServices()
    for nombre, texto in (("", "hola"), ("Nombre", "  "), ("x" * 41, "hola")):
        with pytest.raises(HTTPException):
            svc.crear(COACH, nombre, texto)
    for i in range(acs.MAX_ACCIONES):
        svc.crear(COACH, f"A{i}", "hola")
    with pytest.raises(HTTPException):
        svc.crear(COACH, "una más", "hola")


def test_el_cliente_no_tiene_acciones():
    with pytest.raises(HTTPException) as e:
        acs.AccionesServices().listar(CLIENTE)
    assert e.value.status_code == 403


def test_sugiere_el_link_de_agenda_mas_usado():
    textos = [
        "les dejo el link para agendar: https://cal.com/alejandro-ramirez/llamada-de-onboarding-atv",
        "agendá acá https://calendly.com/viejo/30min.",
        "de nuevo: https://cal.com/alejandro-ramirez/llamada-de-onboarding-atv!",
        "sin link",
        "https://calendly.com/viejo/30min?month=2025-10",
    ]
    assert acs.agenda_mas_usada(textos) == "https://cal.com/alejandro-ramirez/llamada-de-onboarding-atv"
    assert acs.agenda_mas_usada(["https://meet.google.com/abc-defg-hij"]) is None
    assert acs.agenda_mas_usada(["https://calendly.com/juan/1-1?month=2025-10"]) == "https://calendly.com/juan/1-1"


def test_no_sugiere_si_ya_la_tiene_guardada(monkeypatch):
    monkeypatch.setattr(acs, "link_de_agenda", lambda _id: "https://cal.com/coach")
    svc = acs.AccionesServices()
    sug = svc.listar(COACH)["sugeridas"]
    assert sug and "https://cal.com/coach" in sug[0]["texto"] and "{nombre}" in sug[0]["texto"]
    svc.crear(COACH, "Agenda", sug[0]["texto"])
    assert svc.listar(COACH)["sugeridas"] == []
