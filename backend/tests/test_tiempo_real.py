"""Reparto en vivo: una pestaña colgada no puede frenar a las demás."""

import asyncio

from src.services import tiempo_real as tr


class _WsLento:
    """Simula un celular sin señal: el envío nunca termina."""

    def __init__(self):
        self.cerrado = None

    async def send_json(self, _evento):
        await asyncio.sleep(3600)

    async def close(self, code=1000):
        self.cerrado = code


class _WsRapido:
    def __init__(self):
        self.recibidos = []

    async def send_json(self, evento):
        self.recibidos.append(evento)

    async def close(self, code=1000):
        pass


def test_una_pestana_colgada_no_frena_a_las_demas(monkeypatch):
    async def escenario():
        hub = tr.Hub()
        lento, rapido = _WsLento(), _WsRapido()
        admin = {"rol": "admin", "usuario_id": 1}
        hub.conectar(lento, dict(admin))
        hub.conectar(rapido, dict(admin))
        canal = {"id": 9, "tipo": "cliente", "cliente_id": 5}
        inicio = asyncio.get_running_loop().time()
        for i in range(50):
            await hub.emitir({"tipo": "mensaje", "n": i}, canal)
        assert asyncio.get_running_loop().time() - inicio < 0.1  # emitir no espera a nadie
        await asyncio.sleep(0.05)
        assert len(rapido.recibidos) == 50

    asyncio.run(escenario())


def test_la_pestana_que_no_lee_se_corta_para_que_reconecte(monkeypatch):
    monkeypatch.setattr(tr, "COLA_MAX", 5)

    async def escenario():
        hub = tr.Hub()
        lento = _WsLento()
        hub.conectar(lento, {"rol": "admin", "usuario_id": 1})
        canal = {"id": 9, "tipo": "cliente", "cliente_id": 5}
        for i in range(20):
            await hub.emitir({"tipo": "mensaje", "n": i}, canal)
        await asyncio.sleep(0.05)
        assert hub.conectados() == 0
        assert lento.cerrado == tr.CIERRE_LENTA

    asyncio.run(escenario())


def test_un_cliente_no_recibe_lo_de_otro():
    async def escenario():
        hub = tr.Hub()
        a, b = _WsRapido(), _WsRapido()
        hub.conectar(a, {"rol": "boost", "usuario_id": 1})
        hub.conectar(b, {"rol": "boost", "usuario_id": 2})
        await hub.emitir({"tipo": "mensaje"}, {"id": 3, "tipo": "cliente", "cliente_id": 1})
        await asyncio.sleep(0.02)
        assert len(a.recibidos) == 1 and b.recibidos == []

    asyncio.run(escenario())
