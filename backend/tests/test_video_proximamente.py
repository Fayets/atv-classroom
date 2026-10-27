"""Videos bloqueados por plan: quien no lo ve recibe "Próximamente" y el link no sale del servidor; los SOPs
siempre salen; el equipo ve el video con el aviso de para quién está bloqueado."""

from types import SimpleNamespace

from src.services import frente_service
from src.services.video_acceso import bloqueado_para, guardar_bloqueo, video

URL = "https://vimeo.com/123456"


def _clase(bloqueado=False, para=None):
    return SimpleNamespace(id=999999, titulo="Clase", video_url=URL, video_bloqueado=bloqueado, video_bloqueado_para=para,
                           seccion=SimpleNamespace(programa=SimpleNamespace(id=1, titulo="Advantage", cover_url="/modules/advantage.jpg")))


def test_lo_bloqueado_antes_queda_para_todos_menos_2k():
    c = _clase(bloqueado=True)
    assert video(c, "high")["video_url"] is None and video(c, "mentoria")["video_proximamente"] is True
    assert video(c, "2k")["video_url"] == URL


def test_bloqueo_por_plan_y_el_equipo_lo_ve():
    c = _clase()
    guardar_bloqueo(c, ["boost", "2k", "cualquiera"])
    assert c.video_bloqueado is True and bloqueado_para(c) == ["boost", "2k"]
    assert video(c, "boost")["video_url"] is None and video(c, "2k")["video_url"] is None
    assert video(c, "high")["video_url"] == URL
    equipo = video(c, None)
    assert equipo["video_url"] == URL and equipo["video_bloqueado_para"] == ["Boost", "2K"]
    guardar_bloqueo(c, [])
    assert c.video_bloqueado is False and video(c, "boost")["video_url"] == URL


def test_la_clase_del_frente_respeta_el_plan_y_deja_los_sops(monkeypatch):
    sops = [{"id": 1, "titulo": "SOP", "url": "https://docs.google.com/x", "orden": 0}]
    monkeypatch.setattr(frente_service, "serializar_recursos", lambda c: sops)
    monkeypatch.setattr(frente_service.Clase, "get", classmethod(lambda cls, **k: _clase(bloqueado=True)))
    bloqueada = frente_service._clase(999999, "high")
    assert bloqueada["video_url"] is None and bloqueada["video_proximamente"] is True and bloqueada["recursos"] == sops
    assert frente_service._clase(999999, "2k")["video_url"] == URL
