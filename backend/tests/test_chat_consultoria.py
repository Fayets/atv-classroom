import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from src.db import init_db
from src.services import agent_service, knowledge_service
from src.services.chat_service import (
    cargar_historial,
    contar_mensajes_sesion,
    guardar_mensaje,
    obtener_o_crear_sesion_id,
)
from src.services.agent_service import (
    _MAX_FRAGMENTO_CHARS,
    _armar_contexto,
    detectar_modo_consultoria,
    get_rag_config,
    responder_stream,
)

CASO_SOOWEI = """
Te cuento el caso de mi cliente SooWei. Factura 8k/mes, tiene 2 closers y 1 setter.
Avatar: coaches de fitness en LATAM. Problema: no le cierran las calls, show rate 20%.
¿Me armás un diagnóstico y roadmap por fases?
""".strip()


class ModoConsultoriaTests(unittest.TestCase):
    def test_detecta_caso_de_negocio(self):
        self.assertTrue(detectar_modo_consultoria(CASO_SOOWEI))

    def test_pregunta_corta_no_es_consultoria(self):
        self.assertFalse(detectar_modo_consultoria("¿qué es TOFU en marketing?"))

    def test_continua_con_roadmap_en_historial(self):
        historial = [
            {
                "rol": "assistant",
                "contenido": "fase 1 diagnóstico\nfase 2 oferta\nroadmap completo",
            }
        ]
        self.assertTrue(detectar_modo_consultoria("continúa", historial))

    def test_rag_config_por_modo(self):
        corto = get_rag_config(False)
        consultoria = get_rag_config(True)
        self.assertEqual(corto["top_k"], knowledge_service.get_top_k())
        self.assertEqual(corto["truncado"], _MAX_FRAGMENTO_CHARS)
        self.assertEqual(corto["max_tokens"], 1024)
        self.assertEqual(consultoria["top_k"], agent_service.get_top_k_consultoria())
        self.assertEqual(consultoria["truncado"], agent_service.get_truncado_consultoria())
        self.assertEqual(consultoria["max_tokens"], 4096)

    def test_armar_contexto_respeta_truncado_consultoria(self):
        fragmentos = [
            {
                "modulo": "02_advantage",
                "clase": "09_como_definir_tu_avatar",
                "contenido": " ".join(["avatar"] * 300),
            }
        ]
        contexto = _armar_contexto(fragmentos, max_chars=900)
        cuerpo = contexto.split("\n", 1)[1]
        self.assertLessEqual(len(cuerpo.strip()), 900)


class ChatMemoriaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def test_historial_persiste_tres_turnos(self):
        sesion_id = f"test-{datetime.utcnow().timestamp()}"
        usuario_id = 999001
        tipo = "cliente"

        for i in range(3):
            guardar_mensaje(
                sesion_id=sesion_id,
                usuario_id=usuario_id,
                tipo_usuario=tipo,
                rol="user",
                contenido=f"pregunta {i}",
            )
            guardar_mensaje(
                sesion_id=sesion_id,
                usuario_id=usuario_id,
                tipo_usuario=tipo,
                rol="assistant",
                contenido=f"respuesta {i}",
            )

        historial = cargar_historial(sesion_id)
        self.assertEqual(len(historial), 6)
        self.assertEqual(historial[0]["contenido"], "pregunta 0")
        self.assertEqual(historial[-1]["contenido"], "respuesta 2")
        self.assertEqual(contar_mensajes_sesion(sesion_id), 6)

    def test_nueva_sesion_tras_inactividad(self):
        usuario_id = 999002
        tipo = "cliente"
        sesion_vieja = f"vieja-{datetime.utcnow().timestamp()}"

        guardar_mensaje(
            sesion_id=sesion_vieja,
            usuario_id=usuario_id,
            tipo_usuario=tipo,
            rol="user",
            contenido="mensaje antiguo",
        )

        from pony.orm import commit, db_session

        from src.services.chat_service import _mensajes_por_sesion

        @db_session
        def _retroceder_fecha():
            msg = next(iter(_mensajes_por_sesion(sesion_vieja)), None)
            self.assertIsNotNone(msg)
            msg.creado_en = datetime.utcnow() - timedelta(hours=5)
            commit()

        _retroceder_fecha()

        sesion_nueva = obtener_o_crear_sesion_id(usuario_id, tipo)
        self.assertNotEqual(sesion_nueva, sesion_vieja)


class ResponderStreamModoTests(unittest.IsolatedAsyncioTestCase):
    async def test_buscar_usa_top_k_consultoria_cuando_modo_forzado(self):
        chunks = []

        async def fake_stream(prompt, *, historial=None, max_tokens=1024):
            yield "diagnóstico\n\nfase 1\nfase 2\n\nmódulos recomendados"

        with patch.object(
            agent_service.knowledge_service,
            "buscar",
            return_value=[],
        ) as mock_buscar:
            with patch.object(
                agent_service,
                "_ejecutar_claude_stream",
                side_effect=fake_stream,
            ):
                async for chunk in responder_stream(
                    CASO_SOOWEI,
                    historial=[],
                    modo_consultoria=True,
                ):
                    chunks.append(chunk)

        mock_buscar.assert_called_once()
        self.assertEqual(mock_buscar.call_args.kwargs["top_k"], 5)
        self.assertTrue(any("fase" in c for c in chunks))


if __name__ == "__main__":
    unittest.main()
