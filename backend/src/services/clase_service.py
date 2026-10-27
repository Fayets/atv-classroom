from datetime import datetime

from fastapi import HTTPException
from pony.orm import db_session

from src.db import db
from src.models import Clase, Nota, Progreso
from src.services.bloqueos import exigir_desbloqueado
from src.services.frente_service import BRIEFS, coach_de_clase
from src.services.video_acceso import modulo_cerrado, recursos, video
from src.utils.clase_content import serializar_recursos


def _campo_id(tipo: str) -> str:
    """De quién es el progreso: equipo de ATV, cliente o alguien del equipo del cliente."""
    return {"admin": "admin_id", "miembro": "miembro_id"}.get(tipo, "cliente_id")


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
    def obtener_detalle_clase(self, clase_id: int, usuario_id: int, tipo: str, *, ve_como: str | None) -> dict:
        with db_session:
            clase = Clase.get(id=clase_id)
            if clase is None:
                raise HTTPException(status_code=404, detail="Clase no encontrada.")
            exigir_desbloqueado(clase.seccion.programa)
            if modulo_cerrado(clase.seccion.programa, ve_como):
                raise HTTPException(status_code=403, detail="Este módulo está bloqueado.")

            progreso = _buscar_progreso(clase_id, usuario_id, tipo)
            nota = _buscar_nota(clase_id, usuario_id, tipo)

            return {
                "id": clase.id,
                "titulo": clase.titulo,
                "orden": clase.orden,
                **video(clase, ve_como),
                # Para el cartel de "Próximamente": va con el dibujo y el nombre del módulo.
                "modulo": clase.seccion.programa.titulo,
                "portada": clase.seccion.programa.cover_url,
                "duracion_segundos": clase.duracion_segundos,
                "descripcion": clase.descripcion,
                "recursos": recursos(clase, ve_como),
                "seccion_id": clase.seccion.id,
                "programa_id": clase.seccion.programa.id,
                "completado": progreso.completado if progreso is not None else False,
                "completado_en": progreso.completado_en.isoformat()
                if progreso is not None and progreso.completado_en is not None
                else None,
                "nota": nota.contenido if nota is not None else None,
                "resumen": BRIEFS.get(str(clase.id), {}).get("resumen"),
                "claves": BRIEFS.get(str(clase.id), {}).get("claves", []),
                "coach": coach_de_clase(clase),
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
            exigir_desbloqueado(clase.seccion.programa)

            progreso = _buscar_progreso(clase_id, usuario_id, tipo)

            if progreso is not None:
                progreso.completado = completado
                progreso.completado_en = datetime.utcnow() if completado else None
            else:
                kwargs: dict = {
                    "clase_id": clase_id,
                    "completado": completado,
                }
                kwargs[_campo_id(tipo)] = usuario_id
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
            exigir_desbloqueado(clase.seccion.programa)

            nota = _buscar_nota(clase_id, usuario_id, tipo)

            if nota is not None:
                nota.contenido = texto
            else:
                kwargs: dict = {
                    "clase_id": clase_id,
                    "contenido": texto,
                }
                kwargs[_campo_id(tipo)] = usuario_id
                nota = Nota(**kwargs)
                db.flush()

            return {
                "clase_id": clase_id,
                "contenido": nota.contenido,
                "creado_en": nota.creado_en.isoformat()
                if isinstance(nota.creado_en, datetime)
                else nota.creado_en,
            }
