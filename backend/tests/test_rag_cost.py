import os
import re
import unittest
from unittest.mock import patch

from src.services import knowledge_service
from src.services.agent_service import (
    _MAX_FRAGMENTO_CHARS,
    _armar_contexto,
    truncar_fragmento,
)


class TruncarFragmentoTests(unittest.TestCase):
    def test_no_trunca_texto_corto(self):
        texto = "marketing tofu embudo"
        self.assertEqual(truncar_fragmento(texto), texto)

    def test_trunca_en_limite_de_palabra(self):
        palabra = "marketing"
        texto = " ".join([palabra] * 100)
        resultado = truncar_fragmento(texto)
        self.assertLessEqual(len(resultado), _MAX_FRAGMENTO_CHARS)
        self.assertFalse(resultado.endswith(" market"))
        self.assertTrue(
            resultado.endswith(palabra) or resultado.endswith("marketin"),
            msg="No debe cortar una palabra a la mitad salvo palabra única larga",
        )

    def test_armar_contexto_no_supera_300_caracteres_por_fragmento(self):
        fragmentos = [
            {
                "modulo": "02_advantage",
                "clase": "01_test",
                "contenido": " ".join(["marketing"] * 200),
                "clase_id": 1,
                "programa_id": 2,
            }
        ]
        contexto = _armar_contexto(fragmentos)
        cuerpos = re.split(r"---\n", contexto)
        for cuerpo in cuerpos:
            if not cuerpo.strip():
                continue
            lineas = cuerpo.split("\n", 1)
            if len(lineas) < 2:
                continue
            contenido = lineas[1].strip()
            self.assertLessEqual(
                len(contenido),
                _MAX_FRAGMENTO_CHARS,
                msg=f"Fragmento excede {_MAX_FRAGMENTO_CHARS} chars",
            )


class BuscarTopKTests(unittest.TestCase):
    def setUp(self):
        self.indice_mock = [
            {
                "modulo": "02_advantage",
                "clase": f"clase_{i}",
                "contenido": f"marketing tofu contenido relevante numero {i}",
                "clase_id": i,
                "programa_id": 2,
            }
            for i in range(10)
        ]

    def test_buscar_respeta_top_k(self):
        with patch.object(knowledge_service, "_INDEX", self.indice_mock):
            with patch.object(knowledge_service, "get_top_k", return_value=3):
                resultados = knowledge_service.buscar("marketing tofu")
                self.assertLessEqual(len(resultados), 3)
                self.assertGreater(len(resultados), 0)

    def test_get_top_k_desde_env(self):
        with patch.dict(os.environ, {"TOP_K": "2"}, clear=False):
            self.assertEqual(knowledge_service.get_top_k(), 2)

    def test_get_top_k_invalido_usa_default(self):
        with patch.dict(os.environ, {"TOP_K": "abc"}, clear=False):
            self.assertEqual(knowledge_service.get_top_k(), knowledge_service._DEFAULT_TOP_K)


class TokenizarStopwordsTests(unittest.TestCase):
    def test_filtra_stopwords_en_pregunta(self):
        tokens = knowledge_service._tokenizar(
            "¿cómo cierro una venta en una call de discovery?"
        )
        self.assertIn("venta", tokens)
        self.assertIn("call", tokens)
        self.assertNotIn("como", tokens)
        self.assertNotIn("una", tokens)

    def test_preserva_terminos_de_dominio(self):
        tokens = knowledge_service._tokenizar("ads reels leads ventas cierre")
        for term in ("ads", "reels", "leads", "ventas", "cierre"):
            self.assertIn(term, tokens)


class LimpiarTranscriptTests(unittest.TestCase):
    def test_elimina_duplicados_y_muletillas(self):
        raw = """
        um
        00:01:23 hola marketing tofu
        um
        [silencio]
        00:01:23 hola marketing tofu
        eh
        contenido util sobre ventas
        """
        limpio = knowledge_service.limpiar_transcript(raw)
        self.assertNotIn("um", limpio.lower().split())
        self.assertIn("contenido util sobre ventas", limpio)
        self.assertEqual(limpio.count("hola marketing tofu"), 1)


if __name__ == "__main__":
    unittest.main()
