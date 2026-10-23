"""A quién le llega cada notificación. Todo con cuentas @atvos-prueba.com que se borran al final y
dispositivos inventados: acá no se manda nada, se mira solo la lista de destinatarios."""

import json
import secrets

import pytest
from pony.orm import db_session

from src.db import db, init_db
from src.services import push_service

_P = f"test-push-{secrets.token_hex(3)}"


@pytest.fixture(scope="module")
def mundo():
    if db.provider is None:
        init_db()
    from src.models import Admin, Canal, Mencion, PushSuscripcion

    with db_session:
        coach = Admin(email=f"{_P}-coach@atvos-prueba.com", nombre="Coachprueba", rol="coach", area="ventas")
        otro = Admin(email=f"{_P}-otro@atvos-prueba.com", nombre="Otroprueba", rol="coach", area="marketing")
        jefe = Admin(email=f"{_P}-jefe@atvos-prueba.com", nombre="Jefeprueba", rol="admin", area="sistemas")
        coach.flush(); otro.flush(); jefe.flush()
        cur = db.get_connection().cursor()
        cur.execute("INSERT INTO clients.clientes (nombre, email, plan_actual, estado_cliente) VALUES (%s, %s, 'boost', 'vigente') RETURNING id",
                    (_P, f"{_P}@atvos-prueba.com"))
        cid = cur.fetchone()[0]
        canal = Canal(tipo="cliente", cliente_id=cid, nombre=_P)
        directo = Canal(tipo="directo", nombre=f"{_P}-dm", participantes_json=json.dumps([coach.id, otro.id]))
        canal.flush(); directo.flush()
        # El coach "tiene" a este cliente: lo etiquetaron alguna vez en su canal.
        Mencion(mensaje_id=-999999, canal_id=canal.id, admin_id=coach.id)
        subs = {}
        for clave, tipo, uid in (("coach", "admin", coach.id), ("otro", "admin", otro.id), ("jefe", "admin", jefe.id), ("cliente", "cliente", cid)):
            subs[clave] = PushSuscripcion(tipo=tipo, usuario_id=uid, endpoint=f"https://push.invalid/{_P}/{clave}", p256dh="x", auth="y").endpoint
        ids = {"coach": coach.id, "otro": otro.id, "jefe": jefe.id, "cliente": cid, "canal": canal.id, "directo": directo.id}
    yield ids, subs
    with db_session:
        for s in list(PushSuscripcion.select()):
            if _P in s.endpoint:
                s.delete()
        for m in list(Mencion.select()):
            if m.mensaje_id == -999999:
                m.delete()
        Canal[ids["canal"]].delete()
        Canal[ids["directo"]].delete()
        for a in list(Admin.select()):
            if a.email.startswith(_P):
                a.delete()
        db.execute("DELETE FROM clients.clientes WHERE id = $cid", {"cid": ids["cliente"]})


def _llegan(mensaje, canal_id, subs):
    with db_session:
        envios = push_service.destinatarios(mensaje, canal_id)
    nuestros = set(subs.values())
    return {[k for k, v in subs.items() if v == s.endpoint][0]: aviso for lista, aviso in envios for s in lista if s.endpoint in nuestros}


def _msj(autor, texto="hola", menciones=None):
    return {"id": 1, "texto": texto, "adjuntos": [], "autor": autor, "menciones": menciones or []}


def test_el_equipo_escribe_al_cliente_y_le_llega_solo_al_cliente(mundo):
    ids, subs = mundo
    r = _llegan(_msj({"tipo": "equipo", "id": ids["coach"], "nombre": "Coachprueba"}, "Te dejé el roadmap"), ids["canal"], subs)
    assert set(r) == {"cliente"}
    assert r["cliente"]["titulo"] == "Coachprueba · ATV" and r["cliente"]["url"] == f"/mensajes?c={ids['canal']}"


def test_el_cliente_escribe_y_le_llega_solo_a_su_coach(mundo):
    ids, subs = mundo
    r = _llegan(_msj({"tipo": "cliente", "id": ids["cliente"], "nombre": _P}, "Tengo una duda"), ids["canal"], subs)
    assert set(r) == {"coach"}  # ni el otro coach ni el admin que no lo tiene
    assert r["coach"]["cuerpo"] == "Tengo una duda"


def test_mencion_le_llega_al_etiquetado(mundo):
    ids, subs = mundo
    r = _llegan(_msj({"tipo": "cliente", "id": ids["cliente"], "nombre": _P}, "@Otroprueba mirá", [ids["otro"]]), ids["canal"], subs)
    assert set(r) == {"coach", "otro"}
    assert r["otro"]["titulo"].endswith("te mencionó")


def test_directo_le_llega_al_otro_y_no_al_que_escribe(mundo):
    ids, subs = mundo
    r = _llegan(_msj({"tipo": "equipo", "id": ids["coach"], "nombre": "Coachprueba"}, "¿Lo ves vos?"), ids["directo"], subs)
    assert set(r) == {"otro"}
    assert r["otro"]["titulo"] == "Coachprueba"


def test_sin_texto_avisa_el_archivo():
    assert push_service._texto({"texto": "", "adjuntos": [{"id": 1}]}) == "📎 Te mandó un archivo"
    assert len(push_service._texto({"texto": "a" * 400})) == 158
