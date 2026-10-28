"""Privados entre clientes: cualquier cliente con acceso le escribe a otro. Lo ven solo ellos dos (y sus
equipos): el equipo de ATV no, ni en la bandeja, ni el cerebro, ni por menciones. Clientes de prueba propios."""

import json
import secrets
from datetime import date, datetime, timedelta

import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import db, init_db
from src.services import push_service
from src.services.mensajeria_service import MensajeriaServices
from src.services.roles_canal import rol_de_plan

_P = f"test-privados-{secrets.token_hex(3)}"
svc = MensajeriaServices()


@pytest.fixture(scope="module")
def mundo():
    if db.provider is None:
        init_db()
    from src.models import Admin, Canal, PushSuscripcion

    with db_session:
        jefe = Admin(email=f"{_P}-admin@atvos-prueba.com", nombre="Jefeprueba", rol="admin", area="sistemas")
        jefe.flush()
        cur = db.get_connection().cursor()
        ids = []
        for letra in ("a", "b"):
            cur.execute(
                "INSERT INTO clients.clientes (nombre, email, plan_actual, estado_cliente, fecha_vencimiento, canal_discord) "
                "VALUES (%s, %s, 'boost', 'vigente', %s, %s) RETURNING id",
                (f"{_P}-{letra}", f"{_P}-{letra}@atvos-prueba.com", date.today() + timedelta(days=30), f"#{_P}-{letra}"),
            )
            ids.append(cur.fetchone()[0])
        # Un canal de la comunidad propio donde B escribió: desde ahí A lo puede encontrar.
        comunidad = Canal(tipo="grupo", nombre=f"{_P}-general", roles_json=json.dumps([rol_de_plan("boost")]), creado_en=datetime.utcnow())
        comunidad.flush()
        db.execute(
            'INSERT INTO "classroom"."mensajes_canal" (canal, autor_tipo, autor_id, texto, borrado, creado_en) '
            "VALUES ($c, 'cliente', $b, 'hola comunidad', false, now())",
            {"c": comunidad.id, "b": ids[1]},
        )
        for cid in ids:
            PushSuscripcion(tipo="cliente", usuario_id=cid, endpoint=f"https://push.invalid/{_P}/{cid}", p256dh="x", auth="y")
        datos = {
            "a": {"usuario_id": ids[0], "rol": "boost", "nombre": f"{_P}-a", "email": f"{_P}-a@atvos-prueba.com"},
            "b": {"usuario_id": ids[1], "rol": "boost", "nombre": f"{_P}-b", "email": f"{_P}-b@atvos-prueba.com"},
            "admin": {"usuario_id": jefe.id, "rol": "admin", "nombre": "Jefeprueba", "email": jefe.email, "area": "sistemas"},
            "ids": ids,
        }
    yield datos
    with db_session:
        for s in list(PushSuscripcion.select()):
            if _P in s.endpoint:
                s.delete()
        for c in list(Canal.select()):
            if c.tipo == "privado" and set(json.loads(c.participantes_json or "[]")) & set(ids):
                db.execute('DELETE FROM "classroom"."mensajes_canal" WHERE canal = $c', {"c": c.id})
                db.execute('DELETE FROM "classroom"."lecturas_canal" WHERE canal_id = $c', {"c": c.id})
                c.delete()
            elif c.cliente_id in ids:
                c.delete()
            elif c.nombre == f"{_P}-general":
                db.execute('DELETE FROM "classroom"."mensajes_canal" WHERE canal = $c', {"c": c.id})
                c.delete()
        for a in list(Admin.select()):
            if a.email.startswith(_P):
                a.delete()
        for cid in ids:
            db.execute("DELETE FROM clients.clientes WHERE id = $cid", {"cid": cid})


def test_un_cliente_le_escribe_a_otro_y_el_equipo_no_lo_ve(mundo):
    a, b, admin = mundo["a"], mundo["b"], mundo["admin"]
    canal_id = svc.abrir_privado(dict(a), b["usuario_id"])["id"]
    assert svc.abrir_privado(dict(b), a["usuario_id"])["id"] == canal_id  # el mismo chat, lo abra quien lo abra
    mensaje, canal = svc.enviar(dict(a), canal_id, f"Hola @Jefeprueba, che {b['nombre']}", None, [admin["usuario_id"]])
    assert mensaje["menciones"] == []  # al equipo no se lo etiqueta en un privado
    en_b = next(x for x in svc.listar_canales(dict(b)) if x["id"] == canal_id)
    assert en_b["tipo"] == "privado" and en_b["nombre"] == a["nombre"]
    # El equipo de ATV: ni en la bandeja ni abriéndolo a mano.
    assert all(x["id"] != canal_id for x in svc.listar_canales(dict(admin)))
    with pytest.raises(HTTPException) as e:
        svc.mensajes(dict(admin), canal_id)
    assert e.value.status_code == 404
    # La notificación le llega solo a B.
    with db_session:
        envios = push_service.destinatarios(mensaje, canal_id)
    nuestros = {s.usuario_id for subs, _ in envios for s in subs if _P in s.endpoint}
    assert nuestros == {b["usuario_id"]}


def test_el_equipo_no_abre_privados(mundo):
    with pytest.raises(HTTPException):
        svc.abrir_privado(dict(mundo["admin"]), mundo["a"]["usuario_id"])
    with pytest.raises(HTTPException):
        svc.abrir_privado(dict(mundo["a"]), mundo["a"]["usuario_id"])


def test_solo_a_quien_se_ve_en_la_comunidad(mundo):
    """B escribió en un canal que A ve: A le puede escribir. A no escribió en ningún lado: B no puede abrirle
    un privado nuevo por id (así nadie recorre la lista de clientes)."""
    from src.models import Canal

    with db_session:
        for c in list(Canal.select()):
            if c.tipo == "privado" and set(json.loads(c.participantes_json or "[]")) == set(mundo["ids"]):
                db.execute('DELETE FROM "classroom"."mensajes_canal" WHERE canal = $c', {"c": c.id})
                db.execute('DELETE FROM "classroom"."lecturas_canal" WHERE canal_id = $c', {"c": c.id})
                c.delete()
    with pytest.raises(HTTPException) as e:
        svc.abrir_privado(dict(mundo["b"]), mundo["a"]["usuario_id"])
    assert e.value.status_code == 404
    assert svc.abrir_privado(dict(mundo["a"]), mundo["b"]["usuario_id"])["id"]
    # Una vez abierto, el otro también lo puede abrir.
    assert svc.abrir_privado(dict(mundo["b"]), mundo["a"]["usuario_id"])["id"]


def test_buscador_no_tira_la_lista(mundo):
    a, b = mundo["a"], mundo["b"]
    assert svc.buscar_clientes(dict(a), "te") == []  # menos de 3 letras: nada
    assert [x["id"] for x in svc.buscar_clientes(dict(a), f"{_P}-b")] == [b["usuario_id"]]
    # A no escribió en ningún canal: B no lo encuentra aunque sepa el nombre.
    assert svc.buscar_clientes(dict(b), f"{_P}-a") == []
    assert len(svc.buscar_clientes(dict(a), "a a")) <= 5
    with pytest.raises(HTTPException):
        svc.buscar_clientes(dict(mundo["admin"]), "algo")
