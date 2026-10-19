import psycopg2
from decouple import config
from pony.orm import Database

db = Database()
DB_SCHEMA = config("DB_SCHEMA", default="classroom")


def _psycopg2_connect_kwargs() -> dict:
    return {
        "host": config("DB_HOST"),
        "port": int(config("DB_PORT", default=5432)),
        "dbname": config("DB_NAME"),
        "user": config("DB_USER"),
        "password": config("DB_PASSWORD"),
    }


def _ensure_schema() -> None:
    conn = psycopg2.connect(**_psycopg2_connect_kwargs())
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{DB_SCHEMA}"')
    finally:
        conn.close()


def init_db() -> None:
    from src import models  # noqa: F401

    _ensure_schema()
    db.bind(
        provider="postgres",
        host=config("DB_HOST"),
        port=int(config("DB_PORT", default=5432)),
        database=config("DB_NAME"),
        user=config("DB_USER"),
        password=config("DB_PASSWORD"),
    )
    _apply_migrations()
    db.generate_mapping(create_tables=True)
    _crear_indices()


def _crear_indices() -> None:
    """Índices que Pony no crea solo (corren después de crear las tablas)."""
    conn = psycopg2.connect(**_psycopg2_connect_kwargs())
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    f'CREATE INDEX IF NOT EXISTS idx_mensajes_canal_canal_id '
                    f'ON "{DB_SCHEMA}"."mensajes_canal" (canal, id)'
                )
    finally:
        conn.close()


def _columna(cur, tabla: str, columna: str) -> str | None:
    """'YES'/'NO' según admita NULL, o None si la columna (o la tabla) no existe."""
    cur.execute(
        "SELECT is_nullable FROM information_schema.columns WHERE table_schema = %s AND table_name = %s AND column_name = %s",
        (DB_SCHEMA, tabla, columna),
    )
    fila = cur.fetchone()
    return fila[0] if fila else None


def _tabla_existe(cur, tabla: str) -> bool:
    cur.execute("SELECT 1 FROM information_schema.tables WHERE table_schema = %s AND table_name = %s", (DB_SCHEMA, tabla))
    return cur.fetchone() is not None


def _agregar_columna(cur, tabla: str, columna: str, definicion: str) -> None:
    if _tabla_existe(cur, tabla) and _columna(cur, tabla, columna) is None:
        cur.execute(f'ALTER TABLE "{DB_SCHEMA}"."{tabla}" ADD COLUMN IF NOT EXISTS {columna} {definicion}')


def _apply_migrations() -> None:
    conn = psycopg2.connect(**_psycopg2_connect_kwargs())
    try:
        with conn:
            with conn.cursor() as cur:
                # Solo se altera una tabla si de verdad falta la columna: "ADD COLUMN IF NOT EXISTS" igual
                # pide un candado exclusivo, y con la app andando eso choca con las lecturas (deadlock).
                _agregar_columna(cur, "clase", "descripcion", "TEXT")
                # Equipo: coaches además del admin, login con Google (sin contraseña).
                _agregar_columna(cur, "admins", "rol", "VARCHAR NOT NULL DEFAULT 'admin'")
                _agregar_columna(cur, "admins", "area", "VARCHAR")
                _agregar_columna(cur, "admins", "google_sub", "VARCHAR")
                _agregar_columna(cur, "admins", "foto_url", "VARCHAR")
                _agregar_columna(cur, "admins", "voz_tab", "INTEGER")
                _agregar_columna(cur, "admins", "borrado", "BOOLEAN NOT NULL DEFAULT FALSE")
                _agregar_columna(cur, "roadmap_docs", "fathom_url", "TEXT")
                # Los próximos pasos viven en el roadmap (ya no hace falta un Doc): el link pasa a ser opcional.
                _agregar_columna(cur, "roadmap_docs", "pasos_json", "TEXT")
                _agregar_columna(cur, "llamadas", "puntos_json", "TEXT")
                _agregar_columna(cur, "fathom_conexiones", "webhook_id", "TEXT")
                _agregar_columna(cur, "fathom_conexiones", "webhook_secreto_cifrado", "TEXT")
                _agregar_columna(cur, "fathom_conexiones", "webhook_token", "TEXT UNIQUE")
                if _columna(cur, "roadmap_docs", "url") == "NO":
                    cur.execute(f'ALTER TABLE "{DB_SCHEMA}"."roadmap_docs" ALTER COLUMN url DROP NOT NULL')
                _agregar_columna(cur, "altas_clientes", "ficha_previa", "TEXT")
                _agregar_columna(cur, "solicitud_sop", "entrega_url", "TEXT")
                _agregar_columna(cur, "solicitud_sop", "resuelto_por", "INTEGER")
                _agregar_columna(cur, "solicitud_sop", "resuelto_en", "TIMESTAMP")
                if _columna(cur, "admins", "password_hash") == "NO":
                    cur.execute(f'ALTER TABLE "{DB_SCHEMA}"."admins" ALTER COLUMN password_hash DROP NOT NULL')
                # Frente: un link por plantilla de SOP y la revisión con el coach (reemplaza "automatizar").
                _agregar_columna(cur, "frente", "sops_json", "TEXT")
                _agregar_columna(cur, "frente", "revisado", "BOOLEAN NOT NULL DEFAULT FALSE")
                # Historial traído de Discord: el nombre del autor como aparecía allá.
                _agregar_columna(cur, "mensajes_canal", "autor_nombre", "VARCHAR")
                # Canales grupales: roles que lo ven y quién lo creó.
                _agregar_columna(cur, "canales", "roles_json", "TEXT")
                _agregar_columna(cur, "canales", "creado_por", "INTEGER")
                _agregar_columna(cur, "canales", "inactivo", "BOOLEAN NOT NULL DEFAULT FALSE")
                _agregar_columna(cur, "canales", "pausa", "BOOLEAN NOT NULL DEFAULT FALSE")
                _agregar_columna(cur, "canales", "participantes_json", "TEXT")
                _agregar_columna(cur, "canales", "orden", "INTEGER")
                # Cerebro: subnicho y revisión del nicho con todo lo del cliente; correcciones del Tab.
                _agregar_columna(cur, "cerebro_perfil_cliente", "subnicho", "VARCHAR")
                _agregar_columna(cur, "cerebro_perfil_cliente", "nicho_cita", "TEXT")
                _agregar_columna(cur, "cerebro_perfil_cliente", "nicho_revisado_en", "TIMESTAMP")
                _agregar_columna(cur, "cerebro_sugerencias", "voz_id", "INTEGER")
                _agregar_columna(cur, "cerebro_sugerencias", "enviado", "TEXT")
                _agregar_columna(cur, "cerebro_sugerencias", "mensaje_id", "INTEGER")
                _agregar_columna(cur, "cerebro_sugerencias", "cambio_pct", "INTEGER")
                # Equipo del cliente (setters, closers, socios): quién escribió, sesión y progreso propios.
                _agregar_columna(cur, "mensajes_canal", "miembro_id", "INTEGER")
                _agregar_columna(cur, "sesiones", "miembro_id", "INTEGER")
                _agregar_columna(cur, "progreso", "miembro_id", "INTEGER")
                _agregar_columna(cur, "nota", "miembro_id", "INTEGER")
                cur.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS "{DB_SCHEMA}"."mensaje" (
                        id SERIAL PRIMARY KEY,
                        sesion_id VARCHAR NOT NULL,
                        usuario_id INTEGER NOT NULL,
                        tipo_usuario VARCHAR NOT NULL,
                        rol VARCHAR NOT NULL,
                        contenido TEXT NOT NULL,
                        creado_en TIMESTAMP NOT NULL DEFAULT NOW()
                    )
                    """
                )
                cur.execute(
                    f"""
                    CREATE INDEX IF NOT EXISTS idx_mensaje_sesion
                    ON "{DB_SCHEMA}"."mensaje" (sesion_id, creado_en)
                    """
                )
    finally:
        conn.close()
