from contextlib import asynccontextmanager

from decouple import config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from src.controllers.admin_controller import router as admin_router
from src.controllers.auth_controller import router as auth_router
from src.controllers.chat_controller import router as chat_router
from src.controllers.clase_controller import router as clase_router
from src.controllers.frente_controller import router as frente_router
from src.controllers.programa_controller import router as programa_router
from src.db import init_db
from src.schemas import HealthResponse
from src.storage.recursos import UPLOADS_DIR, ensure_upload_dirs

CORS_ORIGINS = config(
    "CORS_ORIGINS",
    default="http://localhost:5173",
    cast=lambda v: [origin.strip() for origin in v.split(",") if origin.strip()],
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_upload_dirs()
    init_db()
    yield


app = FastAPI(title="ATV Classroom API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(programa_router)
app.include_router(clase_router)
app.include_router(frente_router)
app.include_router(chat_router)

ensure_upload_dirs()
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse()
