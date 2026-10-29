"""Una clase bloqueada para el plan del cliente se ve si un coach se la mandó con "Enviar clase"."""
from types import SimpleNamespace

from src.services import permisos_service
from src.services import video_acceso as va


def _clase(id_, bloqueada_para="boost"):
    return SimpleNamespace(id=id_, video_url=f"https://video/{id_}", video_bloqueado=bool(bloqueada_para), video_bloqueado_para=bloqueada_para)


def test_compartida_se_ve_y_abre_el_modulo(monkeypatch):
    monkeypatch.setattr(permisos_service, "valor", lambda plan, clave: "si")
    c1, c2 = _clase(1), _clase(2)
    modulo = SimpleNamespace(secciones=[SimpleNamespace(clases=[c1, c2])])
    va._COMPARTIDAS.set(frozenset())
    assert va.video(c1, "boost")["video_url"] is None
    assert va.modulo_cerrado(modulo, "boost")
    va._COMPARTIDAS.set(frozenset({1}))
    assert va.video(c1, "boost")["video_url"] == "https://video/1"
    assert va.video(c2, "boost")["video_url"] is None  # las demás siguen bloqueadas
    assert not va.modulo_cerrado(modulo, "boost")
    va._COMPARTIDAS.set(frozenset())
