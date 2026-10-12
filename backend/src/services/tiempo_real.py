"""Reparto en vivo de eventos de mensajería por WebSocket.

El backend corre en un solo proceso (uvicorn sin --workers), así que las conexiones viven
en memoria. Si algún día hay más de un proceso, esto se reemplaza por LISTEN/NOTIFY de Postgres."""

import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)


def puede_ver(sesion: dict, canal: dict) -> bool:
    """canal: {"tipo", "cliente_id"}. El equipo ve todo; el cliente, su canal y los de anuncios."""
    if sesion.get("rol") in ("admin", "coach"):
        return True
    if canal["tipo"] == "anuncios":
        return True
    return canal["tipo"] == "cliente" and canal["cliente_id"] == sesion["usuario_id"]


class Hub:
    def __init__(self) -> None:
        self._conexiones: dict[WebSocket, dict] = {}

    def conectar(self, ws: WebSocket, sesion: dict) -> None:
        self._conexiones[ws] = sesion

    def desconectar(self, ws: WebSocket) -> None:
        self._conexiones.pop(ws, None)

    def conectados(self) -> int:
        return len(self._conexiones)

    async def emitir(self, evento: dict, canal: dict, excepto: WebSocket | None = None) -> None:
        for ws, sesion in list(self._conexiones.items()):
            if ws is excepto or not puede_ver(sesion, canal):
                continue
            try:
                await ws.send_json(evento)
            except Exception:
                # Conexión caída: se limpia; el navegador reconecta y recupera lo que faltó.
                self.desconectar(ws)


hub = Hub()
