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


def _apply_migrations() -> None:
    conn = psycopg2.connect(**_psycopg2_connect_kwargs())
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    f'ALTER TABLE "{DB_SCHEMA}"."clase" '
                    f"ADD COLUMN IF NOT EXISTS descripcion TEXT"
                )
    finally:
        conn.close()
