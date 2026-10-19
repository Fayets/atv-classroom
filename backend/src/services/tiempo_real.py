"""Reparto en vivo de eventos de mensajería por WebSocket.

El backend corre en un solo proceso (uvicorn sin --workers), así que las conexiones viven
en memoria. Si algún día hay más de un proceso, esto se reemplaza por LISTEN/NOTIFY de Postgres.

Cada pestaña tiene su propia cola de salida y su propia tarea que escribe en el socket: emitir
un evento nunca espera a una conexión. Antes se mandaba de a una y en orden, y una sola pestaña
colgada (un celular sin señal, una compu dormida) frenaba hasta 10 s cada mensaje de todos.
Si una pestaña no lee y se le acumulan eventos, se la corta: el navegador reconecta solo y
recupera lo que faltó por HTTP."""

import asyncio
import logging

from fastapi import WebSocket

from src.services.roles_canal import cliente_ve

logger = logging.getLogger(__name__)

COLA_MAX = 300          # eventos pendientes por pestaña antes de cortarla
ESPERA_ENVIO_S = 10     # un envío que tarda más que esto es una conexión muerta
CIERRE_LENTA = 4408     # código de cierre: el navegador reconecta (no es un problema de sesión)


def puede_ver(sesion: dict, canal: dict) -> bool:
    """canal: {"id", "tipo", "cliente_id", "roles", "creado_por"}. El admin ve todo; el coach, todos los
    chats de clientes (como el admin) y los grupos del equipo, los que creó él o donde lo etiquetaron;
    el cliente, su canal y los grupos de su rol. Los anuncios los ven todos."""
    rol = sesion.get("rol")
    if canal["tipo"] == "directo":
        # Un mensaje directo lo ven solo sus dos participantes: ni siquiera un admin.
        return rol in ("admin", "coach") and not sesion.get("miembro_id") and sesion.get("usuario_id") in (canal.get("participantes") or [])
    if rol == "admin":
        return True
    if sesion.get("miembro_id"):
        # El equipo del cliente ve solo el chat privado de ese cliente: ni comunidad ni anuncios.
        return canal["tipo"] == "cliente" and canal["cliente_id"] == sesion["usuario_id"]
    if canal["tipo"] == "anuncios":
        return True
    if canal["tipo"] == "grupo":
        roles = canal.get("roles") or []
        if rol == "coach":
            return "equipo" in roles or canal.get("creado_por") == sesion["usuario_id"] or canal.get("id") in sesion.get("canales_coach", set())
        return cliente_ve(rol, roles)
    if rol == "coach":
        return canal["tipo"] == "cliente"
    return canal["tipo"] == "cliente" and canal["cliente_id"] == sesion["usuario_id"]


class _Salida:
    """La cola y la tarea que escribe en el socket de una pestaña."""

    def __init__(self, hub: "Hub", ws: WebSocket) -> None:
        self.cola: asyncio.Queue = asyncio.Queue(maxsize=COLA_MAX)
        self.loop = asyncio.get_running_loop()
        self.tarea = asyncio.create_task(self._escribir(hub, ws))

    def en_su_loop(self, fn, *args) -> None:
        """La cola no es segura entre hilos: si quien emite corre en otro loop, se le pasa al de la pestaña."""
        try:
            actual = asyncio.get_running_loop()
        except RuntimeError:
            actual = None
        if actual is self.loop:
            fn(*args)
        else:
            self.loop.call_soon_threadsafe(fn, *args)

    async def _escribir(self, hub: "Hub", ws: WebSocket) -> None:
        try:
            while True:
                evento = await self.cola.get()
                await asyncio.wait_for(ws.send_json(evento), timeout=ESPERA_ENVIO_S)
        except asyncio.CancelledError:
            pass
        except Exception:
            # Envío fallido o colgado: se descarta la pestaña; el navegador reconecta y recupera.
            hub.desconectar(ws, cerrar=True)


class Hub:
    def __init__(self) -> None:
        self._conexiones: dict[WebSocket, dict] = {}
        self._salidas: dict[WebSocket, _Salida] = {}

    def conectar(self, ws: WebSocket, sesion: dict) -> None:
        self._conexiones[ws] = sesion
        self._salidas[ws] = _Salida(self, ws)

    def desconectar(self, ws: WebSocket, cerrar: bool = False) -> None:
        self._conexiones.pop(ws, None)
        salida = self._salidas.pop(ws, None)
        if salida is None:
            return

        def _fin():
            if salida.tarea is not asyncio.current_task():
                salida.tarea.cancel()
            if cerrar:
                salida.loop.create_task(self._cerrar(ws))

        salida.en_su_loop(_fin)

    @staticmethod
    async def _cerrar(ws: WebSocket) -> None:
        try:
            await asyncio.wait_for(ws.close(code=CIERRE_LENTA), timeout=5)
        except Exception:
            pass

    def conectados(self) -> int:
        return len(self._conexiones)

    def clientes_conectados(self) -> set[int]:
        """Clientes con el classroom abierto ahora (a esos no se les manda aviso por mail)."""
        return {s["usuario_id"] for s in self._conexiones.values() if s.get("rol") not in ("admin", "coach")}

    def enviar(self, ws: WebSocket, evento: dict) -> None:
        """Encola un evento para una pestaña. Si no da abasto, se la corta (reconecta sola)."""
        salida = self._salidas.get(ws)
        if salida is None:
            return

        def _poner():
            try:
                salida.cola.put_nowait(evento)
            except asyncio.QueueFull:
                logger.warning("Pestaña sin leer con %s eventos pendientes: se corta para que reconecte", COLA_MAX)
                self.desconectar(ws, cerrar=True)

        salida.en_su_loop(_poner)

    def sumar_canal_a_coach(self, admin_id: int, canal_id: int) -> None:
        """Al etiquetar a un coach, ese canal pasa a ser visible para sus conexiones abiertas."""
        for sesion in self._conexiones.values():
            if sesion.get("rol") == "coach" and sesion.get("usuario_id") == admin_id:
                sesion.setdefault("canales_coach", set()).add(canal_id)

    async def emitir_a_equipo(self, admin_id: int, evento: dict) -> None:
        for ws, sesion in list(self._conexiones.items()):
            if sesion.get("rol") in ("admin", "coach") and sesion.get("usuario_id") == admin_id:
                self.enviar(ws, evento)

    async def emitir_a_todos(self, evento: dict) -> None:
        """Algo que cambia la lista para todos (por ejemplo, el orden de los canales)."""
        for ws in list(self._conexiones):
            self.enviar(ws, evento)

    async def emitir(self, evento: dict, canal: dict, excepto: WebSocket | None = None) -> None:
        for ws, sesion in list(self._conexiones.items()):
            if ws is not excepto and puede_ver(sesion, canal):
                # Cliente en pausa: ve la comunidad con candado, pero en vivo no le llega nada de ahí
                # (salvo que se le levante o ponga la pausa, para que la app se actualice).
                if sesion.get("pausa") and canal["tipo"] != "cliente" and evento.get("tipo") != "pausa":
                    continue
                self.enviar(ws, evento)


hub = Hub()
