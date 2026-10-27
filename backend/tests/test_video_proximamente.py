"""Clases con el video en "Próximamente": el video no sale del servidor, los SOPs sí."""

from types import SimpleNamespace

from src.services import frente_service


def _clase(bloqueado):
    programa = SimpleNamespace(id=1)
    return SimpleNamespace(id=999999, titulo="Clase", video_url="https://vimeo.com/123456", video_bloqueado=bloqueado,
                           seccion=SimpleNamespace(programa=programa))


def test_video_bloqueado_no_sale_y_los_sops_si(monkeypatch):
    sops = [{"id": 1, "titulo": "SOP", "url": "https://docs.google.com/x", "orden": 0}]
    monkeypatch.setattr(frente_service, "serializar_recursos", lambda c: sops)
    for bloqueado in (True, False):
        monkeypatch.setattr(frente_service.Clase, "get", classmethod(lambda cls, **k: _clase(bloqueado)))
        info = frente_service._clase(999999)
        assert info["recursos"] == sops
        assert info["video_proximamente"] is bloqueado
        assert info["video_url"] == (None if bloqueado else "https://vimeo.com/123456")
