"""Mi cuenta: foto de perfil (solo imágenes de verdad, sin rutas raras) y datos del plan."""

import pytest
from fastapi import HTTPException

from src.db import db, init_db
from src.services import cuenta_service as cs

PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000" "1f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082")
CLIENTE = {"usuario_id": 999993001, "nombre": "Cliente Foto", "email": "f@y.com", "rol": "boost"}


@pytest.fixture(autouse=True)
def _base(tmp_path, monkeypatch):
    if db.provider is None:
        init_db()
    monkeypatch.setattr(cs, "FOTOS_DIR", tmp_path)
    yield
    from pony.orm import db_session
    from src.models import FotoPerfil

    with db_session:
        for f in list(FotoPerfil.select()):
            if f.usuario_id == CLIENTE["usuario_id"]:
                f.delete()


def test_sube_cambia_y_quita_la_foto():
    svc = cs.CuentaServices()
    url1 = svc.subir_foto(CLIENTE, PNG)["foto_url"]
    assert url1.startswith("/api/cuenta/fotos/cliente-999993001-") and url1.endswith(".png")
    assert cs.foto_de("cliente", CLIENTE["usuario_id"]) == url1
    url2 = svc.subir_foto(CLIENTE, PNG)["foto_url"]
    assert url2 != url1  # nombre nuevo en cada cambio: el navegador no muestra la vieja
    assert not (cs.FOTOS_DIR / url1.rsplit("/", 1)[1]).exists()  # la vieja se borró
    assert svc.quitar_foto(CLIENTE)["foto_url"] is None
    assert cs.foto_de("cliente", CLIENTE["usuario_id"]) is None


def test_solo_imagenes_de_verdad():
    with pytest.raises(HTTPException) as e:
        cs.CuentaServices().subir_foto(CLIENTE, b"<svg onload=alert(1)>")
    assert e.value.status_code == 415
    with pytest.raises(HTTPException) as e:
        cs.CuentaServices().subir_foto(CLIENTE, b"\xff\xd8\xff" + b"0" * (cs.MAX_FOTO + 1))
    assert e.value.status_code == 413


def test_no_se_pueden_pedir_otros_archivos():
    for nombre in ("../../.env", "..", ".env", "a/b.png", ""):
        with pytest.raises(HTTPException):
            cs.CuentaServices.ruta_foto(nombre)
