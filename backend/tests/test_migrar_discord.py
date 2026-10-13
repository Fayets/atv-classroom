"""Lectura de los transcripts de Discord y medición del estilo de escritura. Sin base de datos."""

from collections import Counter
from datetime import datetime

from scripts.migrar_discord import limpiar_texto, nota_de_adjunto, parsear
from src.services.aprendizaje_service import rasgos_de

TRANSCRIPT = """Canal:     #ana-perez
Programa:  BOOST
Extraído:  2026-09-04 12:51
Mensajes:  3
============================================================

[2026-07-25 22:54] Nick Xanderz
<@123> bienvenida a tu canal
Paso 1 — revisá tu mail

[2026-07-26 11:04] Ana Pérez
hola! ya lo hice <:fuego:999>
  📎 https://cdn.discordapp.com/attachments/1/555/captura.png?ex=1

[2026-07-26 11:05] Ana Pérez
  📎 https://cdn.discordapp.com/attachments/1/556/voice-message.ogg?ex=1

"""


def test_lee_cabeceras_textos_multilinea_y_adjuntos(tmp_path):
    f = tmp_path / "ana-perez.txt"
    f.write_text(TRANSCRIPT, encoding="utf-8")
    ms = parsear(f)
    assert [m["autor"] for m in ms] == ["Nick Xanderz", "Ana Pérez", "Ana Pérez"]
    assert ms[0]["fecha"] == datetime(2026, 7, 25, 22, 54)
    assert ms[0]["texto"] == "<@123> bienvenida a tu canal\nPaso 1 — revisá tu mail"
    assert ms[1]["adjuntos"] == ["https://cdn.discordapp.com/attachments/1/555/captura.png?ex=1"]
    assert ms[2]["texto"] == "" and len(ms[2]["adjuntos"]) == 1


def test_limpia_menciones_y_emojis_de_discord():
    d = {"usuarios": {"123": "Ana Pérez"}, "canales": {"9": "wins"}}
    assert limpiar_texto("<@123> mirá <#9> <:fuego:999>", d) == "@Ana Pérez mirá #wins :fuego:"
    assert nota_de_adjunto("voice-message.ogg").startswith("🎙️")
    assert "contrato.pdf" in nota_de_adjunto("contrato.pdf")


def test_estilo_minuscula_sin_punto_y_abreviaturas_reales():
    textos = ["buenas reyyy como va", "dale te paso la info x aca", "excelente, quedo atento", "son 50k x mes", "tmb fijate eso", "tmb lo vemos con Sebas", "Sebas te escribe"]
    r = rasgos_de(textos, Counter({"dale": 50, "la": 100}))
    assert r["todo_minuscula_pct"] >= 60 and r["punto_final_pct"] == 0
    assert "x" in r["abreviaturas"] and "tmb" in r["abreviaturas"] and "k" not in r["abreviaturas"]
    assert "sebas" not in r["palabras_propias"]  # nombres propios no son estilo


def test_plantillas_repetidas_y_links_no_cuentan():
    r = rasgos_de(["bienvenido al programa " * 20] * 5 + ["mirá https://calendly.com/x", "ok"])
    assert r["mensajes"] == 3
