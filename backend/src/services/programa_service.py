from fastapi import HTTPException
from pony.orm import db_session

from src.models import Clase, Programa, Progreso, Seccion


def _cover_url(programa: Programa) -> str | None:
    if programa.cover_url:
        return programa.cover_url
    if programa.slug:
        return f"/modules/{programa.slug}.png"
    return None


def _campo_id(tipo: str) -> str:
    return "admin_id" if tipo == "admin" else "cliente_id"


def _clases_de_programa(programa_id: int) -> list[Clase]:
    clases: list[Clase] = []
    secciones = list(Seccion.select()[:])
    for seccion in secciones:
        if seccion.programa.id != programa_id:
            continue
        clases.extend(list(seccion.clases))
    return clases


def _clase_completada(clase_id: int, usuario_id: int, tipo: str) -> bool:
    campo_id = _campo_id(tipo)
    progresos = list(Progreso.select()[:])
    for progreso in progresos:
        if progreso.clase_id != clase_id:
            continue
        if getattr(progreso, campo_id) != usuario_id:
            continue
        if progreso.completado:
            return True
    return False


def _calcular_porcentaje_programa(programa_id: int, usuario_id: int, tipo: str) -> int:
    clases = _clases_de_programa(programa_id)
    total_clases = len(clases)
    if total_clases == 0:
        return 0

    clase_ids = {clase.id for clase in clases}
    campo_id = _campo_id(tipo)
    completadas = 0
    progresos = list(Progreso.select()[:])
    for progreso in progresos:
        if progreso.clase_id not in clase_ids:
            continue
        if getattr(progreso, campo_id) != usuario_id:
            continue
        if progreso.completado:
            completadas += 1

    return round(completadas / total_clases * 100)


def _serializar_clase(clase: Clase, usuario_id: int, tipo: str) -> dict:
    return {
        "id": clase.id,
        "titulo": clase.titulo,
        "orden": clase.orden,
        "video_url": clase.video_url,
        "duracion_segundos": clase.duracion_segundos,
        "completado": _clase_completada(clase.id, usuario_id, tipo),
    }


class ProgramaServices:
    def listar_programas(self, usuario_id: int, tipo: str) -> list[dict]:
        with db_session:
            programas = list(Programa.select()[:])
            programas_ordenados = sorted(programas, key=lambda programa: programa.orden)

            return [
                {
                    "id": programa.id,
                    "titulo": programa.titulo,
                    "slug": programa.slug,
                    "descripcion": programa.descripcion,
                    "cover_url": _cover_url(programa),
                    "porcentaje_progreso": _calcular_porcentaje_programa(
                        programa.id,
                        usuario_id,
                        tipo,
                    ),
                }
                for programa in programas_ordenados
            ]

    def obtener_detalle_programa(
        self,
        programa_id: int,
        usuario_id: int,
        tipo: str,
    ) -> dict:
        with db_session:
            programa = Programa.get(id=programa_id)
            if programa is None:
                raise HTTPException(status_code=404, detail="Programa no encontrado.")

            secciones = list(Seccion.select()[:])
            secciones_programa = [
                seccion for seccion in secciones if seccion.programa.id == programa_id
            ]
            secciones_ordenadas = sorted(secciones_programa, key=lambda seccion: seccion.orden)

            secciones_data = []
            for seccion in secciones_ordenadas:
                clases = list(seccion.clases)
                clases_ordenadas = sorted(clases, key=lambda clase: clase.orden)
                secciones_data.append(
                    {
                        "id": seccion.id,
                        "titulo": seccion.titulo,
                        "orden": seccion.orden,
                        "clases": [
                            _serializar_clase(clase, usuario_id, tipo)
                            for clase in clases_ordenadas
                        ],
                    }
                )

            return {
                "id": programa.id,
                "titulo": programa.titulo,
                "slug": programa.slug,
                "descripcion": programa.descripcion,
                "cover_url": _cover_url(programa),
                "orden": programa.orden,
                "porcentaje_progreso": _calcular_porcentaje_programa(
                    programa.id,
                    usuario_id,
                    tipo,
                ),
                "secciones": secciones_data,
            }
