"""Piloto: qué chats contesta, en la voz de quién, cuándo sale solo y qué queda de borrador.

Corre SOLO contra una base local (DB_HOST=127.0.0.1 o localhost): crea y cambia filas del equipo y de
mensajes. Contra Neon se saltea entero. La IA es falsa: se le pasa `pedir` con respuestas fijas."""

import json
from datetime import datetime, timedelta

import pytest
from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

pytestmark = pytest.mark.skipif(
    config("DB_HOST", default="") not in ("127.0.0.1", "localhost"),
    reason="El piloto se prueba solo contra una base local, nunca contra Neon.",
)

from src.db import db, init_db  # noqa: E402

CLI = 999999301


def _ia(texto="dale, está en la clase 4 del modulo de embudos", tema="dato", seguro=True):
    """Una IA falsa: la respuesta y, para la pregunta del tema, el JSON."""

    def pedir(sistema, usuario, modelo, max_tokens, uso):
        if uso == "piloto:tema":
            return json.dumps({"tema": tema, "seguro": seguro})
        return texto

    return pedir


@pytest.fixture(scope="module")
def base():
    if db.provider is None:
        init_db()
    from src.models import Admin, Canal, MensajeCanal

    with db_session:
        juan = Admin(email="juan-piloto@test.local", nombre="Juan Carrizo", rol="coach")
        mauri = Admin(email="mauri-piloto@test.local", nombre="Mauri", rol="coach")
        canal = Canal(tipo="cliente", cliente_id=CLI, nombre="Rodrigo Gil")
        db.flush()
        ids = {"juan": juan.id, "mauri": mauri.id, "canal": canal.id}
        hace = datetime.utcnow() - timedelta(minutes=30)
        MensajeCanal(canal=canal, autor_tipo="cliente", autor_id=CLI, texto="hola juan!", creado_en=hace)
        MensajeCanal(canal=canal, autor_tipo="admin", autor_id=juan.id, texto="hola rodri, como va", creado_en=hace + timedelta(minutes=1))
    return ids


def _cliente_escribe(canal_id, texto, hace_min=5):
    from src.models import Canal, MensajeCanal

    with db_session:
        m = MensajeCanal(canal=Canal[canal_id], autor_tipo="cliente", autor_id=CLI, texto=texto,
                         creado_en=datetime.utcnow() - timedelta(minutes=hace_min))
        db.flush()
        return m.id


def test_decidir():
    from src.services.piloto_service import decidir

    assert decidir("borrador", [], "dato", True) == (False, None)
    assert decidir("automatico", ["plata"], "dato", True) == (True, None)
    assert decidir("automatico", ["plata"], "plata", True) == (False, "plata y pagos")
    assert decidir("automatico", ["no_seguro"], "dato", False) == (False, "no estaba seguro")
    assert decidir("automatico", [], "dato", False) == (True, None)


def test_clasificar_si_la_ia_devuelve_basura_no_sale_solo():
    from src.services.piloto_service import clasificar

    assert clasificar("x", "y", pedir=lambda *a: "no sé") == {"tema": "otro", "seguro": False}
    assert clasificar("x", "y", pedir=lambda *a: '{"tema": "inventado", "seguro": true}') == {"tema": "otro", "seguro": True}


def test_limpiar_respuesta_corta_las_marcas():
    from src.services.piloto_service import limpiar_respuesta

    assert limpiar_respuesta('"dale rodri <cite index=1>x</cite>"', None) == "dale rodri"


def test_apagado_no_contesta(base):
    from src.services import piloto_service as p

    hasta = _cliente_escribe(base["canal"], "no encuentro lo del embudo con palabra clave, me lo pasas?")
    assert (base["canal"], hasta) in p.pendientes()
    assert p.responsable(base["canal"]) == base["juan"]
    assert p.config_de(base["juan"])["modo"] == "apagado"
    assert p.ciclo(pedir=_ia()) == []


def test_borrador_queda_para_aprobar_y_no_se_repite(base):
    from src.services import piloto_service as p

    p.guardar_config(base["juan"], "borrador", None, None)
    eventos = p.ciclo(pedir=_ia())
    assert [e["tipo"] for e in eventos] == ["borrador"]
    assert eventos[0]["para_vos"] is False
    assert all(c != base["canal"] for c, _ in p.pendientes())
    assert p.ciclo(pedir=_ia()) == []  # ya está escrito: no se vuelve a pedir

    juan = {"usuario_id": base["juan"], "rol": "coach"}
    datos = p.PilotoServices().del_canal(juan, base["canal"])
    assert datos["borrador"]["texto"].startswith("dale, está en la clase 4")
    assert datos["borrador"]["voz_nombre"] == "Juan" and datos["borrador"]["mio"] is True
    assert datos["modo"] == "borrador"


def test_enviar_editado_ensena_la_voz(base):
    from src.models import PilotoBorrador, SugerenciaIA
    from src.services import piloto_service as p

    juan = {"usuario_id": base["juan"], "rol": "coach"}
    svc = p.PilotoServices()
    bid = svc.del_canal(juan, base["canal"])["borrador"]["id"]
    mensaje, canal = svc.enviar(juan, bid, "dale rodri, esta en la clase 4 de embudos, arranca por el min 6")
    assert canal["id"] == base["canal"] and mensaje["texto"].endswith("min 6")
    with db_session:
        b = PilotoBorrador[bid]
        assert b.estado == "editado" and b.cambio_pct > 0 and b.mensaje_id == mensaje["id"]
        s = SugerenciaIA.get(mensaje_id=mensaje["id"])
        assert s is not None and s.voz_id == base["juan"] and s.usada
    with pytest.raises(HTTPException) as e:
        svc.enviar(juan, bid, None)
    assert e.value.status_code == 404


def test_automatico_sale_solo_en_su_nombre(base):
    from src.models import MensajeCanal, PilotoBorrador
    from src.services import piloto_service as p

    p.guardar_config(base["juan"], "automatico", ["plata", "baja_o_queja", "no_seguro"], None)
    _cliente_escribe(base["canal"], "y el link del grupo de los martes?")
    eventos = p.ciclo(pedir=_ia("te lo paso, esta fijado arriba en anuncios"))
    assert [e["tipo"] for e in eventos] == ["mensaje"]
    m = eventos[0]["mensaje"]
    with db_session:
        guardado = MensajeCanal[m["id"]]
        assert guardado.autor_tipo == "admin" and guardado.autor_id == base["juan"]
        assert PilotoBorrador.get(mensaje_id=m["id"]).estado == "automatico"
    juan = {"usuario_id": base["juan"], "rol": "coach"}
    assert str(m["id"]) in p.PilotoServices().del_canal(juan, base["canal"])["marcas"]


def test_automatico_no_contesta_plata(base):
    from src.services import piloto_service as p

    _cliente_escribe(base["canal"], "che me cobraron dos veces la cuota")
    eventos = p.ciclo(pedir=_ia("ya lo veo", tema="plata"))
    assert [e["tipo"] for e in eventos] == ["borrador"] and eventos[0]["para_vos"] is True
    r = p.resumen()
    assert any(v["canal_id"] == base["canal"] and v["motivo"] == "plata y pagos" for v in r["para_vos"])
    assert r["hoy"]["automatico"] >= 1 and r["hoy"]["editado"] >= 1


def test_si_alguien_contesta_a_mano_el_borrador_vence(base):
    from src.services import piloto_service as p
    from src.services.mensajeria_service import MensajeriaServices

    mauri = {"usuario_id": base["mauri"], "rol": "coach"}
    MensajeriaServices().enviar(mauri, base["canal"], "rodri ya lo reviso con administracion", None)
    assert p.PilotoServices().del_canal(mauri, base["canal"])["borrador"] is None
    # Ahora el chat es de Mauri, que tiene el piloto apagado.
    assert p.responsable(base["canal"]) == base["mauri"]


def test_otro_coach_no_puede_tocar_un_borrador_ajeno_si_no_ve_el_chat(base):
    from src.services import piloto_service as p

    cliente = {"usuario_id": CLI, "rol": "mid"}
    with pytest.raises(HTTPException) as e:
        p.PilotoServices().del_canal(cliente, base["canal"])
    assert e.value.status_code == 403


def test_modo_invalido(base):
    from src.services import piloto_service as p

    with pytest.raises(HTTPException):
        p.guardar_config(base["juan"], "turbo", None, None)
    with pytest.raises(HTTPException):
        p.guardar_config(base["juan"], None, ["cualquiera"], None)


def test_llamadas_de_un_coach_para_leverage(base):
    from src.models import Llamada
    from src.services import agentes_service as ag

    with db_session:
        for i in range(3):
            Llamada(admin_id=base["juan"], fathom_id=f"piloto-{i}", titulo=f"Llamada {i}", resumen="hablamos de precios",
                    puntos_json=json.dumps([{"texto": "subir a 997"}]), transcripcion="hola...", cliente_id=CLI)
    agente = {"nombre": "leverage", "scopes": ["lectura"]}
    r = ag.llamadas_de_coach(agente, base["juan"], 0, 2, False)
    assert [l["titulo"] for l in r["llamadas"]] == ["Llamada 0", "Llamada 1"] and r["hay_mas"]
    assert "transcripcion" not in r["llamadas"][0] and r["llamadas"][0]["puntos"] == [{"texto": "subir a 997"}]
    r2 = ag.llamadas_de_coach(agente, base["juan"], r["ultimo_id"], 2, True)
    assert [l["titulo"] for l in r2["llamadas"]] == ["Llamada 2"] and not r2["hay_mas"] and r2["llamadas"][0]["transcripcion"] == "hola..."
    with pytest.raises(HTTPException):
        ag.puede_piloto(agente)
    ag.puede_piloto({"scopes": ["lectura", "piloto"]})


def test_el_piloto_usa_las_llamadas_del_cliente(base):
    from src.services import piloto_service as p

    vistos = []

    def pedir(sistema, usuario, modelo, max_tokens, uso):
        vistos.append(usuario)
        return json.dumps({"tema": "estrategia", "seguro": True}) if uso == "piloto:tema" else "anda a 997"

    p.guardar_config(base["mauri"], "borrador", None, None)
    _cliente_escribe(base["canal"], "mauri entonces cobro 497 o 997?")
    eventos = p.ciclo(pedir=pedir)
    assert [e["tipo"] for e in eventos] == ["borrador"]
    assert "Fathom" in vistos[0] and "subir a 997" in vistos[0]


def test_leverage_trae_y_manda_borradores(base):
    from src.services import piloto_service as p

    p.guardar_config(base["mauri"], "borrador", None, None)
    _cliente_escribe(base["canal"], "mauri me pasas el link del grupo?")
    _cliente_escribe(base["canal"], "el de los martes")
    p.ciclo(pedir=_ia("te lo paso, esta fijado en anuncios"))
    lista = p.borradores_pendientes()
    mio = next(b for b in lista if b["canal_id"] == base["canal"])
    assert mio["cliente"] == "Rodrigo Gil" and mio["coach"] == "Mauri"
    assert mio["cliente_escribio"][-2:] == ["mauri me pasas el link del grupo?", "el de los martes"]
    mensaje, canal = p.enviar_por_agente(mio["id"], "te lo paso, esta fijado arriba en anuncios")
    assert canal["id"] == base["canal"] and mensaje["texto"].endswith("en anuncios")
    from src.models import MensajeCanal, PilotoBorrador

    with db_session:
        assert MensajeCanal[mensaje["id"]].autor_id == base["mauri"]
        assert PilotoBorrador[mio["id"]].estado == "editado"
    with pytest.raises(HTTPException):
        p.enviar_por_agente(mio["id"], None)
    assert all(b["id"] != mio["id"] for b in p.borradores_pendientes())


def test_voz_aprendida_para_juan_ia(base):
    import json as _json

    from src.models import ReglaVoz, SugerenciaIA, VozEquipo
    from src.services import voz_agentes as ag

    with db_session:
        VozEquipo(admin_id=base["juan"], rasgos_json=_json.dumps({"palabras_promedio": 14, "todo_minuscula_pct": 80, "punto_final_pct": 5, "mensajes": 300, "muletillas": ["lo vemos"]}), muestras_json="[]")
        ReglaVoz(voz_id=base["juan"], texto="no repitas una pregunta que ya hice", creado_por=base["juan"])
        SugerenciaIA(admin_id=base["juan"], canal_id=base["canal"], sugerencia="Hola! Te recomiendo revisar la clase 4.", usada=True,
                     enviado="dale, mira la clase 4 y lo vemos", cambio_pct=60, voz_id=base["juan"])
    v = ag.voz_de_persona({"scopes": ["lectura"]}, str(base["juan"]))
    assert v["persona"]["id"] == base["juan"]
    assert "minúscula" in v["como_escribe"] and '"lo vemos"' in v["como_escribe"]
    assert v["reglas"] == ["no repitas una pregunta que ya hice"]
    assert {"la_ia_propuso": "Hola! Te recomiendo revisar la clase 4.", "mando": "dale, mira la clase 4 y lo vemos"} in v["correcciones"]


def test_cuello_pedido_desde_leverage(base):
    from src.models import ClienteExterno, CuelloDiagnostico
    from src.services import cuellos_agentes as ca

    with db_session:
        cli = ClienteExterno(nombre="Lucía Méndez", email="lucia-cuello@prueba.com", plan_actual="avanzado", estado_cliente="vigente")
        db.flush()
        cid = cli.id
    en_fondo = []
    r = ca.pedir({"scopes": ["lectura", "piloto"]}, "lucía", "https://www.loom.com/share/0123456789abcdef0123456789abcdef", None, "no vende", "Mauri", en_fondo=en_fondo.append)
    assert r["cliente"] == "Lucía Méndez" and r["estado"] == "pidiendo" and r["borrador"] is None and en_fondo == [r["id"]]
    with db_session:
        d = CuelloDiagnostico[r["id"]]
        assert d.cliente_id == cid and d.admin_id == base["mauri"] and d.contexto == "no vende"
        d.estado, d.version_jeremy, d.version_cerebro = "borrador", "## Diagnóstico\nle falta la oferta", "secreto del cerebro"
    v = ca.ver({"scopes": ["lectura"]}, r["id"])
    assert v["borrador"] == "## Diagnóstico\nle falta la oferta" and "secreto" not in str(v)
    with pytest.raises(HTTPException):
        ca.pedir({"scopes": ["piloto"]}, "nadie-con-este-nombre", "https://www.loom.com/share/abc", None, None, "Mauri")
