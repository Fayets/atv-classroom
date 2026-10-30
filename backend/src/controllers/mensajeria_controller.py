import asyncio
import json

from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from src.services.auth_service import obtener_sesion_desde_request, sesion_desde_token
from pony.orm import db_session

from src.services.roles_canal import ROLES
from src.services.mensajeria_service import (
    MAX_TEXTO,
    MensajeriaServices,
    canales_de_coach,
    equipo_para_mencionar,
    habilitada_para,
)
from src.services import push_service
from src.services.vista_previa_service import VistaPreviaServices
from src.services.tiempo_real import hub
from src.storage import adjuntos as almacen

router = APIRouter(prefix="/api/mensajes", tags=["mensajes"])
_avisos_en_curso: set = set()
ws_router = APIRouter(tags=["mensajes"])
service = MensajeriaServices()
vista_previa = VistaPreviaServices()


def sesion_mensajes(sesion: dict = Depends(obtener_sesion_desde_request)) -> dict:
    if not habilitada_para(sesion):
        raise HTTPException(status_code=403, detail="La mensajería todavía no está disponible.")
    return sesion


class MensajeNuevo(BaseModel):
    texto: str = Field(default="", max_length=MAX_TEXTO)
    respuesta_a: int | None = None
    menciones: list[int] = Field(default_factory=list, max_length=20)
    adjuntos: list[int] = Field(default_factory=list, max_length=10)


class MensajeEdicion(BaseModel):
    texto: str = Field(min_length=1, max_length=MAX_TEXTO)


class ReaccionCuerpo(BaseModel):
    emoji: str = Field(min_length=1, max_length=16)


class Leido(BaseModel):
    ultimo_id: int = Field(ge=0)


class CanalNuevo(BaseModel):
    nombre: str = Field(min_length=1, max_length=60)
    descripcion: str | None = Field(default=None, max_length=300)
    roles: list[str] = Field(default_factory=list, max_length=10)
    tipo: str = "grupo"  # "anuncios" solo lo crea un admin


@router.get("/habilitada")
def habilitada(sesion: dict = Depends(obtener_sesion_desde_request)):
    """Si este usuario ya ve la mensajería (equipo, lanzamiento o mail de prueba)."""
    return {"habilitada": habilitada_para(sesion)}


@router.get("/canales")
def canales(sesion: dict = Depends(sesion_mensajes)):
    return service.listar_canales(sesion)


@router.get("/roles")
def roles(_sesion: dict = Depends(sesion_mensajes)):
    """Los roles que puede ver un canal grupal (para el formulario de crear canal)."""
    return [{"id": r["id"], "nombre": r["nombre"]} for r in ROLES]


class Directo(BaseModel):
    admin_id: int


@router.post("/directos")
def abrir_directo(body: Directo, sesion: dict = Depends(sesion_mensajes)):
    """El mensaje directo con otra persona del equipo (se crea la primera vez)."""
    return service.abrir_directo(sesion, body.admin_id)


@router.get("/vista-previa")
def vista_previa_fathom(url: str, _sesion: dict = Depends(sesion_mensajes)):
    """Título, participantes y portada de un link de Fathom, para mostrarlo como tarjeta."""
    return vista_previa.fathom(url)


@router.get("/buscar-clientes")
def buscar_clientes(q: str = "", sesion: dict = Depends(sesion_mensajes)):
    """Clientes de la comunidad por nombre, para escribirles por privado (desde 3 letras, hasta 5)."""
    return service.buscar_clientes(sesion, q)


class Privado(BaseModel):
    cliente_id: int


@router.post("/dm")
def abrir_dm(body: Privado, sesion: dict = Depends(sesion_mensajes)):
    """Mensaje privado de alguien del equipo con un cliente (se crea la primera vez). Solo lo ven ellos dos."""
    return service.abrir_dm(sesion, body.cliente_id)


@router.post("/privados")
def abrir_privado(body: Privado, sesion: dict = Depends(sesion_mensajes)):
    """El chat privado con otro cliente (se crea la primera vez). Solo lo ven ellos dos."""
    return service.abrir_privado(sesion, body.cliente_id)


@router.post("/canales", status_code=201)
async def crear_canal(body: CanalNuevo, sesion: dict = Depends(sesion_mensajes)):
    if body.tipo == "anuncios":
        if sesion.get("rol") != "admin":
            raise HTTPException(status_code=403, detail="Solo un admin crea canales de anuncios.")
        return await run_in_threadpool(service.crear_canal_anuncios, body.nombre, body.descripcion)
    canal = await run_in_threadpool(service.crear_canal_grupo, sesion, body.nombre, body.descripcion, body.roles)
    # Quien lo ve lo tiene en su lista al instante.
    await hub.emitir({"tipo": "canal", "canal_id": canal["id"]}, canal.pop("info"))
    return canal


@router.get("/no-leidos")
def no_leidos(sesion: dict = Depends(sesion_mensajes)):
    return service.no_leidos(sesion)


@router.get("/canales/{canal_id}/mensajes")
def mensajes(
    canal_id: int,
    antes_de: int | None = None,
    despues_de: int | None = None,
    sesion: dict = Depends(sesion_mensajes),
):
    return service.mensajes(sesion, canal_id, antes_de=antes_de, despues_de=despues_de)


@router.get("/canales/{canal_id}/texto")
def texto_completo(canal_id: int, sesion: dict = Depends(sesion_mensajes)):
    return service.texto_completo(sesion, canal_id)


class CanalEdicion(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=60)
    descripcion: str | None = Field(default=None, max_length=300)
    roles: list[str] | None = Field(default=None, max_length=10)


@router.patch("/canales/{canal_id}")
async def editar_canal(canal_id: int, body: CanalEdicion, sesion: dict = Depends(sesion_mensajes)):
    canal, antes, despues = await run_in_threadpool(service.editar_canal, sesion, canal_id, body.nombre, body.descripcion, body.roles)
    # Avisa a quien lo veía y a quien lo ve ahora: la lista se rearma sola en los dos casos.
    await hub.emitir({"tipo": "canal", "canal_id": canal_id}, antes)
    await hub.emitir({"tipo": "canal", "canal_id": canal_id}, despues)
    return canal


class CanalInactivo(BaseModel):
    inactivo: bool


class CanalPausa(BaseModel):
    pausa: bool


class OrdenCanales(BaseModel):
    ids: list[int] = Field(max_length=200)


@router.put("/canales-orden")
async def ordenar_canales(body: OrdenCanales, sesion: dict = Depends(sesion_mensajes)):
    """El nuevo orden de los canales (solo admins). Todos lo ven al instante."""
    await run_in_threadpool(service.ordenar_canales, sesion, body.ids)
    await hub.emitir_a_todos({"tipo": "canal"})
    return {"ok": True}


@router.put("/canales/{canal_id}/inactivo")
async def marcar_inactivo(canal_id: int, body: CanalInactivo, sesion: dict = Depends(sesion_mensajes)):
    info = await run_in_threadpool(service.marcar_inactivo, sesion, canal_id, body.inactivo)
    # El equipo ve moverse el chat y el cliente, si está adentro, ve el cartel (o se le levanta) al instante.
    await hub.emitir({"tipo": "canal", "canal_id": canal_id}, info)
    await hub.emitir({"tipo": "pausa", "canal_id": canal_id, "pausa": body.inactivo}, info)
    return {"ok": True, "inactivo": body.inactivo}


class CanalVencido(BaseModel):
    vencido: bool


@router.put("/canales/{canal_id}/vencido")
async def marcar_vencido(canal_id: int, body: CanalVencido, sesion: dict = Depends(sesion_mensajes)):
    info = await run_in_threadpool(service.marcar_vencido, sesion, canal_id, body.vencido)
    await hub.emitir({"tipo": "canal", "canal_id": canal_id}, info)
    return {"ok": True, "vencido": body.vencido}


@router.put("/canales/{canal_id}/pausa")
async def marcar_pausa(canal_id: int, body: CanalPausa, sesion: dict = Depends(sesion_mensajes)):
    info = await run_in_threadpool(service.marcar_pausa, sesion, canal_id, body.pausa)
    # El equipo ve moverse el chat y el cliente, si está adentro, ve el cartel (o se le levanta) al instante.
    await hub.emitir({"tipo": "canal", "canal_id": canal_id}, info)
    await hub.emitir({"tipo": "pausa", "canal_id": canal_id, "pausa": body.pausa}, info)
    return {"ok": True, "pausa": body.pausa}


@router.delete("/canales/{canal_id}")
async def borrar_canal(canal_id: int, sesion: dict = Depends(sesion_mensajes)):
    r = await run_in_threadpool(service.borrar_canal, sesion, canal_id)
    await hub.emitir({"tipo": "canal", "canal_id": canal_id, "borrado": True}, r["info"])
    return {"ok": True, "mensajes": r["mensajes"]}


@router.get("/canales/{canal_id}/participantes")
def participantes(canal_id: int, sesion: dict = Depends(sesion_mensajes)):
    """Quiénes del lado del cliente están en este chat (el titular y su equipo), para poder @etiquetarlos."""
    return service.participantes(sesion, canal_id)


@router.get("/equipo")
def equipo(_sesion: dict = Depends(sesion_mensajes)):
    """Para el autocompletado de @."""
    with db_session:
        return equipo_para_mencionar()


@router.get("/menciones")
def menciones(sesion: dict = Depends(sesion_mensajes)):
    if sesion.get("rol") not in ("admin", "coach"):
        raise HTTPException(status_code=403, detail="Solo para el equipo.")
    return service.menciones(sesion)


@router.post("/menciones/{mencion_id}/resolver")
def resolver(mencion_id: int, sesion: dict = Depends(sesion_mensajes)):
    return service.resolver_mencion(sesion, mencion_id)


@router.post("/canales/{canal_id}/mensajes", status_code=201)
async def enviar(canal_id: int, body: MensajeNuevo, sesion: dict = Depends(sesion_mensajes)):
    mensaje, canal = await run_in_threadpool(
        service.enviar, sesion, canal_id, body.texto, body.respuesta_a, body.menciones, body.adjuntos
    )
    # Primero se habilita el canal a los coaches etiquetados, así también les llega el mensaje.
    for admin_id in mensaje.get("menciones", []):
        hub.sumar_canal_a_coach(admin_id, canal["id"])
    await hub.emitir({"tipo": "mensaje", "mensaje": mensaje}, canal)
    for admin_id in mensaje.get("menciones", []):
        await hub.emitir_a_equipo(admin_id, {"tipo": "mencion", "canal_id": canal["id"], "mensaje": mensaje})
    # La notificación al celular sale aparte: el que escribe no espera a que se manden.
    tarea = asyncio.create_task(run_in_threadpool(push_service.avisar_mensaje, mensaje, canal["id"]))
    _avisos_en_curso.add(tarea)
    tarea.add_done_callback(_avisos_en_curso.discard)
    return mensaje


@router.post("/canales/{canal_id}/adjuntos", status_code=201)
def subir_adjunto(canal_id: int, archivo: UploadFile = File(...), sesion: dict = Depends(sesion_mensajes)):
    def partes():
        while True:
            bloque = archivo.file.read(1024 * 1024)
            if not bloque:
                break
            yield bloque

    return service.subir_adjunto(sesion, canal_id, archivo.filename or "archivo", partes())


@router.get("/adjuntos/{adjunto_id}")
def bajar_adjunto(adjunto_id: int, f: str = ""):
    """Sin sesión a propósito: <img> y <audio> no mandan el token. Lo protege el link firmado (24 h)."""
    ruta, nombre, tipo = service.archivo_adjunto(adjunto_id, f)
    en_linea = tipo.startswith(almacen.EN_LINEA)
    disposicion = "inline" if en_linea else "attachment"
    ascii_nombre = nombre.encode("ascii", "ignore").decode() or "archivo"
    headers = {
        "Content-Disposition": f"{disposicion}; filename=\"{ascii_nombre}\"; filename*=UTF-8''{quote(nombre)}",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=86400",
    }
    if tipo != "application/pdf":
        # Nada de scripts al abrir el archivo (el visor de PDF del navegador queda afuera de esto).
        headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'"
    return FileResponse(ruta, media_type=tipo, headers=headers)


@router.patch("/{mensaje_id}")
async def editar(mensaje_id: int, body: MensajeEdicion, sesion: dict = Depends(sesion_mensajes)):
    mensaje, canal = await run_in_threadpool(service.editar, sesion, mensaje_id, body.texto)
    await hub.emitir({"tipo": "editado", "mensaje": mensaje}, canal)
    return mensaje


@router.put("/{mensaje_id}/reacciones")
async def reaccionar(mensaje_id: int, body: ReaccionCuerpo, sesion: dict = Depends(sesion_mensajes)):
    evento, canal = await run_in_threadpool(service.reaccionar, sesion, mensaje_id, body.emoji)
    await hub.emitir({"tipo": "reacciones", **evento}, canal)
    return evento


@router.get("/{mensaje_id}/vistos")
async def vistos(mensaje_id: int, sesion: dict = Depends(sesion_mensajes)):
    return await run_in_threadpool(service.vistos, sesion, mensaje_id)


@router.delete("/{mensaje_id}")
async def borrar(mensaje_id: int, sesion: dict = Depends(sesion_mensajes)):
    mensaje, canal = await run_in_threadpool(service.borrar, sesion, mensaje_id)
    await hub.emitir({"tipo": "borrado", "mensaje": mensaje}, canal)
    return mensaje


@router.post("/canales/{canal_id}/leido")
async def leido(canal_id: int, body: Leido, sesion: dict = Depends(sesion_mensajes)):
    evento, canal = await run_in_threadpool(service.marcar_leido, sesion, canal_id, body.ultimo_id)
    # El "visto" solo existe en los chats de a dos; en un grupo, avisar cada lectura a todos
    # los que lo ven era una tormenta de eventos (cada uno recargaba su bandeja).
    if canal["tipo"] in ("cliente", "directo", "dm"):
        await hub.emitir({"tipo": "leido", **evento}, canal)
    return evento


@ws_router.websocket("/api/ws")
async def tiempo_real(websocket: WebSocket):
    """El token viaja en el primer mensaje, no en la URL, para que no quede en los logs del proxy."""
    await websocket.accept()
    try:
        primero = await asyncio.wait_for(websocket.receive_json(), timeout=10)
    except Exception:
        await websocket.close(code=4401)
        return
    token = primero.get("token") if isinstance(primero, dict) and primero.get("tipo") == "auth" else None
    sesion = await run_in_threadpool(sesion_desde_token, token) if token else None
    if sesion is None:
        await websocket.send_json({"tipo": "error", "detalle": "sesion"})
        await websocket.close(code=4401)
        return
    if not habilitada_para(sesion):
        await websocket.send_json({"tipo": "error", "detalle": "deshabilitada"})
        await websocket.close(code=4403)
        return

    if sesion.get("rol") == "coach":
        def _cargar():
            with db_session:
                return canales_de_coach(sesion["usuario_id"])

        sesion["canales_coach"] = await run_in_threadpool(_cargar)
    hub.conectar(websocket, sesion)
    await websocket.send_json({"tipo": "listo"})
    try:
        while True:
            crudo = await websocket.receive_text()
            try:
                evento = json.loads(crudo)
            except ValueError:
                continue
            if not isinstance(evento, dict):
                continue
            tipo = evento.get("tipo")
            if tipo == "ping":
                # Cada ping revalida la sesión: una baja o un vencimiento cortan la conexión.
                if await run_in_threadpool(sesion_desde_token, token) is None:
                    await websocket.close(code=4401)
                    break
                hub.enviar(websocket, {"tipo": "pong"})
            elif tipo == "escribiendo":
                try:
                    canal_id = int(evento.get("canal_id"))
                except (TypeError, ValueError):
                    continue
                canal = await run_in_threadpool(service.canal_visible_info, sesion, canal_id)
                if canal is not None:
                    await hub.emitir(
                        {
                            "tipo": "escribiendo",
                            "canal_id": canal_id,
                            "nombre": sesion["nombre"],
                            "activo": evento.get("activo") is not False,
                        },
                        canal,
                        excepto=websocket,
                    )
    except WebSocketDisconnect:
        pass
    finally:
        hub.desconectar(websocket)
