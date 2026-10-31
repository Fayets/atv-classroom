"""Los clientes no mandan audios (Franco, 31-10-2026): el servidor los rechaza antes de tocar nada."""

import pytest
from fastapi import HTTPException

from src.services.mensajeria_service import MensajeriaServices


@pytest.mark.parametrize("nombre", ["nota-de-voz.webm", "audio.m4a", "mensaje.ogg", "grabacion.mp3"])
def test_el_cliente_no_puede_subir_audios(nombre):
    with pytest.raises(HTTPException) as e:
        MensajeriaServices().subir_adjunto({"usuario_id": 1, "rol": "high", "tipo": "cliente"}, 1, nombre, iter([b"x"]))
    assert e.value.status_code in (403, 415)
