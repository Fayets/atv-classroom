import asyncio
import logging
from contextlib import asynccontextmanager

from decouple import config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from src.controllers.admin_controller import router as admin_router
from src.controllers.auth_controller import router as auth_router
from src.controllers.cerebro_controller import router as cerebro_router
from src.controllers.clientes_controller import router as clientes_router
from src.controllers.cuenta_controller import router as cuenta_router
from src.controllers.acciones_controller import router as acciones_router
from src.controllers.equipo_cliente_controller import router as equipo_cliente_router
from src.controllers.roadmap_controller import router as roadmap_router
from src.controllers.alta_controller import router as alta_router
from src.controllers.onboardings_controller import router as onboardings_router
from src.controllers.contratos_controller import router as contratos_router
from src.controllers.llamadas_controller import router as llamadas_router
from src.controllers.live_sessions_controller import router as live_sessions_router
from src.controllers.sops_controller import router as sops_router
from src.controllers.push_controller import router as push_router
from src.controllers.consultas_controller import router as consultas_router
from src.controllers.biblioteca_controller import router as biblioteca_router
from src.controllers.contexto_controller import router as contexto_router
from src.controllers.errores_controller import router as errores_router
from src.controllers.fathom_webhook_controller import router as fathom_webhook_router
from src.controllers.chat_controller import router as chat_router
from src.controllers.clase_controller import router as clase_router
from src.controllers.equipo_controller import router as equipo_router
from src.controllers.frente_controller import router as frente_router
from src.controllers.mensajeria_controller import router as mensajes_router
from src.controllers.mensajeria_controller import ws_router as mensajes_ws_router
from src.controllers.programa_controller import router as programa_router
from src.controllers.sugerencias_controller import router as sugerencias_router
from src.db import init_db
from src.schemas import HealthResponse
from src.storage.recursos import UPLOADS_DIR, ensure_upload_dirs

CORS_ORIGINS = config(
    "CORS_ORIGINS",
    default="http://localhost:5173",
    cast=lambda v: [origin.strip() for origin in v.split(",") if origin.strip()],
)


# El cerebro aprende solo: cada APRENDIZAJE_CADA_MIN minutos procesa los mensajes nuevos.
# En local va APRENDIZAJE=0 en el .env para no gastar ni pisarse con producción.
_APRENDIZAJE = config("APRENDIZAJE", default=True, cast=bool)
_CADA_MIN = config("APRENDIZAJE_CADA_MIN", default=10, cast=int)


async def _aprender_siempre():
    from starlette.concurrency import run_in_threadpool

    from src.services.aprendizaje_service import ciclo

    await asyncio.sleep(60)
    while True:
        try:
            r = await run_in_threadpool(ciclo)
            hechos = sum(c.get("hechos", 0) for c in r["canales"])
            if r["canales"]:
                logging.getLogger("aprendizaje").info("Cerebro: %s canales, %s hechos nuevos", len(r["canales"]), hechos)
        except Exception:
            logging.getLogger("aprendizaje").exception("Cerebro: falló el ciclo de aprendizaje")
        await asyncio.sleep(_CADA_MIN * 60)


# Las llamadas de Fathom de cada coach conectado entran solas cada FATHOM_CADA_MIN minutos.
_FATHOM = config("FATHOM_SYNC", default=True, cast=bool)
_FATHOM_CADA_MIN = config("FATHOM_CADA_MIN", default=15, cast=int)
# De noche no hay llamadas nuevas: no se despierta la base (Neon cobra las horas encendida). Hora de
# Argentina; la primera vuelta de la mañana trae lo de la noche (mira desde la última sincronización).
_FATHOM_DESDE = config("FATHOM_DESDE_HORA", default=8, cast=int)
_FATHOM_HASTA = config("FATHOM_HASTA_HORA", default=23, cast=int)


def _hora_de_trabajo(desde: int, hasta: int) -> bool:
    from datetime import datetime, timedelta, timezone

    hora = datetime.now(timezone(timedelta(hours=-3))).hour
    return desde <= hora < hasta


async def _activar_webhooks_fathom():
    """Las cuentas que se conectaron antes del webhook lo reciben solas al arrancar (sin reconectar),
    aunque la revisión periódica esté apagada."""
    from starlette.concurrency import run_in_threadpool

    from src.services.fathom_service import activar_webhooks_pendientes

    await asyncio.sleep(20)
    try:
        n = await run_in_threadpool(activar_webhooks_pendientes)
        if n:
            logging.getLogger("fathom").info("Fathom: %s webhooks activados", n)
    except Exception:
        logging.getLogger("fathom").exception("Fathom: no se pudieron activar los webhooks")


async def _traer_llamadas_siempre():
    from starlette.concurrency import run_in_threadpool

    from datetime import date

    from src.services.fathom_service import ciclo, sin_webhook

    await asyncio.sleep(90)
    revisada = None
    faltan = True  # hay coaches sin webhook: se sabe en cada revisión completa
    while True:
        # Con webhook, Fathom avisa solo: no se busca cada 15 minutos. Se busca así únicamente para quien
        # no lo tenga activo, y una vez por día para todos, por si algún aviso se perdió.
        if _hora_de_trabajo(_FATHOM_DESDE, _FATHOM_HASTA):
            try:
                completa = revisada != date.today()
                nuevas = 0
                if completa or faltan:  # si todos tienen webhook, la base no se toca hasta mañana
                    nuevas = await run_in_threadpool(ciclo, not completa)
                if completa:
                    revisada = date.today()
                    faltan = await run_in_threadpool(sin_webhook) > 0
                if nuevas:
                    logging.getLogger("fathom").info("Fathom: %s llamadas nuevas", nuevas)
            except Exception:
                logging.getLogger("fathom").exception("Fathom: falló la sincronización")
        await asyncio.sleep(_FATHOM_CADA_MIN * 60)


# Mails al cliente cuando tiene mensajes del equipo sin leer (solo con AVISOS_MAIL=1 y SMTP cargado).
_AVISOS_CADA_MIN = config("AVISOS_CADA_MIN", default=5, cast=int)


async def _avisar_siempre():
    from starlette.concurrency import run_in_threadpool

    from src.services import avisos_service
    from src.services.tiempo_real import hub

    await asyncio.sleep(120)
    while True:
        try:
            n = await run_in_threadpool(avisos_service.ciclo, hub.clientes_conectados())
            if n:
                logging.getLogger("avisos").info("Avisos: %s mails a clientes con mensajes sin leer", n)
        except Exception:
            logging.getLogger("avisos").exception("Avisos: falló el ciclo")
        await asyncio.sleep(_AVISOS_CADA_MIN * 60)


# Notificaciones a los admins de clientes que esperan respuesta (solo con PUSH=1).
async def _alertas_de_espera():
    from starlette.concurrency import run_in_threadpool

    from src.services import push_service

    await asyncio.sleep(180)
    while True:
        try:
            n = await run_in_threadpool(push_service.ciclo_espera)
            if n:
                logging.getLogger("push").info("Push: %s avisos de clientes esperando respuesta", n)
        except Exception:
            logging.getLogger("push").exception("Push: falló el ciclo de espera")
        await asyncio.sleep(600)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_upload_dirs()
    init_db()
    from src.services.cerebro_service import precalentar

    precalentar()
    tarea = asyncio.create_task(_aprender_siempre()) if _APRENDIZAJE and config("ANTHROPIC_API_KEY", default="") else None
    fathom = asyncio.create_task(_traer_llamadas_siempre()) if _FATHOM else None
    webhooks = asyncio.create_task(_activar_webhooks_fathom())
    from src.services import avisos_service

    avisos = asyncio.create_task(_avisar_siempre()) if avisos_service.activo() else None
    from src.services import push_service

    espera = asyncio.create_task(_alertas_de_espera()) if push_service.activo() else None
    yield
    for t in (tarea, fathom, avisos, webhooks, espera):
        if t:
            t.cancel()


# La documentación automática lista todos los endpoints: solo se prende en local con DOCS=1.
_DOCS = config("DOCS", default=False, cast=bool)
app = FastAPI(
    title="ATV Classroom API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if _DOCS else None,
    redoc_url="/redoc" if _DOCS else None,
    openapi_url="/openapi.json" if _DOCS else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(errores_router)
app.include_router(admin_router)
app.include_router(equipo_router)
app.include_router(cerebro_router)
app.include_router(clientes_router)
app.include_router(cuenta_router)
app.include_router(acciones_router)
app.include_router(equipo_cliente_router)
app.include_router(roadmap_router)
app.include_router(alta_router)
app.include_router(onboardings_router)
app.include_router(contratos_router)
app.include_router(llamadas_router)
app.include_router(live_sessions_router)
app.include_router(sops_router)
app.include_router(push_router)
app.include_router(consultas_router)
app.include_router(biblioteca_router)
app.include_router(contexto_router)
app.include_router(fathom_webhook_router)
app.include_router(sugerencias_router)
app.include_router(programa_router)
app.include_router(clase_router)
app.include_router(frente_router)
app.include_router(chat_router)
app.include_router(mensajes_router)
app.include_router(mensajes_ws_router)

ensure_upload_dirs()
# En producción solo /api llega al backend: los PDF se sirven por /api/uploads (y /uploads para links viejos).
app.mount("/api/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads_api")
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse()


# Lo consulta el front para saber si el servidor volvió (en producción solo /api llega al backend).
@app.get("/api/salud", response_model=HealthResponse)
def salud():
    return HealthResponse()
