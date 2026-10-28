"""Mensaje privado de alguien del equipo con un cliente (como un DM de Discord): lo ven solo esos dos. Ni el
resto del equipo, ni otro cliente, ni el cerebro. Datos de prueba propios."""

import json
import secrets
from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import db, init_db
from src.services import push_service
from src.services.mensajeria_service import MensajeriaServices

_P = f"test-dm-{secrets.token_hex(3)}"
svc = MensajeriaServices()


@pytest.fixture(scope="module")
def mundo():
    if db.provider is None:
        init_db()
    from src.models import Admin, Canal, PushSuscripcion

    with db_session:
        franco = Admin(email=f"{_P}-franco@atvos-prueba.com", nombre="Francoprueba", rol="admin", area="sistemas")
        otro = Admin(email=f"{_P}-otro@atvos-prueba.com", nombre="Otroprueba", rol="admin", area="ventas")
        franco.flush()
        otro.flush()
        cur = db.get_connection().cursor()
        ids = []
        for letra in ("dani", "otro"):
            cur.execute(
                "INSERT INTO clients.clientes (nombre, email, plan_actual, estado_cliente, fecha_vencimiento, canal_discord) "
                "VALUES (%s, %s, 'entry', 'vigente', %s, %s) RETURNING id",
                (f"{_P}-{letra}", f"{_P}-{letra}@atvos-prueba.com", date.today() + timedelta(days=30), f"#{_P}-{letra}"),
            )
            ids.append(cur.fetchone()[0])
        PushSuscripcion(tipo="cliente", usuario_id=ids[0], endpoint=f"https://push.invalid/{_P}/c", p256dh="x", auth="y")
        PushSuscripcion(tipo="admin", usuario_id=franco.id, endpoint=f"https://push.invalid/{_P}/a", p256dh="x", auth="y")
        datos = {
            "franco": {"usuario_id": franco.id, "rol": "admin", "nombre": "Francoprueba", "email": franco.email, "area": "sistemas"},
            "otro_admin": {"usuario_id": otro.id, "rol": "admin", "nombre": "Otroprueba", "email": otro.email, "area": "ventas"},
            "dani": {"usuario_id": ids[0], "rol": "entry", "nombre": f"{_P}-dani", "email": f"{_P}-dani@atvos-prueba.com"},
            "otro_cliente": {"usuario_id": ids[1], "rol": "entry", "nombre": f"{_P}-otro", "email": f"{_P}-otro@atvos-prueba.com"},
            "ids": ids,
            "admins": [franco.id, otro.id],
        }
    yield datos
    with db_session:
        for s in list(PushSuscripcion.select()):
            if _P in s.endpoint:
                s.delete()
        for c in list(Canal.select()):
            if (c.tipo == "dm" and c.nombre.startswith(tuple(f"dm:{a}:" for a in datos["admins"]))) or c.cliente_id in ids:
                db.execute('DELETE FROM "classroom"."mensajes_canal" WHERE canal = $c', {"c": c.id})
                db.execute('DELETE FROM "classroom"."lecturas_canal" WHERE canal_id = $c', {"c": c.id})
                c.delete()
        for a in list(Admin.select()):
            if a.email.startswith(_P):
                a.delete()
        for cid in ids:
            db.execute("DELETE FROM clients.clientes WHERE id = $cid", {"cid": cid})


def test_el_equipo_le_escribe_por_privado_a_un_cliente(mundo):
    franco, dani = mundo["franco"], mundo["dani"]
    canal_id = svc.abrir_dm(dict(franco), dani["usuario_id"])["id"]
    assert svc.abrir_dm(dict(franco), dani["usuario_id"])["id"] == canal_id  # siempre el mismo
    mensaje, _ = svc.enviar(dict(franco), canal_id, "Hola Dani, te escribo por acá", None, [])
    # Los dos lo ven en su bandeja, cada uno con el nombre del otro.
    en_franco = next(x for x in svc.listar_canales(dict(franco)) if x["id"] == canal_id)
    assert en_franco["tipo"] == "dm" and en_franco["nombre"] == dani["nombre"]
    en_dani = next(x for x in svc.listar_canales(dict(dani)) if x["id"] == canal_id)
    assert en_dani["nombre"] == "Francoprueba"
    # Dani contesta.
    respuesta, _ = svc.enviar(dict(dani), canal_id, "Dale, gracias!", None, [])
    # Las notificaciones: a Dani la de Franco, a Franco la de Dani.
    with db_session:
        a_dani = {s.endpoint for subs, _ in push_service.destinatarios(mensaje, canal_id) for s in subs if _P in s.endpoint}
        a_franco = {s.endpoint for subs, _ in push_service.destinatarios(respuesta, canal_id) for s in subs if _P in s.endpoint}
    assert a_dani == {f"https://push.invalid/{_P}/c"}
    assert a_franco == {f"https://push.invalid/{_P}/a"}


def test_nadie_mas_lo_ve(mundo):
    canal_id = svc.abrir_dm(dict(mundo["franco"]), mundo["dani"]["usuario_id"])["id"]
    for quien in ("otro_admin", "otro_cliente"):
        assert all(x["id"] != canal_id for x in svc.listar_canales(dict(mundo[quien])))
        with pytest.raises(HTTPException) as e:
            svc.mensajes(dict(mundo[quien]), canal_id)
        assert e.value.status_code == 404


def test_un_cliente_no_abre_dm(mundo):
    with pytest.raises(HTTPException):
        svc.abrir_dm(dict(mundo["dani"]), mundo["otro_cliente"]["usuario_id"])
