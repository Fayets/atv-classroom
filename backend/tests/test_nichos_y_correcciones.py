"""Subnichos, nicho decidido con pruebas y correcciones del Tab. Sin IA real ni base."""

from src.services import aprendizaje_service as ap
from src.services import nichos_service as ns
from src.services import sugerencias_service as sg


def test_subnichos_parecidos_quedan_juntos():
    existentes = ["entrenamiento para mujeres postparto", "agencia de anuncios para infoproductores"]
    assert ap.unificar_subnicho("entrenamiento de mujer postparto", existentes) == "entrenamiento para mujeres postparto"
    assert ap.unificar_subnicho("nutrición para deportistas", existentes) == "nutrición para deportistas"
    assert ap.limpiar_subnicho("Inglés para profesionales de IT.") == "inglés para profesionales de it"
    assert ap.limpiar_subnicho("coaching") is None  # una palabra sola no dice a quién le vende


def test_el_nicho_necesita_la_frase_del_cliente():
    frases = ["Mensaje: soy coach de mujeres que sienten que están para más", "Mensaje: tengo que armar el embudo y los anuncios"]
    # Habla de anuncios porque lo aprende en ATV: no alcanza para ser de marketing.
    assert ns.decidir({"nicho": "marketing-digital", "subnicho": "x y", "cita": "tengo que armar el embudo y los anuncios"}, frases, {}) == {}
    # La cita tiene que estar en lo que dijo.
    assert ns.decidir({"nicho": "desarrollo-personal", "cita": "ayudo a mujeres a sanar"}, frases, {}) == {}
    ok = ns.decidir({"nicho": "desarrollo-personal", "subnicho": "mentoría para mujeres", "cita": "soy coach de mujeres que sienten"}, frases, {})
    assert ok["nicho"] == "desarrollo-personal" and ok["subnicho"] == "mentoría para mujeres"
    # Quien VENDE marketing sí va a marketing.
    frases.append("Mensaje: tengo una agencia de anuncios para coaches")
    agencia = ns.decidir({"nicho": "marketing-digital", "subnicho": "anuncios para coaches", "cita": "tengo una agencia de anuncios para coaches"}, frases, {})
    assert agencia["nicho"] == "marketing-digital"
    frases.append("Mensaje: escalo infoproductores a 7 cifras anuales")
    assert ns.decidir({"nicho": "negocios-online", "cita": "escalo infoproductores a 7 cifras anuales"}, frases, {})["nicho"] == "negocios-online"


def test_el_subnicho_sale_de_lo_que_dijo_el_cliente():
    frases = ["A qué se dedica: Ayuda a dueños de negocio e infoproductores a conseguir leads cualificados con YouTube"]
    # Copiado de otro cliente: nada de eso lo dijo.
    assert ns.subnicho_probado("agencia de prospección y cierre de creadores", frases) is None
    assert ns.subnicho_probado("youtube para leads de infoproductores", frases) == "youtube para leads de infoproductores"
    # La descripción de ATV no es el subnicho de nadie.
    assert ns.subnicho_probado("creadores y expertos que venden infoproductos", frases + ["Mensaje: soy creador y experto, vendo infoproductos"]) is None
    r = ns.decidir({"nicho": "marketing-digital", "subnicho": "agencia de prospección y cierre de creadores", "cita": "Ayuda a dueños de negocio e infoproductores a conseguir leads"}, frases, {})
    assert r["nicho"] == "marketing-digital" and r["subnicho"] is None


def test_el_nicho_sale_del_tema_del_subnicho():
    assert ns.nicho_por_tema("inversión en bienes raíces en eeuu para profesionales") == "inmobiliaria"
    assert ns.nicho_por_tema("regulacion hormonal para mujeres +35") == "salud"
    assert ns.nicho_por_tema("agencia de automatización con ia para creadores") == "tecnologia-programacion"
    assert ns.nicho_por_tema("agencia de youtube para infoproductores") == "marketing-digital"
    assert ns.nicho_por_tema("criterio cripto para perfiles que ya perdieron dinero") == "finanzas-trading"
    assert ns.nicho_por_tema("coaching de running para mujeres") == "deportes"
    assert ns.nicho_por_tema("mentoria para mujeres") is None
    assert ns.nicho_por_tema("marketing para psicólogos") == "marketing-digital"
    assert ns.nicho_por_tema("agencia de ventas para coaches fitness") == "marketing-digital"
    assert ns.nicho_por_tema("entrenamiento para mujeres postparto") == "fitness"
    assert ns.nicho_por_tema("posicionamiento y venta de cursos para psicólogos") == "marketing-digital"
    frases = ["Mensaje: invierto en propiedades en EEUU y enseño a profesionales a comprar su primera propiedad"]
    r = ns.decidir({"nicho": "desarrollo-personal", "subnicho": "inversión en propiedades para profesionales", "cita": "enseño a profesionales a comprar su primera propiedad"}, frases, {})
    assert r["nicho"] == "inmobiliaria"


def test_correcciones_medidas_en_codigo():
    assert ap.cambio_pct("Hola! te cuento algo", "Hola! te cuento algo") == 0
    assert ap.cambio_pct("Hola, ¿cómo estás?", "hola como estas") == 100
    pares = [
        ("¡Hola Martina! Te cuento que el embudo está genial, ¿lo vemos mañana?", "hola martina el embudo esta joya, lo vemos mañana?"),
        ("¡Hola Pedro! Excelente avance con los anuncios, seguí así 🙌", "pedro joya lo de los anuncios"),
        ("¡Hola Ana! Excelente que hayas cerrado esa venta 🎉", "ana joya esa venta"),
        ("Perfecto, nos vemos el jueves", "Perfecto, nos vemos el jueves"),
    ]
    r = ap.rasgos_correcciones(pares)
    assert r["aceptadas"] == 4 and r["tal_cual_pct"] == 25
    assert r["largo_vs_ia"] < 0.8
    assert "hola" in r["saca"] and "excelente" in r["saca"] and "joya" in r["agrega"]
    assert r["saca_emojis_pct"] == 100 and r["saca_signos_apertura_pct"] == 100


def test_el_tab_aprende_de_las_correcciones():
    reglas = sg._reglas_de_correcciones({"aceptadas": 5, "largo_vs_ia": 0.5, "saca": ["excelente"], "agrega": ["joya"], "saca_emojis_pct": 100})
    texto = "; ".join(reglas)
    assert "más corto" in texto and '"excelente"' in texto and '"joya"' in texto and "emojis" in texto
    assert sg._reglas_de_correcciones({"aceptadas": 2, "saca": ["excelente"]}) == []  # con muy pocas no se concluye nada

    from src.db import db, init_db

    if db.provider is None:
        init_db()
    ctx = {
        "voz": {"rasgos": {"palabras_promedio": 12}, "ejemplos": ["dale fijate"], "correcciones": [{"propuesto": "¡Excelente avance!", "enviado": "joya", "cambio": 100}]},
        "perfil": {"nicho": "fitness", "subnicho": "entrenamiento para mujeres postparto"},
        "hechos": [],
        "conversacion": [{"de": "cliente", "texto": "ya publiqué el reel"}],
    }
    nicho = {
        "nicho": "fitness", "dolores": [], "le_funciono": [{"texto": "A otro de fitness le sirvió X"}],
        "subnichos": [{"subnicho": "entrenamiento para mujeres postparto", "le_funciono": [{"texto": "Grupo de WhatsApp de mamás"}]}],
    }
    _, usuario = sg.armar_prompt("Juan", ctx, "", nicho)
    assert 'La IA propuso: "¡Excelente avance!"' in usuario and 'Mandó: "joya"' in usuario
    assert "entrenamiento para mujeres postparto" in usuario
    assert usuario.index("Grupo de WhatsApp de mamás") < usuario.index("A otro de fitness")  # su subnicho primero
