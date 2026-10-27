"""Pantalla Permisos: qué parte del classroom ve cada plan. Base local; se borra lo que se guarda."""

import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import db, init_db
from src.services import permisos_service as p
from src.services.plan_acceso import sin_chat, sin_ia


@pytest.fixture(autouse=True)
def limpio():
    if db.provider is None:
        init_db()
    yield
    with db_session:
        db.execute('DELETE FROM "%s"."permisos_plan"' % __import__("src.db", fromlist=["DB_SCHEMA"]).DB_SCHEMA)
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
