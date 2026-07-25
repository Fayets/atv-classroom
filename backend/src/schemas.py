from pydantic import BaseModel, EmailStr, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "atv-classroom"


class LoginRequest(BaseModel):
    email: EmailStr
    contrasena: str = Field(min_length=1)


class LoginResponse(BaseModel):
    token: str
    usuario_id: int
    nombre: str
    email: EmailStr
    rol: str
    dias_restantes: int | None = None


class SessionProfileResponse(BaseModel):
    usuario_id: int
    nombre: str
    email: EmailStr
    rol: str
    dias_restantes: int | None = None
    fecha_vencimiento: str | None = None


class ProgramaListItem(BaseModel):
    id: int
    titulo: str
    slug: str | None = None
    descripcion: str | None = None
    cover_url: str | None = None
    porcentaje_progreso: int = 0


class ClaseListItem(BaseModel):
    id: int
    titulo: str
    orden: int
    video_url: str | None = None
    duracion_segundos: int | None = None
    completado: bool = False


class SeccionDetalleResponse(BaseModel):
    id: int
    titulo: str
    orden: int
    clases: list[ClaseListItem]


class ProgramaDetalleResponse(BaseModel):
    id: int
    titulo: str
    slug: str | None = None
    descripcion: str | None = None
    cover_url: str | None = None
    orden: int
    porcentaje_progreso: int = 0
    secciones: list[SeccionDetalleResponse]


class ClaseDetalleResponse(BaseModel):
    id: int
    titulo: str
    orden: int
    video_url: str | None = None
    duracion_segundos: int | None = None
    descripcion: str | None = None
    recursos: list["ClaseRecursoItem"] = []
    seccion_id: int
    programa_id: int
    completado: bool = False
    completado_en: str | None = None
    nota: str | None = None


class ClaseRecursoItem(BaseModel):
    id: int | None = None
    titulo: str
    url: str
    orden: int = 0
    tipo: str = "link"


class ProgresoRequest(BaseModel):
    completado: bool


class ProgresoResponse(BaseModel):
    clase_id: int
    completado: bool
    completado_en: str | None = None


class NotaRequest(BaseModel):
    texto: str = Field(min_length=1)


class NotaResponse(BaseModel):
    clase_id: int
    contenido: str
    creado_en: str


class ChatRequest(BaseModel):
    pregunta: str


class FuenteItem(BaseModel):
    modulo: str
    clase: str


class ChatResponse(BaseModel):
    respuesta: str
    fuentes: list[FuenteItem]


# --- Admin CRUD ---


class ProgramaAdminBase(BaseModel):
    titulo: str = Field(min_length=1)
    slug: str | None = None
    descripcion: str | None = None
    orden: int = 0
    cover_url: str | None = None


class ProgramaAdminCreate(ProgramaAdminBase):
    pass


class ProgramaAdminUpdate(BaseModel):
    titulo: str | None = Field(default=None, min_length=1)
    slug: str | None = None
    descripcion: str | None = None
    orden: int | None = None
    cover_url: str | None = None


class ClaseAdminItem(BaseModel):
    id: int
    titulo: str
    orden: int
    video_url: str | None = None
    duracion_segundos: int | None = None
    descripcion: str | None = None
    recursos: list[ClaseRecursoItem] = []


class SeccionAdminItem(BaseModel):
    id: int
    titulo: str
    orden: int
    clases: list[ClaseAdminItem]


class ProgramaAdminListItem(BaseModel):
    id: int
    titulo: str
    slug: str | None = None
    descripcion: str | None = None
    orden: int
    cover_url: str | None = None
    total_secciones: int = 0
    total_clases: int = 0


class ProgramaAdminDetalle(BaseModel):
    id: int
    titulo: str
    slug: str | None = None
    descripcion: str | None = None
    orden: int
    cover_url: str | None = None
    secciones: list[SeccionAdminItem]


class SeccionAdminCreate(BaseModel):
    titulo: str = Field(min_length=1)
    orden: int = 0


class SeccionAdminUpdate(BaseModel):
    titulo: str | None = Field(default=None, min_length=1)
    orden: int | None = None


class ClaseAdminCreate(BaseModel):
    titulo: str = Field(min_length=1)
    orden: int = 0
    video_url: str | None = None
    duracion_segundos: int | None = None
    descripcion: str | None = None
    recursos: list[ClaseRecursoItem] = []


class ClaseAdminUpdate(BaseModel):
    titulo: str | None = Field(default=None, min_length=1)
    orden: int | None = None
    video_url: str | None = None
    duracion_segundos: int | None = None
    descripcion: str | None = None
    recursos: list[ClaseRecursoItem] | None = None
