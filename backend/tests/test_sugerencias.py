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
    # Con preguntas, contesta con postura; quien manda varios mensajes seguidos puede partirlo en renglones.
    assert "postura concreta" in usuario and "renglones" not in usuario
    ctx["voz"] = {"rasgos": {"palabras_promedio": 10, "varios_seguidos_pct": 74}}
    _, usuario = sg.armar_prompt("Juan", ctx, "", None)
    assert "2 o 3 renglones" in usuario and "hasta 30 palabras" in usuario


def test_los_carteles_de_discord_no_son_la_voz_de_nadie():
    from src.services.aprendizaje_service import _sin_relleno

    assert _sin_relleno("📎 0074-fernando.pdf (archivo de Discord que no quedó guardado)") == ""
    assert _sin_relleno("🎙️ Audio de Discord (no quedó guardado)\nmirá esto") == "mirá esto"


def test_cada_uno_lleva_solo_sus_emojis():
    """El modelo copiaba el emoji de quien hubiera escrito antes en el chat."""
    assert sg.emojis_de({"emojis_pct": 4, "emojis_top": ["\U0001F600"]}) is None      # casi no usa: ninguno
    assert sg.emojis_de({"emojis_pct": 60, "emojis_top": ["\U0001F525", "\U0001F4AA"]}) == {"\U0001F525", "\U0001F4AA"}
    assert sg.emojis_de({"emojis_pct": 60, "emojis_top": []}) is None
    suyos = {"\U0001F525"}
    # Deja el suyo y saca el ajeno (el 🫡 de otra persona del equipo).
    assert sg.filtrar_emojis("dale \U0001F525 vamos \U0001FAE1", suyos) == "dale \U0001F525 vamos "
    assert sg.filtrar_emojis("dale \U0001F525 vamos", None) == "dale vamos"
    assert sg.filtrar_emojis("sin nada", suyos) == "sin nada"


def test_sin_emojis_y_cierres():
    from src.services import sugerencias_service as sg

    assert sg.sin_emojis("vamos! 🙌 a full 👍🏻") == "vamos! a full "
    assert sg.es_cierre([{"texto": "Mil gracias 🙏🏼"}]) and sg.es_cierre([{"texto": "🙂"}])
    assert not sg.es_cierre([{"texto": "gracias! y cuándo arrancamos?"}])


def test_aprende_de_lo_que_escribio_en_vez_de_la_sugerencia():
    """Una sugerencia que no usó y lo que mandó en su lugar va al pedido siguiente; quién escribió cada
    mensaje y las capturas también."""
    ctx = {
        "voz": {
            "rasgos": {"palabras_promedio": 20},
            "ejemplos": ["dale"],
            "descartadas": [{"propuesto": "ya le pasaron el loom?", "enviado": "bien ahi, mandale el loom al pendiente"}],
        },
        "conversacion": [
            {"de": "equipo", "quien": "Alejandro", "texto": "que otros contactaron?"},
            {"de": "cliente", "quien": "Gabriel Sabino", "texto": "", "archivos": ["image/png"]},
            {"de": "cliente", "quien": "Gabriel Sabino", "texto": "en standby hasta que responda"},
        ],
    }
    _, usuario = sg.armar_prompt("Franco", ctx, "", None)
    assert "NO usó" in usuario and "mandale el loom al pendiente" in usuario
    assert "EQUIPO (Alejandro)" in usuario and "CLIENTE (Gabriel Sabino)" in usuario
    assert "captura" in usuario


def test_registra_la_sugerencia_descartada():
    import secrets
    from types import SimpleNamespace

    from pony.orm import db_session

    from src.db import db, init_db
    from src.models import SugerenciaIA
    from src.services import aprendizaje_service as ap

    if db.provider is None:
        init_db()
    admin_id, canal_id = 999_000_000 + secrets.randbelow(10_000), 999_000_001
    try:
        with db_session:
            SugerenciaIA(admin_id=admin_id, canal_id=canal_id, sugerencia="ya le pasaron el loom a mr monopoly?")
            SugerenciaIA(admin_id=admin_id, canal_id=canal_id + 1, sugerencia="genial")
        with db_session:
            # Casi igual a la sugerencia: la aceptó (lo marca enviada()), no es un descarte.
            ap.registrar_descartada(admin_id, canal_id, SimpleNamespace(id=1, texto="ya le pasaron el loom a mr monopoly??"))
        assert ap.descartadas_de(admin_id) == []
        with db_session:
            ap.registrar_descartada(admin_id, canal_id, SimpleNamespace(id=2, texto="bien ahi, mandale el loom al pendiente asi no se enfria"))
        d = ap.descartadas_de(admin_id)
        assert len(d) == 1 and d[0]["enviado"].startswith("bien ahi")
    finally:
        with db_session:
            db.execute(f'DELETE FROM "classroom"."cerebro_sugerencias" WHERE admin_id = {admin_id}')
