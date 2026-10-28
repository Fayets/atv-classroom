"""Live sessions: cualquiera del equipo sube la grabación de una clase en vivo (link de Fathom, YouTube, Loom,
Drive…) y queda como clase nueva, arriba de todo, en el módulo de Live Sessions del plan."""

from datetime import date

from fastapi import HTTPException
from pony.orm import db_session

from src.models import Admin, Clase, ClaseRecurso, Programa, Seccion
from src.services.auth_service import es_equipo

PREFIJO = "live-sessions"


def _equipo(sesion: dict) -> None:
    if not es_equipo(sesion) or sesion.get("miembro_id"):
        raise HTTPException(status_code=403, detail="Las live sessions las sube el equipo.")


def _modulo(programa_id: int) -> Programa:
    p = Programa.get(id=programa_id)
    if p is None or not (p.slug or "").startswith(PREFIJO):
        raise HTTPException(status_code=404, detail="Ese no es un módulo de live sessions.")
    return p


class LiveSessionsServices:
    def modulos(self, sesion: dict) -> list[dict]:
        _equipo(sesion)
        with db_session:
            return [
                {"id": p.id, "titulo": p.titulo}
                for p in sorted(list(Programa.select()), key=lambda p: p.orden)
                if (p.slug or "").startswith(PREFIJO)
            ]

    def subir(self, sesion: dict, programa_id: int, titulo: str, url: str, fecha: date | None, descripcion: str | None) -> dict:
        _equipo(sesion)
        titulo = " ".join((titulo or "").split())
        url = (url or "").strip()
        if not titulo or len(titulo) > 160:
            raise HTTPException(status_code=422, detail="Poné el título de la clase.")
        if not url.startswith(("http://", "https://")):
            raise HTTPException(status_code=422, detail="Pegá el link de la grabación (Fathom, YouTube, Loom, Drive…).")
        fecha = fecha or date.today()
        with db_session:
            p = _modulo(programa_id)
            secciones = sorted(p.secciones, key=lambda s: s.orden)
            seccion = secciones[0] if secciones else Seccion(programa=p, titulo="CLASES", orden=1)
            # La más nueva arriba: una posición antes que la primera.
            ordenes = [c.orden for s in p.secciones for c in s.clases]
            yo = Admin.get(id=sesion["usuario_id"])
            quien = (yo.nombre if yo else None) or "el equipo"
            pie = f"Live session del {fecha.strftime('%d/%m/%Y')} · subida por {quien}."
            clase = Clase(
                seccion=seccion,
                titulo=titulo,
                orden=(min(ordenes) - 1) if ordenes else 1,
                video_url=url,
                descripcion=f"{descripcion.strip()}\n\n{pie}" if (descripcion or "").strip() else pie,
            )
            # Siempre el link a mano: si la plataforma no deja verla adentro del classroom, se abre desde ahí.
            ClaseRecurso(clase=clase, titulo="Ver la grabación", url=url, orden=0)
            clase.flush()
            return {"id": clase.id, "programa_id": p.id, "titulo": clase.titulo}

    def borrar(self, sesion: dict, clase_id: int) -> None:
        _equipo(sesion)
        with db_session:
            c = Clase.get(id=clase_id)
            if c is None or not (c.seccion.programa.slug or "").startswith(PREFIJO):
                raise HTTPException(status_code=404, detail="No es una live session.")
            for r in list(c.recursos):
                r.delete()
            c.delete()
