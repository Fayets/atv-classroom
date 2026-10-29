"""Pantalla Permisos: qué parte del classroom ve cada plan. Lo que había antes se devuelve al terminar."""

import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import db, init_db
from src.services import permisos_service as p
from src.services.plan_acceso import sin_chat, sin_ia


@pytest.fixture(autouse=True)
def limpio():
    # La base es compartida con producción: los permisos de verdad se guardan antes y se devuelven tal cual.
    # (El 29-10-2026 este fixture vació permisos_plan en producción y todos los planes pasaron a ver todo.)
    from src.db import DB_SCHEMA

    if db.provider is None:
        init_db()
    with db_session:
        guardados = list(db.select(f'SELECT plan, clave, valor FROM "{DB_SCHEMA}"."permisos_plan"'))
    yield
    with db_session:
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."permisos_plan"')
        for plan, clave, valor in guardados:
            db.execute(
                f'INSERT INTO "{DB_SCHEMA}"."permisos_plan" (plan, clave, valor) VALUES ($plan, $clave, $valor)',
                {"plan": plan, "clave": clave, "valor": valor},
            )
    p._CACHE["hasta"] = 0.0


def test_por_defecto_2k_es_solo_contenido():
    m = {x["clave"]: x["por_plan"] for x in p.matriz()["permisos"]}
    assert m["roadmaps"]["2k"] == "no" and m["ia"]["2k"] == "no" and m["comunidad"]["2k"] == "no" and m["chat"]["2k"] == "1a1"
    assert m["clases"]["2k"] == "si" and m["sops"]["2k"] == "si"
    assert all(v == "si" for v in m["roadmaps"].values() if v != m["roadmaps"]["2k"])
    assert sin_ia({"rol": "2k"}) and sin_chat({"rol": "2k"}) and not sin_ia({"rol": "high"})


def test_guardar_y_el_equipo_ve_todo():
    p.guardar([{"plan": "boost", "clave": "ia", "valor": "no"}, {"plan": "2k", "clave": "roadmaps", "valor": "si"}])
    assert sin_ia({"rol": "boost"}) and p.permite({"rol": "2k"}, "roadmaps")
    assert p.permite({"rol": "admin", "usuario_id": 1}, "ia")
    with pytest.raises(HTTPException) as e:
        p.exigir({"rol": "boost"}, "ia")
    assert e.value.status_code == 403
    with pytest.raises(HTTPException):
        p.guardar([{"plan": "boost", "clave": "chat", "valor": "quizas"}])


def test_clases_y_sops_apagados_por_plan():
    from types import SimpleNamespace

    from src.services.video_acceso import recursos, video

    p.guardar([{"plan": "mid", "clave": "clases", "valor": "no"}, {"plan": "mid", "clave": "sops", "valor": "no"}])
    c = SimpleNamespace(video_url="https://vimeo.com/1", video_bloqueado=False, video_bloqueado_para="", recursos=[])
    assert video(c, "mid")["video_proximamente"] is True and video(c, "high")["video_url"]
    assert recursos(c, "mid") == []


def test_modulo_cerrado_si_no_ve_ningun_video_o_tiene_las_clases_apagadas():
    from types import SimpleNamespace

    from src.services.video_acceso import modulo_cerrado

    cl = lambda para: SimpleNamespace(video_bloqueado=bool(para), video_bloqueado_para=para)
    todo_bloqueado = SimpleNamespace(secciones=[SimpleNamespace(clases=[cl("high,boost"), cl("high")])])
    mezcla = SimpleNamespace(secciones=[SimpleNamespace(clases=[cl("high"), cl("")])])
    vacio = SimpleNamespace(secciones=[])
    assert modulo_cerrado(todo_bloqueado, "high") and not modulo_cerrado(todo_bloqueado, "boost")
    assert not modulo_cerrado(mezcla, "high") and not modulo_cerrado(vacio, "high")
    assert not modulo_cerrado(todo_bloqueado, None)  # el equipo entra siempre
    p.guardar([{"plan": "mid", "clave": "clases", "valor": "no"}])
    assert modulo_cerrado(mezcla, "mid")
