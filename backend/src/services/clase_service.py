from datetime import datetime

from fastapi import HTTPException
from pony.orm import db_session

from src.db import db
from src.models import Clase, Nota, Progreso
from src.utils.clase_content import serializar_recursos


def _campo_id(tipo: str) -> str:
    return "admin_id" if tipo == "admin" else "cliente_id"


def _buscar_progreso(clase_id: int, usuario_id: int, tipo: str) -> Progreso | None:
    campo_id = _campo_id(tipo)
    progresos = list(Progreso.select()[:])
    coincidencias = [
        progreso
        for progreso in progresos
        if progreso.clase_id == clase_id and getattr(progreso, campo_id) == usuario_id
    ]
    return coincidencias[0] if coincidencias else None


def _buscar_nota(clase_id: int, usuario_id: int, tipo: str) -> Nota | None:
    campo_id = _campo_id(tipo)
    notas = list(Nota.select()[:])
    coincidencias = [
        nota
        for nota in notas
        if nota.clase_id == clase_id and getattr(nota, campo_id) == usuario_id
    ]
    return coincidencias[0] if coincidencias else None


class ClaseServices:
    def obtener_detalle_clase(self, clase_id: int, usuario_id: int, tipo: str) -> dict:
        with db_session:
            clase = Clase.get(id=clase_id)
            if clase is None:
                raise HTTPException(status_code=404, detail="Clase no encontrada.")

            progreso = _buscar_progreso(clase_id, usuario_id, tipo)
            nota = _buscar_nota(clase_id, usuario_id, tipo)

            return {
                "id": clase.id,
                "titulo": clase.titulo,
                "orden": clase.orden,
                "video_url": clase.video_url,
                "duracion_segundos": clase.duracion_segundos,
                "descripcion": clase.descripcion,
                "recursos": serializar_recursos(clase),
                "seccion_id": clase.seccion.id,
                "programa_id": clase.seccion.programa.id,
                "completado": progreso.completado if progreso is not None else False,
                "completado_en": progreso.completado_en.isoformat()
                if progreso is not None and progreso.completado_en is not None
                else None,
                "nota": nota.contenido if nota is not None else None,
            }

    def marcar_progreso(
        self,
        clase_id: int,
        usuario_id: int,
        tipo: str,
        completado: bool,
    ) -> dict:
        with db_session:
            clase = Clase.get(id=clase_id)
            if clase is None:
                raise HTTPException(status_code=404, detail="Clase no encontrada.")

            progreso = _buscar_progreso(clase_id, usuario_id, tipo)

            if progreso is not None:
                progreso.completado = completado
                progreso.completado_en = datetime.utcnow() if completado else None
            else:
                kwargs: dict = {
                    "clase_id": clase_id,
                    "completado": completado,
                }
                if tipo == "admin":
                    kwargs["admin_id"] = usuario_id
                else:
                    kwargs["cliente_id"] = usuario_id
                if completado:
                    kwargs["completado_en"] = datetime.utcnow()
                progreso = Progreso(**kwargs)
                db.flush()

            return {
                "clase_id": clase_id,
                "completado": progreso.completado,
                "completado_en": progreso.completado_en.isoformat()
                if progreso.completado_en is not None
                else None,
            }

    def guardar_nota(
        self,
        clase_id: int,
        usuario_id: int,
        tipo: str,
        texto: str,
    ) -> dict:
        with db_session:
            clase = Clase.get(id=clase_id)
            if clase is None:
                raise HTTPException(status_code=404, detail="Clase no encontrada.")

            nota = _buscar_nota(clase_id, usuario_id, tipo)

            if nota is not None:
                nota.contenido = texto
            else:
                kwargs: dict = {
                    "clase_id": clase_id,
                    "contenido": texto,
                }
                if tipo == "admin":
                    kwargs["admin_id"] = usuario_id
                else:
                    kwargs["cliente_id"] = usuario_id
                nota = Nota(**kwargs)
                db.flush()

            return {
                "clase_id": clase_id,
                "contenido": nota.contenido,
                "creado_en": nota.creado_en.isoformat()
                if isinstance(nota.creado_en, datetime)
                else nota.creado_en,
            }
