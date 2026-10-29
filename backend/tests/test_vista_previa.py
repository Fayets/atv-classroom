import pytest
from fastapi import HTTPException

from src.services import vista_previa_service as vp


def test_solo_links_de_fathom():
    # El servidor sale a buscar la página: cualquier otro link sería pedirle que visite lo que sea.
    for url in ("http://169.254.169.254/latest", "https://fathom.video.evil.com/share/x", "https://evil.com/fathom.video/share/x"):
        with pytest.raises(HTTPException):
            vp.VistaPreviaServices().fathom(url)


def test_lee_titulo_y_participantes(monkeypatch):
    class Resp:
        status_code = 200
        text = ('<meta property="og:title" content="Reuni&oacute;n de Zoom">'
                '<meta property="og:description" content="Consuelo, and 2 others">')

    vp._guardadas.clear()
    monkeypatch.setattr(vp.httpx, "get", lambda *a, **k: Resp())
    d = vp.VistaPreviaServices().fathom("https://fathom.video/embed/abc_123")
    assert d == {"url": "https://fathom.video/share/abc_123", "titulo": "Reunión de Zoom",
                 "descripcion": "Consuelo, and 2 others", "imagen": "https://fathom.video/share/abc_123/thumbnail"}
