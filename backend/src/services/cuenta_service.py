"""Mi cuenta: perfil, foto y plan de quien está logueado. Pensado para ir sumando secciones."""

import secrets
from datetime import date, datetime

from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.db import db
from src.models import Admin, ClienteExterno, FotoPerfil
from src.services.auth_service import es_equipo, tipo_de_sesion
from src.services.roles_canal import nombre_rol, rol_de_plan
from src.storage.adjuntos import ADJUNTOS_DIR

FOTOS_DIR = ADJUNTOS_DIR / "fotos"
MAX_FOTO = 5 * 1024 * 1024
# Se reconoce el tipo por los primeros bytes (nunca por lo que diga el navegador).
_FIRMAS = {b"\xff\xd8\xff": "jpg", b"\x89PNG\r\n\x1a\n": "png", b"RIFF": "webp"}


def url_foto(archivo: str) -> str:
    return f"/api/cuenta/fotos/{archivo}"


def fotos_de(tipo: str, ids: list[int] | None = None) -> dict[int, str]:
    """Fotos subidas, por id, para un tipo de usuario (una sola consulta)."""
    with db_session:
        filas = [f for f in list(FotoPerfil.select()) if f.tipo == tipo and (ids is None or f.usuario_id in ids)]
        return {f.usuario_id: url_foto(f.archivo) for f in filas}


def foto_de(tipo: str, usuario_id: int, google: str | None = None) -> str | None:
    """La foto que se muestra: la subida desde Mi cuenta; si no hay, la de Google (equipo)."""
    return fotos_de(tipo, [usuario_id]).get(usuario_id) or google


def _tipo_imagen(datos: bytes) -> str | None:
    for firma, ext in _FIRMAS.items():
        if datos.startswith(firma):
            if ext == "webp" and datos[8:12] != b"WEBP":
                return None
            return ext
    return None


class CuentaServices:
    def mi_cuenta(self, sesion: dict) -> dict:
        tipo = tipo_de_sesion(sesion)
        with db_session:
            if es_equipo(sesion):
                a = Admin.get(id=sesion["usuario_id"])
                return {
                    "tipo": "equipo",
                    "nombre": (a.nombre if a else None) or sesion["nombre"],
                    "email": sesion["email"],
                    "rol": sesion["rol"],
                    "rol_nombre": "Admin" if sesion["rol"] == "admin" else "Coach",
                    "area": a.area if a else None,
                    "foto_url": foto_de(tipo, sesion["usuario_id"], a.foto_url if a else None),
                    "foto_propia": bool(fotos_de(tipo, [sesion["usuario_id"]])),
                }
            c = ClienteExterno.get(id=sesion["usuario_id"])
            if c is None:
                raise HTTPException(status_code=404, detail="Cliente no encontrado.")
            extra = db.select("SELECT fecha_inicio, duracion_dias FROM clients.clientes WHERE id = $id", {"id": c.id})
            inicio, duracion = extra[0] if extra else (None, None)
            hoy = date.today()
            vence = c.fecha_vencimiento
            return {
                "tipo": "cliente",
                "nombre": c.nombre or sesion["nombre"],
                "email": c.email,
                "plan": c.plan_actual,
                "plan_nombre": nombre_rol(rol_de_plan(c.plan_actual)) if rol_de_plan(c.plan_actual) else (c.plan_actual or "").capitalize() or None,
                "fecha_inicio": inicio.isoformat() if inicio else None,
                "fecha_vencimiento": vence.isoformat() if vence else None,
                "dias_restantes": (vence - hoy).days if vence else None,
                "duracion_dias": duracion,
                "responsable": c.responsable,
                "foto_url": foto_de(tipo, c.id),
                "foto_propia": bool(fotos_de(tipo, [c.id])),
            }

    def subir_foto(self, sesion: dict, datos: bytes) -> dict:
        if len(datos) > MAX_FOTO:
            raise HTTPException(status_code=413, detail="La foto pesa más de 5 MB.")
        ext = _tipo_imagen(datos)
        if ext is None:
            raise HTTPException(status_code=415, detail="La foto tiene que ser JPG, PNG o WEBP.")
        tipo = tipo_de_sesion(sesion)
        uid = sesion["usuario_id"]
        FOTOS_DIR.mkdir(parents=True, exist_ok=True)
        # Nombre nuevo en cada cambio: así el navegador no muestra la foto vieja guardada.
        archivo = f"{tipo}-{uid}-{secrets.token_hex(8)}.{ext}"
        (FOTOS_DIR / archivo).write_bytes(datos)
        with db_session:
            f = FotoPerfil.get(tipo=tipo, usuario_id=uid)
            if f is not None:
                viejo = FOTOS_DIR / f.archivo
                if viejo.exists():
                    viejo.unlink()
                f.archivo = archivo
                f.actualizado_en = datetime.utcnow()
            else:
                FotoPerfil(tipo=tipo, usuario_id=uid, archivo=archivo)
        return {"foto_url": url_foto(archivo)}

    def quitar_foto(self, sesion: dict) -> dict:
        tipo = tipo_de_sesion(sesion)
        with db_session:
            f = FotoPerfil.get(tipo=tipo, usuario_id=sesion["usuario_id"])
            if f is not None:
                ruta = FOTOS_DIR / f.archivo
                if ruta.exists():
                    ruta.unlink()
                f.delete()
            google = None
            if es_equipo(sesion):
                a = Admin.get(id=sesion["usuario_id"])
                google = a.foto_url if a else None
        return {"foto_url": google}

    @staticmethod
    def ruta_foto(archivo: str):
        # Solo nombres que generamos nosotros: nada de "../" ni rutas.
        if not archivo or "/" in archivo or "\\" in archivo or archivo.startswith("."):
            raise HTTPException(status_code=404, detail="Foto no encontrada.")
        ruta = FOTOS_DIR / archivo
        if not ruta.is_file():
            raise HTTPException(status_code=404, detail="Foto no encontrada.")
        return ruta
