"""Canales grupales como en Discord: los crea cualquiera del equipo, los ven los roles elegidos
y @everyone etiqueta a todos los del equipo que ven el canal. Todo lo creado se borra al final."""

import secrets

import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import db, init_db
from src.services.mensajeria_service import MensajeriaServices
from src.services import mensajeria_service as ms
from src.services.roles_canal import validar_roles, cliente_ve

_P = f"test-grupo-{secrets.token_hex(3)}"
svc = MensajeriaServices()
BOOST = {"usuario_id": 999999201, "nombre": "Cliente Boost", "email": "b@y.com", "rol": "boost"}
MENTORIA = {"usuario_id": 999999202, "nombre": "Cliente Mentoria", "email": "m@y.com", "rol": "mentoria"}


@pytest.fixture(scope="module", autouse=True)
def _base():
    if db.provider is None:
        init_db()
    yield
    from src.models import Admin, Canal, LecturaCanal, Mencion, MensajeCanal, SesionGuardada

    with db_session:
        canales = [c for c in list(Canal.select()) if c.nombre.startswith(_P) or (c.cliente_id or 0) in (999999201, 999999202)]
        ids = {c.id for c in canales}
        admins = [a for a in list(Admin.select()) if a.email.startswith(_P)]
        aids = {a.id for a in admins}
        for m in list(MensajeCanal.select()):
            if m.canal.id in ids:
                m.delete()
        for x in list(Mencion.select()):
            if x.canal_id in ids or x.admin_id in aids:
                x.delete()
        for l in list(LecturaCanal.select()):
            if l.canal_id in ids or (l.lector_tipo == "admin" and l.lector_id in aids):
                l.delete()
        for c in canales:
            c.delete()
        for s in list(SesionGuardada.select()):
            if s.tipo == "admin" and s.usuario_id in aids:
                s.delete()
        for a in admins:
            a.delete()


@pytest.fixture(autouse=True)
def _sin_tope(monkeypatch):
    monkeypatch.setattr(ms, "_TOPE_POR_MINUTO", 1000)
    monkeypatch.setattr(ms, "_TOPE_EQUIPO_POR_MINUTO", 1000)


@pytest.fixture(scope="module")
def equipo():
    from src.models import Admin

    with db_session:
        admin = Admin(email=f"{_P}-admin@atvos-prueba.com", nombre="Admin Grupo", rol="admin", area="ventas")
        coach = Admin(email=f"{_P}-coach@atvos-prueba.com", nombre="Coach Grupo", rol="coach", area="ventas")
        otro = Admin(email=f"{_P}-otro@atvos-prueba.com", nombre="Otro Coach", rol="coach", area="marketing")
        db.flush()
        hacer = lambda a: {"usuario_id": a.id, "nombre": a.nombre, "email": a.email, "rol": a.rol}
        return {"admin": hacer(admin), "coach": hacer(coach), "otro": hacer(otro)}


def test_roles_validos_y_plan_del_cliente():
    assert validar_roles(["boost", "inventado", "equipo", "boost"]) == ["equipo", "boost"]
    assert cliente_ve("boost", ["boost"]) and cliente_ve("advantage", ["high"]) and not cliente_ve("mid", ["boost"])


def test_un_coach_crea_un_canal_y_lo_ven_los_roles_elegidos(equipo):
    canal = svc.crear_canal_grupo(equipo["coach"], f"{_P} Clase en Vivo", "La clase de los martes", ["boost"])
    assert canal["nombre"] == f"{_P}-clase-en-vivo" and canal["roles"] == ["boost"]
    ids = lambda sesion: {c["id"] for c in svc.listar_canales(sesion)}
    assert canal["id"] in ids(BOOST)
    assert canal["id"] not in ids(MENTORIA)
    assert canal["id"] in ids(equipo["admin"])  # el admin ve todo
    assert canal["id"] in ids(equipo["coach"])  # el creador lo ve aunque no eligió "equipo"
    assert canal["id"] not in ids(equipo["otro"])  # otro coach, no
    # El cliente del rol escribe; el de otro rol ni lo encuentra.
    m, _ = svc.enviar(BOOST, canal["id"], "hola a todos!", None)
    assert m["autor"]["tipo"] == "cliente"
    with pytest.raises(HTTPException) as e:
        svc.enviar(MENTORIA, canal["id"], "me meto", None)
    assert e.value.status_code == 404


def test_rol_equipo_lo_ven_todos_los_coaches(equipo):
    canal = svc.crear_canal_grupo(equipo["admin"], f"{_P}-interno", None, ["equipo"])
    ids = {c["id"] for c in svc.listar_canales(equipo["otro"])}
    assert canal["id"] in ids
    assert canal["id"] not in {c["id"] for c in svc.listar_canales(BOOST)}


def test_everyone_etiqueta_al_equipo_que_ve_el_canal_y_no_a_un_cliente(equipo):
    canal = svc.crear_canal_grupo(equipo["admin"], f"{_P}-general", None, ["equipo", "boost"])
    m, _ = svc.enviar(equipo["admin"], canal["id"], "@everyone arranca la clase", None)
    # Todos los del equipo que ven el canal, menos el autor.
    assert set(m["menciones"]) >= {equipo["coach"]["usuario_id"], equipo["otro"]["usuario_id"]}
    assert equipo["admin"]["usuario_id"] not in m["menciones"]
    # Un cliente no puede etiquetar a todos.
    m2, _ = svc.enviar(BOOST, canal["id"], "@everyone hola", None)
    assert m2["menciones"] == []


def test_solo_el_equipo_crea_y_el_nombre_no_se_repite(equipo):
    with pytest.raises(HTTPException) as e:
        svc.crear_canal_grupo(BOOST, "mi-canal", None, ["boost"])
    assert e.value.status_code == 403
    with pytest.raises(HTTPException) as e:
        svc.crear_canal_grupo(equipo["coach"], "sin roles", None, [])
    assert e.value.status_code == 422
    with pytest.raises(HTTPException) as e:
        svc.crear_canal_grupo(equipo["coach"], f"{_P}-general", None, ["boost"])
    assert e.value.status_code == 409


def test_editar_y_borrar_solo_quien_lo_creo_o_un_admin(equipo):
    from src.models import Canal, Mencion, MensajeCanal

    canal = svc.crear_canal_grupo(equipo["coach"], f"{_P}-editable", "antes", ["boost"])
    # Otro coach (aunque lo viera) y un cliente no pueden.
    with pytest.raises(HTTPException) as e:
        svc.editar_canal(equipo["otro"], canal["id"], "otro-nombre", None, None)
    assert e.value.status_code in (403, 404)
    with pytest.raises(HTTPException) as e:
        svc.editar_canal(BOOST, canal["id"], "otro-nombre", None, None)
    assert e.value.status_code == 403
    # Quien lo creó cambia nombre, descripción y roles: Boost deja de verlo, Mentoria pasa a verlo.
    editado, antes, despues = svc.editar_canal(equipo["coach"], canal["id"], f"{_P} Renombrado", "después", ["mentoria"])
    assert editado["nombre"] == f"{_P}-renombrado" and editado["descripcion"] == "después" and editado["roles"] == ["mentoria"]
    assert antes["roles"] == ["boost"] and despues["roles"] == ["mentoria"]
    ids = lambda sesion: {c["id"] for c in svc.listar_canales(sesion)}
    assert canal["id"] not in ids(BOOST) and canal["id"] in ids(MENTORIA)
    assert next(c for c in svc.listar_canales(equipo["coach"]) if c["id"] == canal["id"])["puede_administrar"]
    # Un admin lo borra con todo lo que tiene.
    m, _ = svc.enviar(equipo["coach"], canal["id"], "@everyone a borrar", None)
    r = svc.borrar_canal(equipo["admin"], canal["id"])
    assert r["mensajes"] == 1
    with db_session:
        assert Canal.get(id=canal["id"]) is None
        assert not [x for x in list(MensajeCanal.select()) if x.id == m["id"]]
        assert not [x for x in list(Mencion.select()) if x.canal_id == canal["id"]]


def test_un_coach_no_borra_canales_de_clientes_ni_anuncios(equipo):
    canal = svc.crear_canal_grupo(equipo["admin"], f"{_P}-del-admin", None, ["equipo"])
    with pytest.raises(HTTPException) as e:
        svc.borrar_canal(equipo["coach"], canal["id"])  # lo ve (rol equipo) pero no lo creó
    assert e.value.status_code == 403


def test_el_cliente_no_recibe_los_roles_del_canal(equipo):
    canal = svc.crear_canal_grupo(equipo["admin"], f"{_P}-sin-roles", None, ["equipo", "boost"])
    visto = next(c for c in svc.listar_canales(BOOST) if c["id"] == canal["id"])
    assert visto["roles"] is None and visto["creado_por"] is None
    visto_equipo = next(c for c in svc.listar_canales(equipo["admin"]) if c["id"] == canal["id"])
    assert visto_equipo["roles"] == ["equipo", "boost"]


def test_un_admin_acomoda_los_canales_y_un_coach_no(equipo):
    a = svc.crear_canal_grupo(equipo["admin"], f"{_P}-orden-a", None, ["equipo"])
    b = svc.crear_canal_grupo(equipo["admin"], f"{_P}-orden-b", None, ["equipo"])
    with pytest.raises(HTTPException) as e:
        svc.ordenar_canales(equipo["coach"], [b["id"], a["id"]])
    assert e.value.status_code == 403
    # Solo toca los canales que se le pasan (y no un chat de cliente aunque venga en la lista).
    svc.ordenar_canales(equipo["admin"], [b["id"], a["id"], b["id"]])
    lista = [c for c in svc.listar_canales(equipo["admin"]) if c["id"] in (a["id"], b["id"])]
    assert [c["id"] for c in lista] == [b["id"], a["id"]]
    assert [c["orden"] for c in lista] == [0, 1]
