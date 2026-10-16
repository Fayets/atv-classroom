"""Mensajes directos entre el equipo (como los DMs de Discord): los ven solo sus dos participantes."""
import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db
from src.models import Admin, Canal
from src.services.mensajeria_service import MensajeriaServices

_P = "dm-prueba"
svc = MensajeriaServices()


@pytest.fixture(scope="module")
def equipo():
    if db.provider is None:
        init_db()
    with db_session:
        ids = {}
        for k, rol in (("ana", "coach"), ("beto", "coach"), ("jefa", "admin")):
            a = Admin(email=f"{_P}-{k}@atvos-prueba.com", nombre=f"{k.capitalize()} Prueba", rol=rol)
            a.flush()
            ids[k] = {"usuario_id": a.id, "rol": rol, "nombre": a.nombre, "email": a.email, "miembro_id": None}
    yield ids
    with db_session:
        canales = [c.id for c in list(Canal.select()) if c.tipo == "directo" and any(str(v["usuario_id"]) in (c.participantes_json or "") for v in ids.values())]
        if canales:
            db.execute(f'DELETE FROM "{DB_SCHEMA}"."lecturas_canal" WHERE canal_id = ANY($c)', {"c": canales})
            db.execute(f'DELETE FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = ANY($c)', {"c": canales})
            db.execute(f'DELETE FROM "{DB_SCHEMA}"."canales" WHERE id = ANY($c)', {"c": canales})
        for v in ids.values():
            Admin[v["usuario_id"]].delete()


def test_el_directo_lo_ven_solo_sus_dos_participantes(equipo):
    ana, beto, jefa = equipo["ana"], equipo["beto"], equipo["jefa"]
    d = svc.abrir_directo(dict(ana), beto["usuario_id"])
    assert svc.abrir_directo(dict(beto), ana["usuario_id"])["id"] == d["id"]  # el mismo canal para los dos

    m, _ = svc.enviar(dict(ana), d["id"], "che, ¿viste lo de Laura?", None)
    assert svc.mensajes(dict(beto), d["id"])["mensajes"][-1]["id"] == m["id"]

    # Ni siquiera un admin que no participa lo ve.
    with pytest.raises(HTTPException):
        svc.mensajes(dict(jefa), d["id"])
    assert all(c["id"] != d["id"] for c in svc.listar_canales(dict(jefa)))

    # En la lista de Beto aparece con el nombre de Ana.
    fila = next(c for c in svc.listar_canales(dict(beto)) if c["id"] == d["id"])
    assert fila["tipo"] == "directo" and fila["nombre"] == ana["nombre"] and fila["no_leidos"] == 1


def test_no_hay_directo_con_uno_mismo_ni_para_clientes(equipo):
    with pytest.raises(HTTPException):
        svc.abrir_directo(dict(equipo["ana"]), equipo["ana"]["usuario_id"])
    with pytest.raises(HTTPException):
        svc.abrir_directo({"usuario_id": 999999301, "rol": "mid", "miembro_id": None}, equipo["ana"]["usuario_id"])
