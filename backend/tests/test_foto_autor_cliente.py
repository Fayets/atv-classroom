"""El titular que firma con el nombre de Mi cuenta lleva su foto; lo traído de Discord (id negativo), no."""

from types import SimpleNamespace

from src.services.mensajeria_service import _autor


class _Autores:
    def de(self, tipo, autor_id):
        return {"tipo": "cliente", "id": autor_id, "nombre": "Ficha", "foto_url": "/api/cuenta/fotos/c.jpg"}


def _m(id, autor_id=29):
    return SimpleNamespace(id=id, autor_tipo="cliente", autor_id=autor_id, autor_nombre="Aaron", miembro_id=None)


def test_mensaje_nativo_del_titular_lleva_su_foto():
    a = _autor(_m(500), _Autores())
    assert a["nombre"] == "Aaron" and a["foto_url"] == "/api/cuenta/fotos/c.jpg"


def test_historial_de_discord_sin_foto():
    assert _autor(_m(-12), _Autores())["foto_url"] is None
