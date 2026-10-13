"""El equipo de cada cliente: socios, setters, closers y demás que el cliente suma a su chat.

- El cliente los carga desde "Mi cuenta" con mail, nombre y rol. Entran con su mail y la MISMA clave
  del cliente (no hay invitación ni clave propia).
- Cuántos puede sumar depende del plan (tabla limites_equipo; si el plan no está, LIMITE_POR_DEFECTO).
- Ven solo el chat privado del cliente (no la comunidad ni los anuncios) y las clases de su rol.
- Su acceso cuelga del cliente: si el cliente vence, ellos también; si el cliente los saca, se les
  cierran las sesiones en el momento.
"""

import re

from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.models import ClienteExterno, LimiteEquipo, MiembroCliente, SesionGuardada

LIMITE_POR_DEFECTO = 10
PLANES = ["mentoria", "boost", "advantage", "mid", "entry"]

ROLES = {
    "socio": "Socio",
    "setter": "Setter",
    "closer": "Closer",
    "editor": "Editor",
    "otro": "Equipo",
}

# Programas del classroom que ve cada rol (None = todos, como el cliente). Los títulos son los de
# classroom.programa: si se renombra uno, actualizar acá.
PROGRAMAS_POR_ROL: dict[str, set[str] | None] = {
    "socio": None,
    "setter": {"Start Here", "Sales", "Creator Acquisition"},
    "closer": {"Start Here", "Sales"},
    "editor": {"Start Here", "Marketing", "Product"},
    "otro": {"Start Here"},
}

_MAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def nombre_rol(rol: str | None) -> str:
    return ROLES.get(rol or "", "Equipo")


def programa_visible(rol: str | None, titulo: str) -> bool:
    permitidos = PROGRAMAS_POR_ROL.get(rol or "otro", PROGRAMAS_POR_ROL["otro"])
    return permitidos is None or titulo in permitidos


def limite_de(plan: str | None) -> int:
    fila = LimiteEquipo.get(plan=plan or "")
    return fila.maximo if fila else LIMITE_POR_DEFECTO


def _dict(m: MiembroCliente) -> dict:
    return {"id": m.id, "email": m.email, "nombre": m.nombre, "rol": m.rol, "rol_nombre": nombre_rol(m.rol), "creado_en": m.creado_en.isoformat()}


def _de_cliente(cliente_id: int) -> list[MiembroCliente]:
    return list(MiembroCliente.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."miembros_cliente" WHERE cliente_id = $cliente_id ORDER BY id'))


def _duenio(sesion: dict) -> int:
    """Solo el cliente (el dueño de la cuenta) maneja su equipo."""
    if sesion.get("rol") in ("admin", "coach"):
        raise HTTPException(status_code=403, detail="Esto es para clientes.")
    if sesion.get("miembro_id"):
        raise HTTPException(status_code=403, detail="Solo el titular de la cuenta puede sumar o sacar gente del equipo.")
    return sesion["usuario_id"]


def _mail_libre(email: str, cliente_id: int, miembro_id: int | None = None) -> None:
    from src.services.auth_service import _buscar_admin_por_email, _buscar_clientes_por_email

    if _buscar_admin_por_email(email):
        raise HTTPException(status_code=409, detail="Ese mail es de alguien del equipo de ATV.")
    if _buscar_clientes_por_email(email):
        raise HTTPException(status_code=409, detail="Ese mail ya es de un cliente de ATV: entra con su propia cuenta.")
    otro = MiembroCliente.get(email=email)
    if otro and otro.id != miembro_id:
        detalle = "Esa persona ya está en tu equipo." if otro.cliente_id == cliente_id else "Ese mail ya está en el equipo de otro cliente."
        raise HTTPException(status_code=409, detail=detalle)


def _limpiar(email: str | None, nombre: str | None, rol: str | None) -> tuple[str, str, str]:
    email = (email or "").strip().lower()
    nombre = " ".join((nombre or "").split())
    if not _MAIL.match(email):
        raise HTTPException(status_code=422, detail="Revisá el mail.")
    if not nombre:
        raise HTTPException(status_code=422, detail="Poné el nombre de la persona.")
    if len(nombre) > 80:
        raise HTTPException(status_code=422, detail="El nombre es muy largo.")
    if rol not in ROLES:
        raise HTTPException(status_code=422, detail="Elegí un rol.")
    return email, nombre, rol


def cerrar_sesiones_de_miembro(miembro_id: int) -> None:
    from src.services import auth_service

    with db_session:
        for s in list(SesionGuardada.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."sesiones" WHERE miembro_id = $miembro_id', {"miembro_id": miembro_id})):
            s.delete()
    for token, datos in list(auth_service._sessions.items()):
        if datos.get("miembro_id") == miembro_id:
            auth_service._sessions.pop(token, None)


class EquipoClienteServices:
    def listar(self, sesion: dict) -> dict:
        cliente_id = _duenio(sesion)
        with db_session:
            cliente = ClienteExterno.get(id=cliente_id)
            return {
                "maximo": limite_de(cliente.plan_actual if cliente else None),
                "miembros": [_dict(m) for m in _de_cliente(cliente_id)],
                "roles": [{"id": k, "nombre": v} for k, v in ROLES.items()],
            }

    def agregar(self, sesion: dict, email: str, nombre: str, rol: str) -> dict:
        cliente_id = _duenio(sesion)
        email, nombre, rol = _limpiar(email, nombre, rol)
        with db_session:
            cliente = ClienteExterno.get(id=cliente_id)
            maximo = limite_de(cliente.plan_actual if cliente else None)
            if len(_de_cliente(cliente_id)) >= maximo:
                raise HTTPException(status_code=422, detail=f"Tu plan permite sumar hasta {maximo} personas.")
            _mail_libre(email, cliente_id)
            m = MiembroCliente(cliente_id=cliente_id, email=email, nombre=nombre, rol=rol)
            m.flush()
            return _dict(m)

    def editar(self, sesion: dict, miembro_id: int, email: str, nombre: str, rol: str) -> dict:
        cliente_id = _duenio(sesion)
        email, nombre, rol = _limpiar(email, nombre, rol)
        with db_session:
            m = MiembroCliente.get(id=miembro_id)
            if m is None or m.cliente_id != cliente_id:
                raise HTTPException(status_code=404, detail="No está en tu equipo.")
            cambio_mail = m.email != email
            if cambio_mail:
                _mail_libre(email, cliente_id, m.id)
            m.email, m.nombre, m.rol = email, nombre, rol
            datos = _dict(m)
        if cambio_mail:
            cerrar_sesiones_de_miembro(miembro_id)
        return datos

    def quitar(self, sesion: dict, miembro_id: int) -> dict:
        cliente_id = _duenio(sesion)
        with db_session:
            m = MiembroCliente.get(id=miembro_id)
            if m is None or m.cliente_id != cliente_id:
                raise HTTPException(status_code=404, detail="No está en tu equipo.")
            m.delete()
        cerrar_sesiones_de_miembro(miembro_id)
        return {"ok": True}

    # ---------- ATV: cupo por plan ----------
    def limites(self) -> dict:
        with db_session:
            guardados = {f.plan: f.maximo for f in list(LimiteEquipo.select())}
            usados = dict(
                db.select(
                    f'SELECT c.plan_actual, count(*) FROM "{DB_SCHEMA}"."miembros_cliente" m '
                    "JOIN clients.clientes c ON c.id = m.cliente_id GROUP BY c.plan_actual"
                )
            )
        return {
            "por_defecto": LIMITE_POR_DEFECTO,
            "planes": [{"plan": p, "maximo": guardados.get(p, LIMITE_POR_DEFECTO), "miembros": usados.get(p, 0)} for p in PLANES],
        }

    def guardar_limites(self, cambios: dict[str, int]) -> dict:
        with db_session:
            for plan, maximo in cambios.items():
                if plan not in PLANES:
                    raise HTTPException(status_code=422, detail=f"Plan desconocido: {plan}")
                if not isinstance(maximo, int) or not 0 <= maximo <= 100:
                    raise HTTPException(status_code=422, detail="El cupo va de 0 a 100.")
                fila = LimiteEquipo.get(plan=plan)
                if fila:
                    fila.maximo = maximo
                else:
                    LimiteEquipo(plan=plan, maximo=maximo)
        return self.limites()


def miembro_de_login(email: str) -> MiembroCliente | None:
    """Dentro de un db_session: el miembro con ese mail, si existe."""
    return MiembroCliente.get(email=email)

