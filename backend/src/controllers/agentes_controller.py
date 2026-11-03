from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from src.services import agentes_service as service
from src.services.agentes_service import agente_desde_request

# Solo lectura para los agentes de IA del equipo (ver docs/agentes-api.md). Sin AGENTES_KEYS todo da 404.
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


@router.get("/canales/pendientes")
def canales_pendientes(agente: dict = Depends(agente_desde_request)):
    """Chats de clientes cuyo último mensaje es del cliente: el que más espera primero."""
    return service.canales_pendientes(agente)


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
