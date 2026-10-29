"""Acciones rápidas del chat: mensajes armados que el coach manda con un clic.

Cada persona del equipo guarda las suyas. Si todavía no tiene una para su agenda, se le sugiere
el link de agenda que más usó en sus propios mensajes (Calendly, cal.com…), así no lo tiene que buscar.
El texto puede llevar {nombre}: al mandarlo se cambia por el nombre del cliente.
"""

import re
from collections import Counter

from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.models import AccionRapida
from src.services.auth_service import es_equipo

MAX_ACCIONES = 12
MAX_NOMBRE = 40
MAX_TEXTO = 2000

_AGENDA = re.compile(
    r"https?://(?:www\.)?(?:calendly\.com|cal\.com|zcal\.co|tidycal\.com|savvycal\.com|calendar\.app\.google|calendar\.google\.com/calendar/appointments)/[^\s<>()\"']+",
    re.I,
)


def _yo(sesion: dict) -> int:
    if not es_equipo(sesion):
        raise HTTPException(status_code=403, detail="Las acciones rápidas son para el equipo.")
    return sesion["usuario_id"]


def _dict(a: AccionRapida) -> dict:
    return {"id": a.id, "nombre": a.nombre, "texto": a.texto, "orden": a.orden}


def _limpiar(nombre: str | None, texto: str | None) -> tuple[str, str]:
    nombre = (nombre or "").strip()
    texto = (texto or "").strip()
    if not nombre:
        raise HTTPException(status_code=422, detail="Ponele un nombre al botón.")
    if not texto:
        raise HTTPException(status_code=422, detail="Escribí el mensaje que manda.")
    if len(nombre) > MAX_NOMBRE:
        raise HTTPException(status_code=422, detail=f"El nombre puede tener hasta {MAX_NOMBRE} caracteres.")
    if len(texto) > MAX_TEXTO:
        raise HTTPException(status_code=422, detail=f"El mensaje puede tener hasta {MAX_TEXTO} caracteres.")
    return nombre, texto


def link_de_agenda(admin_id: int) -> str | None:
    """El link de agenda que esta persona más mandó en sus mensajes (los recientes pesan igual que los viejos)."""
    filas = db.select(
        f'SELECT texto FROM "{DB_SCHEMA}"."mensajes_canal" '
        "WHERE autor_tipo = 'admin' AND autor_id = $admin_id "
        "AND NOT borrado AND texto ~* '(calendly\\.com|cal\\.com|zcal\\.co|tidycal\\.com|savvycal\\.com|calendar\\.app\\.google|calendar\\.google\\.com/calendar/appointments)' "
        "ORDER BY id DESC LIMIT 300",
        {"admin_id": admin_id},
    )
    return agenda_mas_usada(filas)


def agenda_mas_usada(textos: list[str]) -> str | None:
    # Sin la query: Calendly le agrega el mes o el día que estabas mirando (?month=2025-10).
    cuenta = Counter(u.split("?")[0].split("#")[0].rstrip(".,;:!?/") for t in textos for u in _AGENDA.findall(t or ""))
    return cuenta.most_common(1)[0][0] if cuenta else None


def _de(admin_id: int) -> list[AccionRapida]:
    return list(AccionRapida.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."acciones_rapidas" WHERE admin_id = $admin_id ORDER BY orden, id'))


class AccionesServices:
    def listar(self, sesion: dict) -> dict:
        yo = _yo(sesion)
        with db_session:
            acciones = [_dict(a) for a in _de(yo)]
            sugeridas = []
            link = link_de_agenda(yo)
            if link and not any(link in a["texto"] for a in acciones):
                sugeridas.append({"nombre": "Enviar mi agenda", "texto": f"{{nombre}}, te dejo mi link para agendar: {link}", "origen": "Lo sacamos de tus mensajes"})
        return {"acciones": acciones, "sugeridas": sugeridas}

    def crear(self, sesion: dict, nombre: str, texto: str) -> dict:
        yo = _yo(sesion)
        nombre, texto = _limpiar(nombre, texto)
        with db_session:
            actuales = _de(yo)
            if len(actuales) >= MAX_ACCIONES:
                raise HTTPException(status_code=422, detail=f"Podés tener hasta {MAX_ACCIONES} acciones.")
            a = AccionRapida(admin_id=yo, nombre=nombre, texto=texto, orden=max([x.orden for x in actuales], default=-1) + 1)
            a.flush()
            return _dict(a)

    def _propia(self, yo: int, accion_id: int) -> AccionRapida:
        a = AccionRapida.get(id=accion_id)
        if a is None or a.admin_id != yo:
            raise HTTPException(status_code=404, detail="No existe esa acción.")
        return a

    def editar(self, sesion: dict, accion_id: int, nombre: str, texto: str) -> dict:
        yo = _yo(sesion)
        nombre, texto = _limpiar(nombre, texto)
        with db_session:
            a = self._propia(yo, accion_id)
            a.nombre, a.texto = nombre, texto
            return _dict(a)

    def borrar(self, sesion: dict, accion_id: int) -> dict:
        yo = _yo(sesion)
        with db_session:
            self._propia(yo, accion_id).delete()
        return {"ok": True}

    def clases(self, sesion: dict) -> list[dict]:
        """Las clases que el coach puede mandarle a un cliente desde Acciones rápidas: las mismas que usa la Guía
        (con contenido, sin "Próximamente"), con su módulo y el link directo."""
        from src.services import sops_service

        if not es_equipo(sesion):
            raise HTTPException(status_code=403, detail="Solo para el equipo.")
        # La portada y el orden de cada módulo, para elegir primero el módulo como en el classroom.
        with db_session:
            modulos = {
                titulo: {"portada": portada, "orden": orden}
                for titulo, portada, orden in db.select(f'SELECT titulo, cover_url, orden FROM "{DB_SCHEMA}"."programa"')
            }
        return [
            {
                "id": c["id"], "titulo": c["titulo"], "modulo": c["modulo"], "url": c["url"], "fuente": c["fuente"],
                "portada": (modulos.get(c["modulo"]) or {}).get("portada"), "orden": (modulos.get(c["modulo"]) or {}).get("orden", 999),
            }
            for c in sops_service.catalogo()
        ]
