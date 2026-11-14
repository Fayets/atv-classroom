from fastapi import APIRouter, Depends, Query
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from src.services import agentes_service as service
from src.services.agentes_service import agente_desde_request

# Para los agentes de IA del equipo (ver docs/agentes-api.md): lectura, y el modo del piloto con el permiso "piloto".
# Sin AGENTES_KEYS todo da 404.
router = APIRouter(prefix="/api/agentes", tags=["agentes"])


class Consulta(BaseModel):
    sql: str = Field(min_length=1, max_length=8000)


@router.post("/consulta")
def consulta(body: Consulta, agente: dict = Depends(agente_desde_request)):
    """SELECT sobre las vistas del cerebro y sobre toda la base como <esquema>__<tabla> (sin secretos; la plata
    solo con el permiso "plata"), con tope de filas."""
    return service.consulta(agente, body.sql)


@router.get("/tablas")
def tablas(agente: dict = Depends(agente_desde_request)):
    """Qué se puede consultar con esta clave: vistas, y por esquema cada tabla con sus columnas y lo excluido."""
    return service.catalogo_tablas(agente)


@router.get("/yo")
def yo(agente: dict = Depends(agente_desde_request)):
    """Quién es esta clave: la persona del equipo si es la de su ATV Leverage, o solo el nombre si es general."""
    return {"nombre": agente["nombre"], "persona": agente.get("persona"), "scopes": agente["scopes"]}


@router.post("/desconectar")
def desconectar(agente: dict = Depends(agente_desde_request)):
    """La persona desconecta su ATV Leverage: su clave deja de andar."""
    from src.services import leverage_service

    return leverage_service.desconectar(agente)


@router.get("/canales/pendientes")
def canales_pendientes(
    dias: int = Query(14, ge=1, le=365),
    para: str | None = Query(None, max_length=120),
    todos: bool = False,
    agente: dict = Depends(agente_desde_request),
):
    """Chats de clientes cuyo último mensaje es del cliente, el que más espera primero. Por defecto solo clientes
    activos y de los últimos 14 días; `para` (id, mail o nombre) deja los que lleva esa persona o donde la etiquetaron."""
    return service.canales_pendientes(agente, dias, para, todos)


@router.get("/canales/{canal_id}/mensajes")
def mensajes_canal(canal_id: int, limite: int = Query(50, ge=1, le=200), agente: dict = Depends(agente_desde_request)):
    return service.mensajes_canal(agente, canal_id, limite)


@router.get("/clientes/{cliente_id}/resumen")
def resumen_cliente(
    cliente_id: int,
    mensajes: int = Query(20, ge=0, le=200),
    llamadas: int = Query(5, ge=0, le=50),
    agente: dict = Depends(agente_desde_request),
):
    return service.resumen_cliente(agente, cliente_id, mensajes, llamadas)


@router.get("/llamadas")
def llamadas_coach(
    coach: int,
    despues_de: int = Query(0, ge=0),
    limite: int = Query(50, ge=1, le=200),
    transcripcion: bool = False,
    agente: dict = Depends(agente_desde_request),
):
    """Las llamadas de Fathom de una persona del equipo (resumen y puntos; la transcripción si se pide)."""
    return service.llamadas_de_coach(agente, coach, despues_de, limite, transcripcion)


@router.get("/piloto")
async def piloto_resumen(agente: dict = Depends(agente_desde_request)):
    """El modo del piloto de cada persona, lo que hizo hoy y lo que quedó para el equipo."""
    from src.services import piloto_service

    return await run_in_threadpool(piloto_service.resumen)


class ModoPiloto(BaseModel):
    modo: str | None = None
    bloqueados: list[str] | None = None


@router.put("/piloto/{admin_id}")
async def piloto_modo(admin_id: int, body: ModoPiloto, agente: dict = Depends(agente_desde_request)):
    from src.services import piloto_service

    service.puede_piloto(agente)
    return await run_in_threadpool(piloto_service.guardar_config, admin_id, body.modo, body.bloqueados, None)


@router.get("/piloto/borradores")
async def piloto_borradores(agente: dict = Depends(agente_desde_request)):
    """Los borradores del piloto que esperan que alguien los apruebe, con lo que escribió el cliente."""
    from src.services import piloto_service

    service.puede_piloto(agente)
    return {"borradores": await run_in_threadpool(piloto_service.borradores_pendientes)}


class EnvioBorrador(BaseModel):
    texto: str | None = Field(default=None, max_length=4000)


@router.post("/piloto/borradores/{borrador_id}/enviar")
async def piloto_enviar(borrador_id: int, body: EnvioBorrador, agente: dict = Depends(agente_desde_request)):
    """El dueño lo aprobó en Leverage: sale en el chat en nombre de quien lo lleva."""
    import asyncio

    from src.services import piloto_service, push_service
    from src.services.tiempo_real import hub

    service.puede_piloto(agente)
    mensaje, canal = await run_in_threadpool(piloto_service.enviar_por_agente, borrador_id, body.texto)
    await hub.emitir({"tipo": "mensaje", "mensaje": mensaje}, canal)
    await hub.emitir_equipo_del_canal({"tipo": "piloto", "canal_id": canal["id"]}, canal)
    asyncio.create_task(run_in_threadpool(push_service.avisar_mensaje, mensaje, canal["id"]))
    return {"ok": True, "mensaje_id": mensaje["id"], "canal_id": canal["id"]}


@router.post("/piloto/borradores/{borrador_id}/descartar")
async def piloto_descartar(borrador_id: int, agente: dict = Depends(agente_desde_request)):
    from src.services import piloto_service
    from src.services.tiempo_real import hub

    service.puede_piloto(agente)
    canal = await run_in_threadpool(piloto_service.descartar_por_agente, borrador_id)
    await hub.emitir_equipo_del_canal({"tipo": "piloto", "canal_id": canal["id"]}, canal)
    return {"ok": True}


@router.get("/voz")
def voz_persona(quien: str = Query(min_length=1, max_length=120), agente: dict = Depends(agente_desde_request)):
    """Cómo escribe alguien del equipo, aprendido por el Tab: rasgos, ejemplos reales, reglas y correcciones."""
    from src.services.voz_agentes import voz_de_persona

    return voz_de_persona(agente, quien)


class PedidoCuello(BaseModel):
    cliente: str = Field(min_length=1, max_length=200)
    loom: str | None = Field(default=None, max_length=500)
    texto: str | None = Field(default=None, max_length=8000)
    contexto: str | None = Field(default=None, max_length=500)
    pedido_por: str = Field(min_length=1, max_length=120)


@router.post("/cuellos")
async def pedir_cuello(body: PedidoCuello, agente: dict = Depends(agente_desde_request)):
    """Pide el diagnóstico de cuello de botella de un cliente (Loom o texto). Juan lo aprueba en el classroom."""
    from src.services import cuellos_agentes

    service.puede_piloto(agente)
    return await run_in_threadpool(cuellos_agentes.pedir, agente, body.cliente, body.loom, body.texto, body.contexto, body.pedido_por)


@router.get("/cuellos/{diag_id}")
async def ver_cuello(diag_id: int, agente: dict = Depends(agente_desde_request)):
    from src.services import cuellos_agentes

    return await run_in_threadpool(cuellos_agentes.ver, agente, diag_id)
