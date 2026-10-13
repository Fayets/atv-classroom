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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_upload_dirs()
    init_db()
    tarea = asyncio.create_task(_aprender_siempre()) if _APRENDIZAJE and config("ANTHROPIC_API_KEY", default="") else None
    yield
    if tarea:
        tarea.cancel()


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
app.include_router(admin_router)
app.include_router(equipo_router)
app.include_router(cerebro_router)
app.include_router(clientes_router)
app.include_router(cuenta_router)
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
