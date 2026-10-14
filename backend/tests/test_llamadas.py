"""Fathom por coach y carpeta Llamadas: conectar con la API key (cifrada), traer llamadas y atarlas
al cliente por mail, quién ve qué. Fathom se simula; los ids de prueba se borran al final."""

import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db
from src.models import Admin, FathomConexion
from src.services import fathom_service as fs
from src.services.llamadas_service import LlamadasServices

if db.provider is None:
    init_db()
MAIL = "fathom-test@atvos-prueba.com"


class Resp:
    def __init__(self, status, data):
        self.status_code, self._data = status, data

    def json(self):
        return self._data


def fathom_falso(clave_buena="k" * 40, cliente_mail=None):
    item = {
        "recording_id": 99887766,
        "title": "Ana Scheffer <> Franco",
        "share_url": "https://fathom.video/share/prueba-test",
        "recording_start_time": "2026-10-10T15:00:00Z",
        "recording_end_time": "2026-10-10T15:42:00Z",
        "calendar_invitees": [{"name": "Ana", "email": cliente_mail or "nadie@x.com", "is_external": True}],
        "transcript": [{"speaker": {"display_name": "Franco"}, "text": "hola Ana"}, {"speaker": {"display_name": "Ana"}, "text": "hola"}],
        "default_summary": {"markdown_formatted": "Resumen de prueba"},
    }

    def http(url, params=None, headers=None, timeout=None, **kw):
        if "X-Api-Key" not in (headers or {}):
            return Resp(404, {})  # la página pública del link de prueba no existe
        if headers["X-Api-Key"] != clave_buena:
            return Resp(401, {})
        return Resp(200, {"items": [item], "next_cursor": None})

    return http


@pytest.fixture
def coach():
    with db_session:
        a = Admin(email=MAIL, nombre="Coach Fathom", rol="coach", area="ventas")
        db.flush()
        sesion = {"usuario_id": a.id, "rol": "coach", "nombre": "Coach Fathom", "email": MAIL}
    yield sesion
    with db_session:
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."llamadas" WHERE fathom_id = $f', {"f": "99887766"})
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."fathom_conexiones" WHERE admin_id = $a', {"a": sesion["usuario_id"]})
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."admins" WHERE email = $m', {"m": MAIL})


def test_conectar_guarda_la_clave_cifrada_y_trae_las_llamadas(coach):
    svc = fs.FathomServices()
    with pytest.raises(HTTPException):
        svc.conectar(coach, "mala" * 10, http=fathom_falso())  # Fathom la rechaza: no queda conectado
    assert svc.estado(coach) == {"conectado": False}
    estado = svc.conectar(coach, "k" * 40, http=fathom_falso())
    assert estado["conectado"] and estado["llamadas"] == 1 and estado["error"] is None
    with db_session:
        assert "k" * 40 not in FathomConexion.get(admin_id=coach["usuario_id"]).clave_cifrada  # nunca en claro
    lista = LlamadasServices().listar(coach)
    assert lista["admin"] is False and lista["llamadas"][0]["duracion_min"] == 42
    d = LlamadasServices().detalle(coach, lista["llamadas"][0]["id"])
    assert "Franco: hola Ana" in d["transcripcion"] and d["resumen"] == "Resumen de prueba"
    # Otro coach no la ve; un admin sí, en la carpeta de ese coach.
    with pytest.raises(HTTPException):
        LlamadasServices().detalle({"usuario_id": -5, "rol": "coach"}, d["id"])
    admin = LlamadasServices().listar({"usuario_id": -1, "rol": "admin"})
    assert any(c["id"] == coach["usuario_id"] and len(c["llamadas"]) == 1 for c in admin["coaches"])
    # Volver a sincronizar no duplica.
    assert fs.sincronizar(coach["usuario_id"], http=fathom_falso())["nuevas"] == 0
    svc.desconectar(coach)
    assert svc.estado(coach) == {"conectado": False}


def test_pegar_solo_el_link_trae_la_transcripcion(coach):
    svc = fs.FathomServices()
    with pytest.raises(HTTPException):
        LlamadasServices().por_link(coach, "https://google.com/x")  # no es de Fathom
    with db_session:
        db.execute(f'DELETE FROM "{DB_SCHEMA}"."llamadas" WHERE fathom_id = $f', {"f": "99887766"})
    with db_session:
        FathomConexion(admin_id=coach["usuario_id"], clave_cifrada=fs.cifrar("k" * 40))
    # No estaba guardada: la busca en su Fathom por el token del link.
    d = fs.buscar_por_link(coach, "https://fathom.video/share/prueba-test", http=fathom_falso())
    detalle = LlamadasServices().detalle(coach, d)
    assert "Franco: hola Ana" in detalle["transcripcion"]
    # La segunda vez ya está guardada: no hace falta Fathom.
    assert fs.buscar_por_link(coach, "https://fathom.video/share/prueba-test", http=None) == d



def test_el_link_de_compartir_se_lee_sin_fathom_conectado(coach):
    pagina = '<div data-page="{&quot;props&quot;:{&quot;call&quot;:{&quot;id&quot;:55443322,&quot;title&quot;:&quot;Ana y Franco&quot;,&quot;started_at&quot;:&quot;2026-10-08T18:30:00Z&quot;,&quot;duration_minutes&quot;:30},&quot;copyTranscriptUrl&quot;:&quot;https://fathom.video/calls/55443322/copy_transcript?token=abcdefghij&quot;}}"></div>'

    def http(url, headers=None, timeout=None, follow_redirects=None, params=None):
        if url == "https://fathom.video/share/abcdefghij":
            return Resp(200, None) if False else type("R", (), {"status_code": 200, "text": pagina})()
        if url.startswith("https://fathom.video/calls/55443322/copy_transcript"):
            return Resp(200, {"plain_text": "0:00 - Franco\n  hola Ana"})
        return Resp(404, {})

    try:
        d = LlamadasServices().detalle(coach, fs.buscar_por_link(coach, "https://fathom.video/share/abcdefghij", http=http, cliente_id=999999101))
        assert "hola Ana" in d["transcripcion"] and d["duracion_min"] == 30
    finally:
        with db_session:
            db.execute(f'DELETE FROM "{DB_SCHEMA}"."llamadas" WHERE fathom_id = $f', {"f": "55443322"})
