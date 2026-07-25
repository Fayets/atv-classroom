#!/usr/bin/env python3
"""Bootstrap mínimo para ATV Classroom (admin, cliente demo y catálogo de módulos)."""

from pony.orm import db_session

from src.db import db, init_db
from src.models import Admin, ClienteExterno, Programa
from src.services.admin_service import AdminServices
from src.services.auth_service import crear_admin, set_password_cliente

ADMIN_SEED = {
    "email": "admin@atvos.io",
    "password": "atv-admin-2024",
    "nombre": "Admin ATV",
}

CLIENTE_PASSWORD = "atv-cliente-2024"

PROGRAMAS_CATALOGO = [
    {"slug": "start-here", "titulo": "Start Here", "orden": 1},
    {"slug": "advantage", "titulo": "Advantage", "orden": 2},
    {"slug": "business-foundations", "titulo": "Business Foundations", "orden": 3},
    {"slug": "marketing", "titulo": "Marketing", "orden": 4},
    {"slug": "sales", "titulo": "Sales", "orden": 5},
    {"slug": "product", "titulo": "Product", "orden": 6},
    {"slug": "ads", "titulo": "Ads", "orden": 7},
    {"slug": "launch", "titulo": "Launch", "orden": 8},
    {"slug": "creator-acquisition", "titulo": "Creator Acquisition", "orden": 9},
    {"slug": "systems", "titulo": "Systems", "orden": 10},
    {"slug": "case-of-study", "titulo": "Case of Study", "orden": 11},
    {"slug": "live-sessions-mentoria", "titulo": "Live Sessions Mentoria", "orden": 12},
    {"slug": "live-sessions-boost", "titulo": "Live Sessions Boost", "orden": 13},
]

PROGRAMAS_OBSOLETOS = ("live-sessions", "live-sessions-advantage")


def _cover_path(slug: str) -> str:
    return f"/modules/{slug}.png"


def seed_admin() -> list[str]:
    email = ADMIN_SEED["email"].lower()

    with db_session:
        if Admin.get(email=email) is not None:
            return [f"Admin {email} ya existe, se saltea."]

    crear_admin(
        email=email,
        password=ADMIN_SEED["password"],
        nombre=ADMIN_SEED["nombre"],
    )
    return [f"Admin {email} creado."]


def seed_cliente_password() -> list[str]:
    with db_session:
        clientes = list(ClienteExterno.select()[:])
        vigentes = [
            cliente
            for cliente in clientes
            if cliente.estado_cliente == "vigente"
        ]

        if not vigentes:
            return ["No hay clientes vigentes en clients.clientes, se saltea password."]

        cliente = vigentes[0]
        email = cliente.email
        plan = cliente.plan_actual or "mentoria"

        if cliente.password_hash:
            return [f"Cliente {email} ya tiene password_hash, se saltea."]

    actualizado = set_password_cliente(email, CLIENTE_PASSWORD)
    if actualizado:
        return [f"Password seteado para cliente {email} (plan={plan})."]
    return [f"Cliente {email} ya tiene password_hash, se saltea."]


def seed_programas_catalogo() -> list[str]:
    mensajes: list[str] = []
    creados = 0
    actualizados = 0

    with db_session:
        for item in PROGRAMAS_CATALOGO:
            slug = item["slug"]
            cover_url = _cover_path(slug)
            existente = Programa.get(slug=slug)

            if existente is None:
                Programa(
                    titulo=item["titulo"],
                    slug=slug,
                    orden=item["orden"],
                    cover_url=cover_url,
                )
                creados += 1
                continue

            cambios = False
            if existente.orden != item["orden"]:
                existente.orden = item["orden"]
                cambios = True
            if existente.titulo != item["titulo"]:
                existente.titulo = item["titulo"]
                cambios = True
            if not existente.cover_url:
                existente.cover_url = cover_url
                cambios = True

            if cambios:
                actualizados += 1

        db.flush()

    if creados:
        mensajes.append(f"Programas creados: {creados}.")
    if actualizados:
        mensajes.append(f"Programas actualizados: {actualizados}.")
    if not creados and not actualizados:
        mensajes.append("Catálogo de programas ya está al día.")

    return mensajes


def seed_limpiar_programas_obsoletos() -> list[str]:
    mensajes: list[str] = []
    admin = AdminServices()

    for slug in PROGRAMAS_OBSOLETOS:
        with db_session:
            programa = Programa.get(slug=slug)
            if programa is None:
                continue
            programa_id = programa.id

        admin.eliminar_programa(programa_id)
        mensajes.append(f"Programa obsoleto eliminado: {slug}.")

    if not mensajes:
        mensajes.append("No hay programas obsoletos para eliminar.")

    return mensajes


def main() -> None:
    print("Inicializando base de datos...")
    init_db()

    print("\n--- Admin ---")
    for mensaje in seed_admin():
        print(mensaje)

    print("\n--- Cliente (clients.clientes) ---")
    for mensaje in seed_cliente_password():
        print(mensaje)

    print("\n--- Catálogo de programas ---")
    for mensaje in seed_programas_catalogo():
        print(mensaje)

    print("\n--- Limpieza de módulos obsoletos ---")
    for mensaje in seed_limpiar_programas_obsoletos():
        print(mensaje)

    print("\nBootstrap completado.")


if __name__ == "__main__":
    main()
