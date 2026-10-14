"""Tab en la voz del coach: lo que se agrega después del borrador y quién puede pedirlo. Sin IA real."""

import pytest
from fastapi import HTTPException

from src.services import sugerencias_service as sg


def test_recorta_lo_que_ya_estaba_escrito():
    assert sg.limpiar("Hola Martina! Te cuento", "Hola Martina! ") == "Te cuento"
    assert sg.limpiar("Fijate de mandarles un audio de confirmación", "Fijate de mandarles un aud") == "io de confirmación"
    assert sg.limpiar("ahora lo que falta es agendar", "ahora lo que") == " falta es agendar"
    assert sg.limpiar('"Respuesta entera"', "") == "Respuesta entera"
    assert sg.limpiar("Otra cosa distinta", "Hola") == ""  # si cambió lo escrito, no se sugiere


def test_streaming_entrega_solo_lo_nuevo():
    r = sg._Recorte("Fijate de mandarles un aud")
    salida = "".join(r.agregar(p) for p in ["Fijate de ", "mandarles un au", "dio de confir", "mación"])
    assert salida == "io de confirmación"
    r = sg._Recorte("Hola")
    assert "".join(r.agregar(p) for p in ["Chau", " a todos"]) == ""  # cambió el borrador: nada


def test_solo_el_equipo_y_solo_en_chats_de_clientes(monkeypatch):
    monkeypatch.setattr(sg, "config", lambda k, default=None, **kw: "clave" if k == "ANTHROPIC_API_KEY" else default)
    s = sg.SugerenciasServices()
    with pytest.raises(HTTPException) as e:
        s.preparar({"usuario_id": 1, "rol": "boost"}, {"id": 1, "tipo": "cliente"}, "")
    assert e.value.status_code == 403
    with pytest.raises(HTTPException) as e:
        s.preparar({"usuario_id": 1, "rol": "admin"}, {"id": 1, "tipo": "anuncios"}, "")
    assert e.value.status_code == 422


def test_tope_por_minuto():
    sg._pedidos.clear()
    for _ in range(sg.TOPE_POR_MINUTO):
        sg._frenar(999990001)
    with pytest.raises(HTTPException) as e:
        sg._frenar(999990001)
    assert e.value.status_code == 429
    sg._pedidos.clear()


def test_el_pedido_lleva_voz_cliente_nicho_y_clases_reales():
    from src.db import db, init_db

    if db.provider is None:
        init_db()
    ctx = {
        "voz": {"rasgos": {"palabras_promedio": 20, "voseo_pct": 80}, "ejemplos": ["Dale, fijate esto y contame"]},
        "perfil": {"nicho": "fitness", "que_vende": "planes online"},
        "hechos": [{"tipo": "dolor", "texto": "No se presentan a las llamadas", "concepto": "no-show"}],
        "conversacion": [{"de": "cliente", "texto": "la mitad no se presenta"}],
    }
    nicho = {"nicho": "fitness", "dolores": [{"que": "No-show", "veces": 2}], "le_funciono": [{"texto": "Recordatorio 2 h antes"}]}
    sistema, usuario = sg.armar_prompt("Juan", ctx, "", nicho)
    assert "Sos Juan" in sistema and "Dale, fijate esto" in usuario and "planes online" in usuario
    assert "Recordatorio 2 h antes" in usuario and "voseo" in usuario
    assert "Si recomendás una clase" in usuario  # hay clases reales del concepto no-show


def test_con_la_caja_vacia_y_el_equipo_ultimo_pide_un_seguimiento():
    from datetime import datetime, timedelta

    from src.services import sugerencias_service as sg

    hace3 = (datetime.utcnow() - timedelta(days=3)).isoformat(timespec="seconds") + "Z"
    ctx = {"conversacion": [{"de": "cliente", "texto": "dale, lo veo"}, {"de": "equipo", "texto": "te paso el doc", "cuando": hace3}]}
    _, usuario = sg.armar_prompt("Franco", ctx, "", None)
    assert "seguimiento" in usuario and "hace 3 días" in usuario
    # Si el cliente solo agradece, no se inventan temas: un cierre cortito.
    ctx["conversacion"].append({"de": "cliente", "texto": "Mil gracias 🙏🏼"})
    _, usuario = sg.armar_prompt("Franco", ctx, "", None)
    assert "solo agradeció" in usuario and "mensaje corto de seguimiento" not in usuario
    # Si pregunta algo, se responde solo a lo que escribió después de la última respuesta del equipo.
    ctx["conversacion"].append({"de": "cliente", "texto": "una duda, cuándo arrancamos con el setter?"})
    _, usuario = sg.armar_prompt("Franco", ctx, "", None)
    assert "solo agradeció" not in usuario and "después de la última respuesta del equipo ---" in usuario


def test_sin_emojis_y_cierres():
    from src.services import sugerencias_service as sg

    assert sg.sin_emojis("vamos! 🙌 a full 👍🏻") == "vamos! a full "
    assert sg.es_cierre([{"texto": "Mil gracias 🙏🏼"}]) and sg.es_cierre([{"texto": "🙂"}])
    assert not sg.es_cierre([{"texto": "gracias! y cuándo arrancamos?"}])
