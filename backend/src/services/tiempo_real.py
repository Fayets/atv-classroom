"""Reparto en vivo de eventos de mensajería por WebSocket.

El backend corre en un solo proceso (uvicorn sin --workers), así que las conexiones viven
en memoria. Si algún día hay más de un proceso, esto se reemplaza por LISTEN/NOTIFY de Postgres."""

import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)


def puede_ver(sesion: dict, canal: dict) -> bool:
    """canal: {"id", "tipo", "cliente_id"}. El admin ve todo; el coach, solo los canales donde lo
    etiquetaron (sesion["canales_coach"]); el cliente, su canal. Los anuncios los ven todos."""
    rol = sesion.get("rol")
    if rol == "admin":
        return True
    if canal["tipo"] == "anuncios":
        return True
    if rol == "coach":
        return canal.get("id") in sesion.get("canales_coach", set())
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

    def sumar_canal_a_coach(self, admin_id: int, canal_id: int) -> None:
        """Al etiquetar a un coach, ese canal pasa a ser visible para sus conexiones abiertas."""
        for sesion in self._conexiones.values():
            if sesion.get("rol") == "coach" and sesion.get("usuario_id") == admin_id:
                sesion.setdefault("canales_coach", set()).add(canal_id)

    async def emitir_a_equipo(self, admin_id: int, evento: dict) -> None:
        for ws, sesion in list(self._conexiones.items()):
            if sesion.get("rol") in ("admin", "coach") and sesion.get("usuario_id") == admin_id:
                try:
                    await ws.send_json(evento)
                except Exception:
                    self.desconectar(ws)

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
