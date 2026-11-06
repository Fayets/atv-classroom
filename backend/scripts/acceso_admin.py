"""Le suma a una cuenta del equipo otro mail para entrar con contraseña, sin pasar su Google.
Pedido de Franco del 06-11-2026: Mauri hace seguimiento desde la cuenta de Juan.

    python -m scripts.acceso_admin <mail de la cuenta> <mail nuevo>     # pide la contraseña sin mostrarla
    python -m scripts.acceso_admin <mail de la cuenta> --sacar          # saca el mail y la contraseña
"""

import getpass
import sys

from pony.orm import db_session

from src.db import init_db
from src.services.auth_service import _buscar_admin_por_email, _buscar_clientes_por_email, _hash_password, _normalizar_email


def asignar(cuenta: str, alterno: str, clave: str) -> str:
    alterno = _normalizar_email(alterno)
    with db_session:
        admin = _buscar_admin_por_email(cuenta)
        if admin is None:
            raise SystemExit(f"No hay nadie del equipo con el mail {cuenta}.")
        otro = _buscar_admin_por_email(alterno)
        if (otro is not None and otro.id != admin.id) or _buscar_clientes_por_email(alterno):
            raise SystemExit(f"{alterno} ya es de otra cuenta: usá otro mail.")
        admin.email_alterno, admin.password_hash = alterno, _hash_password(clave)
        return admin.nombre or admin.email


def sacar(cuenta: str) -> str:
    with db_session:
        admin = _buscar_admin_por_email(cuenta)
        if admin is None:
            raise SystemExit(f"No hay nadie del equipo con el mail {cuenta}.")
        admin.email_alterno, admin.password_hash = None, None
        return admin.nombre or admin.email


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    init_db()
    cuenta, nuevo = sys.argv[1:]
    if nuevo == "--sacar":
        print(f"Listo: {sacar(cuenta)} ya no entra con mail y contraseña.")
        return
    clave = getpass.getpass("Contraseña nueva (al menos 10 caracteres): ")
    if len(clave) < 10:
        raise SystemExit("Muy corta: tiene que tener al menos 10 caracteres.")
    if clave != getpass.getpass("Repetila: "):
        raise SystemExit("No coinciden.")
    print(f"Listo: {nuevo} entra a la cuenta de {asignar(cuenta, nuevo, clave)}.")


if __name__ == "__main__":
    main()
