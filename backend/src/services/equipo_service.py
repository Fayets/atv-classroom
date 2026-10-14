"""Alta, baja y edición del equipo de ATV (admins y coaches) desde el panel de admin."""

from fastapi import HTTPException
from pony.orm import db_session

from src.db import db
from src.models import Admin
from src.services.auth_service import cerrar_sesiones_de_admin

ROLES = ("admin", "coach")
AREAS = ("marketing", "ventas", "sistemas", "equipo", "fulfillment", "mentalidad")


def _a_dict(admin: Admin) -> dict:
    return {
        "id": admin.id,
        "email": admin.email,
        "nombre": admin.nombre or "",
        "rol": admin.rol or "admin",
        "area": admin.area,
        "activo": admin.activo,
        "foto_url": admin.foto_url,
        "con_google": bool(admin.google_sub),
        "con_clave": bool(admin.password_hash),
    }


def _validar(rol: str | None, area: str | None) -> None:
    if rol is not None and rol not in ROLES:
        raise HTTPException(status_code=422, detail="El rol tiene que ser admin o coach.")
    if area and area not in AREAS:
        raise HTTPException(status_code=422, detail="Área inválida.")


def _admins_activos() -> int:
    total = 0
    for a in Admin.select()[:]:
        if a.activo and (a.rol or "admin") == "admin":
            total += 1
    return total


class EquipoServices:
    def listar(self) -> list[dict]:
        with db_session:
            # Pony en Python 3.13 no soporta comprensiones sobre consultas: bucle explícito.
            miembros = []
            for a in list(Admin.select()):
                if not a.borrado:
                    miembros.append(_a_dict(a))
        miembros.sort(key=lambda m: (not m["activo"], m["rol"] != "admin", m["nombre"].lower() or m["email"]))
        return miembros

    def crear(self, data: dict) -> dict:
        email = data["email"].strip().lower()
        _validar(data.get("rol"), data.get("area"))
        with db_session:
            for a in Admin.select()[:]:
                if a.email.strip().lower() == email:
                    if not a.borrado:
                        raise HTTPException(status_code=409, detail="Ese mail ya está en el equipo.")
                    # Vuelve alguien que se había borrado: se reusa su fila (y su historial).
                    a.borrado, a.activo = False, True
                    a.nombre = (data.get("nombre") or "").strip() or a.nombre
                    a.rol = data.get("rol") or "coach"
                    a.area = data.get("area") or None
                    return _a_dict(a)
            admin = Admin(
                email=email,
                nombre=(data.get("nombre") or "").strip(),
                rol=data.get("rol") or "coach",
                area=data.get("area") or None,
            )
            db.flush()
            return _a_dict(admin)

    def actualizar(self, miembro_id: int, data: dict, sesion: dict) -> dict:
        _validar(data.get("rol"), data.get("area"))
        with db_session:
            admin = Admin.get(id=miembro_id)
            if admin is None:
                raise HTTPException(status_code=404, detail="No existe ese miembro del equipo.")
            es_uno_mismo = admin.id == sesion["usuario_id"]
            pierde_admin = (data.get("rol") == "coach" or data.get("activo") is False) and (admin.rol or "admin") == "admin"
            if es_uno_mismo and pierde_admin:
                raise HTTPException(status_code=409, detail="No podés quitarte el rol de admin ni darte de baja a vos mismo.")
            if pierde_admin and admin.activo and _admins_activos() <= 1:
                raise HTTPException(status_code=409, detail="Tiene que quedar al menos un admin activo.")
            if "nombre" in data and data["nombre"] is not None:
                admin.nombre = data["nombre"].strip()
            if data.get("rol"):
                admin.rol = data["rol"]
            if "area" in data:
                admin.area = data["area"] or None
            baja = data.get("activo") is False and admin.activo
            if data.get("activo") is not None:
                admin.activo = data["activo"]
            resultado = _a_dict(admin)
        if baja or data.get("rol"):
            # Rol o baja nuevos: que vuelva a entrar con los permisos que le tocan.
            cerrar_sesiones_de_admin(miembro_id)
        return resultado

    def borrar(self, miembro_id: int, sesion: dict) -> dict:
        """Solo a quien ya está de baja. No se borra la fila: queda marcada para que sus mensajes, altas y
        roadmaps sigan mostrando quién los hizo, y deja de aparecer en el equipo."""
        with db_session:
            admin = Admin.get(id=miembro_id)
            if admin is None or admin.borrado:
                raise HTTPException(status_code=404, detail="No existe ese miembro del equipo.")
            if admin.id == sesion["usuario_id"]:
                raise HTTPException(status_code=409, detail="No podés borrarte a vos mismo.")
            if admin.activo:
                raise HTTPException(status_code=409, detail="Primero dalo de baja.")
            admin.borrado = True
            admin.google_sub = None
            admin.password_hash = None
        cerrar_sesiones_de_admin(miembro_id)
        return {"ok": True}
