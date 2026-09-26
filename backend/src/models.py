from datetime import date, datetime

from pony.orm import Optional, PrimaryKey, Required, Set, composite_key

from src.db import DB_SCHEMA, db


class Admin(db.Entity):
    _table_ = (DB_SCHEMA, "admins")

    id = PrimaryKey(int, auto=True)
    email = Required(str, unique=True)
    nombre = Optional(str)
    password_hash = Required(str)
    activo = Required(bool, default=True)
    creado_en = Required(datetime, default=datetime.utcnow)


class ClienteExterno(db.Entity):
    _table_ = ("clients", "clientes")

    id = PrimaryKey(int, auto=True)
    nombre = Optional(str)
    email = Required(str, unique=True)
    emails_json = Optional(str, nullable=True)
    canal_discord = Optional(str, nullable=True)
    responsable = Optional(str, nullable=True)
    password_hash = Optional(str)
    plan_actual = Optional(str)
    estado_cliente = Optional(str)
    fecha_vencimiento = Optional(date)


class Programa(db.Entity):
    _table_ = (DB_SCHEMA, "programa")

    id = PrimaryKey(int, auto=True)
    titulo = Required(str)
    slug = Optional(str, unique=True)
    descripcion = Optional(str)
    orden = Required(int, default=0)
    cover_url = Optional(str)

    secciones = Set("Seccion")


class Seccion(db.Entity):
    _table_ = (DB_SCHEMA, "seccion")

    id = PrimaryKey(int, auto=True)
    programa = Required("Programa")
    titulo = Required(str)
    orden = Required(int, default=0)

    clases = Set("Clase")


class Clase(db.Entity):
    _table_ = (DB_SCHEMA, "clase")

    id = PrimaryKey(int, auto=True)
    seccion = Required("Seccion")
    titulo = Required(str)
    orden = Required(int, default=0)
    video_url = Optional(str)
    duracion_segundos = Optional(int)
    descripcion = Optional(str)

    recursos = Set("ClaseRecurso")


class ClaseRecurso(db.Entity):
    _table_ = (DB_SCHEMA, "clase_recurso")

    id = PrimaryKey(int, auto=True)
    clase = Required("Clase")
    titulo = Required(str)
    url = Required(str)
    orden = Required(int, default=0)


class Progreso(db.Entity):
    _table_ = (DB_SCHEMA, "progreso")

    id = PrimaryKey(int, auto=True)
    clase_id = Required(int)
    admin_id = Optional(int)
    cliente_id = Optional(int)
    completado = Required(bool, default=False)
    completado_en = Optional(datetime)


class Nota(db.Entity):
    _table_ = (DB_SCHEMA, "nota")

    id = PrimaryKey(int, auto=True)
    clase_id = Required(int)
    admin_id = Optional(int)
    cliente_id = Optional(int)
    contenido = Required(str)
    creado_en = Required(datetime, default=datetime.utcnow)


class Mensaje(db.Entity):
    _table_ = (DB_SCHEMA, "mensaje")

    id = PrimaryKey(int, auto=True)
    sesion_id = Required(str)
    usuario_id = Required(int)
    tipo_usuario = Required(str)
    rol = Required(str)
    contenido = Required(str)
    creado_en = Required(datetime, default=datetime.utcnow)


class Frente(db.Entity):
    """Un problema del negocio que el cliente está trabajando: resolver → SOP → automatizar."""

    _table_ = (DB_SCHEMA, "frente")

    id = PrimaryKey(int, auto=True)
    usuario_id = Required(int)
    tipo_usuario = Required(str)
    slug = Required(str)
    vistas_json = Required(str, default="[]")
    sop_link = Optional(str, nullable=True)
    automatizado = Required(bool, default=False)
    creado_en = Required(datetime, default=datetime.utcnow)
    actualizado_en = Required(datetime, default=datetime.utcnow)
    composite_key(usuario_id, tipo_usuario, slug)


class ConsultaCoach(db.Entity):
    """Lo que la guía no pudo resolver con material y quedó para el coach."""

    _table_ = (DB_SCHEMA, "consulta_coach")

    id = PrimaryKey(int, auto=True)
    usuario_id = Required(int)
    tipo_usuario = Required(str)
    texto = Required(str)
    slug = Optional(str, nullable=True)
    estado = Required(str, default="pendiente")
    creado_en = Required(datetime, default=datetime.utcnow)
