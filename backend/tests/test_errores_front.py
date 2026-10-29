"""Registro de errores del navegador: se guarda quién y dónde, y un bucle no llena la tabla."""
from src.services import errores_service as es


def test_guarda_quien_y_frena_los_bucles(monkeypatch):
    guardados = []
    monkeypatch.setattr(es, "ErrorFront", lambda **k: guardados.append(k))
    es._POR_IP.clear()
    datos = {"tipo": "pantalla-vacia", "mensaje": "Pantalla vacía en /classroom", "ruta": "/classroom", "desde": "/mensajes"}
    assert es.registrar(datos, {"usuario_id": 89, "rol": "boost"}, "1.2.3.4", "iPhone")
    assert guardados[0]["usuario"] == "cliente:89" and guardados[0]["desde"] == "/mensajes"
    assert es.registrar(datos, {"usuario_id": 62, "rol": "admin"}, "1.2.3.4", "Mac")
    assert guardados[1]["usuario"] == "equipo:62"
    for _ in range(30):
        es.registrar(datos, None, "5.6.7.8", "x")
    assert sum(1 for g in guardados if g["usuario"] is None) == es._TOPE_MINUTO
