from fastapi import HTTPException
from pony.orm import db_session

from src.db import db
from src.models import Clase, ClaseRecurso, Programa, Progreso, Seccion
from src.storage.recursos import eliminar_archivo_subido, guardar_pdf_clase
from src.utils.clase_content import serializar_recursos, sincronizar_recursos, _tipo_recurso


def _cover_url(programa: Programa) -> str | None:
    if programa.cover_url:
        return programa.cover_url
    if programa.slug:
        return f"/modules/{programa.slug}.png"
    return None


def _serializar_clase(clase: Clase) -> dict:
    return {
        "id": clase.id,
        "titulo": clase.titulo,
        "orden": clase.orden,
        "video_url": clase.video_url,
        "duracion_segundos": clase.duracion_segundos,
        "descripcion": clase.descripcion,
        "recursos": serializar_recursos(clase),
    }


def _serializar_seccion(seccion: Seccion) -> dict:
    clases = sorted(list(seccion.clases), key=lambda c: c.orden)
    return {
        "id": seccion.id,
        "titulo": seccion.titulo,
        "orden": seccion.orden,
        "clases": [_serializar_clase(clase) for clase in clases],
    }


def _serializar_programa_detalle(programa: Programa) -> dict:
    secciones = sorted(list(programa.secciones), key=lambda s: s.orden)
    return {
        "id": programa.id,
        "titulo": programa.titulo,
        "slug": programa.slug,
        "descripcion": programa.descripcion,
        "orden": programa.orden,
        "cover_url": _cover_url(programa),
        "secciones": [_serializar_seccion(seccion) for seccion in secciones],
    }


def _eliminar_clase_cascada(clase_id: int) -> None:
    for progreso in list(Progreso.select(clase_id=clase_id)):
        progreso.delete()
    clase = Clase.get(id=clase_id)
    if clase is not None:
        for recurso in list(clase.recursos):
            eliminar_archivo_subido(recurso.url)
            recurso.delete()
        clase.delete()


def _eliminar_seccion_cascada(seccion: Seccion) -> None:
    for clase in list(seccion.clases):
        _eliminar_clase_cascada(clase.id)
    seccion.delete()


class AdminServices:
    def listar_programas(self) -> list[dict]:
        with db_session:
            programas = sorted(list(Programa.select()[:]), key=lambda p: p.orden)
            resultado = []
            for programa in programas:
                secciones = list(programa.secciones)
                total_clases = sum(len(list(s.clases)) for s in secciones)
                resultado.append(
                    {
                        "id": programa.id,
                        "titulo": programa.titulo,
                        "slug": programa.slug,
                        "descripcion": programa.descripcion,
                        "orden": programa.orden,
                        "cover_url": _cover_url(programa),
                        "total_secciones": len(secciones),
                        "total_clases": total_clases,
                    }
                )
            return resultado

    def obtener_programa(self, programa_id: int) -> dict:
        with db_session:
            programa = Programa.get(id=programa_id)
            if programa is None:
                raise HTTPException(status_code=404, detail="Programa no encontrado.")
            return _serializar_programa_detalle(programa)

    def crear_programa(self, data: dict) -> dict:
        with db_session:
            slug = data.get("slug")
            if slug:
                existente = Programa.get(slug=slug)
                if existente is not None:
                    raise HTTPException(status_code=409, detail="El slug ya existe.")

            programa = Programa(
                titulo=data["titulo"],
                slug=slug,
                descripcion=data.get("descripcion"),
                orden=data.get("orden", 0),
                cover_url=data.get("cover_url"),
            )
            db.flush()
            return _serializar_programa_detalle(programa)

    def actualizar_programa(self, programa_id: int, data: dict) -> dict:
        with db_session:
            programa = Programa.get(id=programa_id)
            if programa is None:
                raise HTTPException(status_code=404, detail="Programa no encontrado.")

            if "slug" in data and data["slug"] != programa.slug:
                slug = data["slug"]
                if slug:
                    existente = Programa.get(slug=slug)
                    if existente is not None and existente.id != programa_id:
                        raise HTTPException(status_code=409, detail="El slug ya existe.")
                programa.slug = slug

            for campo in ("titulo", "descripcion", "orden", "cover_url"):
                if campo in data and data[campo] is not None:
                    setattr(programa, campo, data[campo])

            return _serializar_programa_detalle(programa)

    def eliminar_programa(self, programa_id: int) -> None:
        with db_session:
            programa = Programa.get(id=programa_id)
            if programa is None:
                raise HTTPException(status_code=404, detail="Programa no encontrado.")

            for seccion in list(programa.secciones):
                _eliminar_seccion_cascada(seccion)
            programa.delete()

    def crear_seccion(self, programa_id: int, data: dict) -> dict:
        with db_session:
            programa = Programa.get(id=programa_id)
            if programa is None:
                raise HTTPException(status_code=404, detail="Programa no encontrado.")

            seccion = Seccion(
                programa=programa,
                titulo=data["titulo"],
                orden=data.get("orden", 0),
            )
            db.flush()
            return _serializar_seccion(seccion)

    def actualizar_seccion(self, seccion_id: int, data: dict) -> dict:
        with db_session:
            seccion = Seccion.get(id=seccion_id)
            if seccion is None:
                raise HTTPException(status_code=404, detail="Sección no encontrada.")

            if "titulo" in data and data["titulo"] is not None:
                seccion.titulo = data["titulo"]
            if "orden" in data and data["orden"] is not None:
                seccion.orden = data["orden"]

            return _serializar_seccion(seccion)

    def eliminar_seccion(self, seccion_id: int) -> None:
        with db_session:
            seccion = Seccion.get(id=seccion_id)
            if seccion is None:
                raise HTTPException(status_code=404, detail="Sección no encontrada.")
            _eliminar_seccion_cascada(seccion)

    def crear_clase(self, seccion_id: int, data: dict) -> dict:
        with db_session:
            seccion = Seccion.get(id=seccion_id)
            if seccion is None:
                raise HTTPException(status_code=404, detail="Sección no encontrada.")

            clase = Clase(
                seccion=seccion,
                titulo=data["titulo"],
                orden=data.get("orden", 0),
                video_url=data.get("video_url"),
                duracion_segundos=data.get("duracion_segundos"),
                descripcion=data.get("descripcion"),
            )
            db.flush()
            sincronizar_recursos(
                clase,
                [item for item in data.get("recursos", []) if item],
            )
            db.flush()
            return _serializar_clase(clase)

    def actualizar_clase(self, clase_id: int, data: dict) -> dict:
        with db_session:
            clase = Clase.get(id=clase_id)
            if clase is None:
                raise HTTPException(status_code=404, detail="Clase no encontrada.")

            for campo in ("titulo", "orden", "video_url", "duracion_segundos", "descripcion"):
                if campo in data:
                    setattr(clase, campo, data[campo])

            if "recursos" in data:
                sincronizar_recursos(clase, data["recursos"] or [])
                db.flush()

            return _serializar_clase(clase)

    def eliminar_clase(self, clase_id: int) -> None:
        with db_session:
            clase = Clase.get(id=clase_id)
            if clase is None:
                raise HTTPException(status_code=404, detail="Clase no encontrada.")
            _eliminar_clase_cascada(clase_id)

    def subir_recurso_pdf(
        self,
        clase_id: int,
        contenido: bytes,
        titulo: str | None,
        nombre_original: str | None,
    ) -> dict:
        with db_session:
            clase = Clase.get(id=clase_id)
            if clase is None:
                raise HTTPException(status_code=404, detail="Clase no encontrada.")

            try:
                url, titulo_final = guardar_pdf_clase(
                    programa_slug=clase.seccion.programa.slug or f"programa-{clase.seccion.programa.id}",
                    clase_id=clase.id,
                    contenido=contenido,
                    titulo=titulo,
                    nombre_original=nombre_original,
                )
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

            orden = len(list(clase.recursos))
            recurso = ClaseRecurso(
                clase=clase,
                titulo=titulo_final,
                url=url,
                orden=orden,
            )
            db.flush()
            return {
                "id": recurso.id,
                "titulo": recurso.titulo,
                "url": recurso.url,
                "orden": recurso.orden,
                "tipo": _tipo_recurso(recurso.url),
            }

    def eliminar_recurso(self, recurso_id: int) -> None:
        with db_session:
            recurso = ClaseRecurso.get(id=recurso_id)
            if recurso is None:
                raise HTTPException(status_code=404, detail="Recurso no encontrado.")
            eliminar_archivo_subido(recurso.url)
            recurso.delete()
