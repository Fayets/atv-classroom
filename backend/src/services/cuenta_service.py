"""Mi cuenta: perfil, foto y plan de quien está logueado. Pensado para ir sumando secciones."""

import secrets
from datetime import date, datetime

from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.models import Admin, Canal, ClienteExterno, FotoPerfil
from src.services.auth_service import es_equipo, persona, tipo_de_sesion
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


# Cómo ve el cliente su estado (en sus palabras, no las del equipo).
_ESTADO_CLIENTE = {
    "vigente": "Activo", "proximo_a_vencer": "Por vencer", "vencido": "Vencido", "pausa": "Activo",
    "no_va_a_renovar": "Activo", "llamada_recompra": "Activo", "estan_bien": "Activo", "inactivo": "Inactivo",
}


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
            extra = db.select(
                "SELECT k.fecha_inicio, k.duracion_dias, e.estado_efectivo FROM clients.clientes k "
                "LEFT JOIN clients.clientes_con_estado e ON e.id = k.id WHERE k.id = $id", {"id": c.id})
            inicio, duracion, estado = extra[0] if extra else (None, None, None)
            canal = Canal.get(cliente_id=c.id)
            # "En pausa" solo si está en el grupo Pausa (ahí se le corta el acceso); la ficha sola no alcanza.
            en_pausa = bool(canal and canal.pausa)
            hoy = date.today()
            vence = c.fecha_vencimiento
            ptipo, pid = persona(sesion)
            miembro = None
            if ptipo == "miembro":
                from src.models import MiembroCliente
                from src.services.equipo_cliente_service import nombre_rol as rol_equipo

                m = MiembroCliente.get(id=pid)
                miembro = {"rol": m.rol, "rol_nombre": rol_equipo(m.rol), "cliente_nombre": c.nombre or c.email} if m else None
            return {
                "tipo": "cliente",
                "miembro": miembro,
                "nombre": sesion["nombre"] if miembro else (c.nombre or sesion["nombre"]),
                "email": sesion["email"] if miembro else c.email,
                "plan": c.plan_actual,
                "plan_nombre": nombre_rol(rol_de_plan(c.plan_actual)) if rol_de_plan(c.plan_actual) else (c.plan_actual or "").capitalize() or None,
                "fecha_inicio": inicio.isoformat() if inicio else None,
                "fecha_vencimiento": vence.isoformat() if vence else None,
                "dias_restantes": (vence - hoy).days if vence else None,
                "duracion_dias": duracion or ((vence - inicio).days if vence and inicio else None),
                "estado": "pausa" if en_pausa else estado,
                "estado_texto": "En pausa" if en_pausa else _ESTADO_CLIENTE.get(estado, (estado or "").replace("_", " ").capitalize() or None),
                "responsable": c.responsable,
                "foto_url": foto_de(ptipo, pid),
                "foto_propia": bool(fotos_de(ptipo, [pid])),
            }

    def subir_foto(self, sesion: dict, datos: bytes) -> dict:
        if len(datos) > MAX_FOTO:
            raise HTTPException(status_code=413, detail="La foto pesa más de 5 MB.")
        ext = _tipo_imagen(datos)
        if ext is None:
            raise HTTPException(status_code=415, detail="La foto tiene que ser JPG, PNG o WEBP.")
        tipo, uid = persona(sesion)
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
        tipo, uid = persona(sesion)
        with db_session:
            f = FotoPerfil.get(tipo=tipo, usuario_id=uid)
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

    # ---------- Tab: con la voz de quién sugiere ----------
    def voces(self, sesion: dict) -> dict:
        """Las voces que aprendió el cerebro (gente del equipo que le escribió a clientes) y la elegida."""
        if not es_equipo(sesion):
            raise HTTPException(status_code=403, detail="Solo para el equipo.")
        yo = sesion["usuario_id"]
        with db_session:
            filas = db.select(
                f'SELECT a.id, coalesce(a.nombre, a.email), a.foto_url, v.mensajes_analizados FROM "{DB_SCHEMA}"."cerebro_voz" v '
                f'JOIN "{DB_SCHEMA}"."admins" a ON a.id = v.admin_id WHERE a.activo AND v.mensajes_analizados > 0 '
                "ORDER BY v.mensajes_analizados DESC"
            )
            fotos = fotos_de("admin", [f[0] for f in filas])
            opciones = [{"id": i, "nombre": n, "foto_url": fotos.get(i) or foto, "mensajes": m, "propia": i == yo} for i, n, foto, m in filas]
            a = Admin.get(id=yo)
            elegida = a.voz_tab if a and a.voz_tab and any(o["id"] == a.voz_tab for o in opciones) else yo
        return {"elegida": elegida, "propia": yo, "opciones": opciones}

    def elegir_voz(self, sesion: dict, admin_id: int | None) -> dict:
        if not es_equipo(sesion):
            raise HTTPException(status_code=403, detail="Solo para el equipo.")
        yo = sesion["usuario_id"]
        disponibles = {o["id"] for o in self.voces(sesion)["opciones"]}
        if admin_id is not None and admin_id != yo and admin_id not in disponibles:
            raise HTTPException(status_code=422, detail="Esa persona todavía no tiene una voz aprendida.")
        with db_session:
            a = Admin.get(id=yo)
            if a is None:
                raise HTTPException(status_code=404, detail="No encontrado.")
            a.voz_tab = None if admin_id in (None, yo) else admin_id
        return self.voces(sesion)

    @staticmethod
    def ruta_foto(archivo: str):
        # Solo nombres que generamos nosotros: nada de "../" ni rutas.
        if not archivo or "/" in archivo or "\\" in archivo or archivo.startswith("."):
            raise HTTPException(status_code=404, detail="Foto no encontrada.")
        ruta = FOTOS_DIR / archivo
        if not ruta.is_file():
            raise HTTPException(status_code=404, detail="Foto no encontrada.")
        return ruta
