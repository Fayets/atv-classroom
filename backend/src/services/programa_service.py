import re

from fastapi import HTTPException
from pony.orm import db_session

from src.models import Clase, Programa, Progreso, Seccion
from src.services.bloqueos import exigir_desbloqueado, programa_bloqueado
from src.services.video_acceso import modulo_cerrado, recursos, video
from src.utils.clase_content import serializar_recursos


def _cover_url(programa: Programa) -> str | None:
    if programa.cover_url:
        return programa.cover_url
    if programa.slug:
        return f"/modules/{programa.slug}.jpg"
    return None


def _campo_id(tipo: str) -> str:
    """De quién es el progreso: equipo de ATV, cliente o alguien del equipo del cliente."""
    return {"admin": "admin_id", "miembro": "miembro_id"}.get(tipo, "cliente_id")


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


def _serializar_clase(clase: Clase, usuario_id: int, tipo: str, ve_como: str | None) -> dict:
    return {
        "id": clase.id,
        "titulo": clase.titulo,
        "orden": clase.orden,
        **video(clase, ve_como),
        "duracion_segundos": clase.duracion_segundos,
        "completado": _clase_completada(clase.id, usuario_id, tipo),
    }


class ProgramaServices:
    def listar_programas(self, usuario_id: int, tipo: str, *, ve_como: str | None) -> list[dict]:
        with db_session:
            programas = list(Programa.select()[:])
            cerrados = {p.id for p in programas if modulo_cerrado(p, ve_como)}
            # Los bloqueados van al final, en su orden.
            programas_ordenados = sorted(programas, key=lambda programa: (programa_bloqueado(programa) or programa.id in cerrados, programa.orden))

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
                    "total_clases": len(_clases_de_programa(programa.id)),
                    "bloqueado": programa_bloqueado(programa) or programa.id in cerrados,
                    # "pronto": todavía no se abre para nadie; "plan": no está en el plan de quien mira.
                    "motivo_bloqueo": "pronto" if programa_bloqueado(programa) else ("plan" if programa.id in cerrados else None),
                }
                for programa in programas_ordenados
            ]

    def continuar(self, usuario_id: int, tipo: str, *, ve_como: str | None) -> dict | None:
        """"Seguí donde quedaste": la clase que sigue a la última que completó (en su módulo, y si lo terminó,
        en el próximo). Si todavía no completó ninguna, la primera del classroom."""
        campo = _campo_id(tipo)
        with db_session:
            mios = [p for p in list(Progreso.select()) if getattr(p, campo) == usuario_id]
            hechas = {p.clase_id for p in mios if p.completado}
            ultima = max((p for p in mios if p.completado and p.completado_en), key=lambda p: p.completado_en, default=None)
            modulos = []
            for programa in sorted(list(Programa.select()), key=lambda p: p.orden):
                if programa_bloqueado(programa) or modulo_cerrado(programa, ve_como):
                    continue
                clases = [
                    c for s in sorted(programa.secciones, key=lambda s: s.orden) for c in sorted(s.clases, key=lambda c: c.orden)
                    if c.titulo and not c.titulo.strip().lower().startswith("próximamente")
                ]
                if clases:
                    modulos.append((programa, clases))
            if not modulos:
                return None
            inicio = 0
            if ultima is not None:
                inicio = next((i for i, (_, clases) in enumerate(modulos) if any(c.id == ultima.clase_id for c in clases)), 0)
            # Desde el módulo de la última que completó, la primera que le falta; si no queda ninguna, desde el principio.
            for programa, clases in modulos[inicio:] + modulos[:inicio]:
                desde = 0
                if ultima is not None and programa is modulos[inicio][0]:
                    desde = next((i + 1 for i, c in enumerate(clases) if c.id == ultima.clase_id), 0)
                pendiente = next((c for c in clases[desde:] + clases[:desde] if c.id not in hechas), None)
                if pendiente is not None:
                    hechas_aca = sum(1 for c in clases if c.id in hechas)
                    return {
                        "programa_id": programa.id,
                        "modulo": programa.titulo,
                        "clase_id": pendiente.id,
                        "titulo": pendiente.titulo,
                        "numero": clases.index(pendiente) + 1,
                        "total": len(clases),
                        "porcentaje": round(hechas_aca / len(clases) * 100),
                        "empezada": ultima is not None,
                    }
            return None

    def listar_sops(self, *, ve_como: str | None) -> list[dict]:
        """Las clases que traen documentos (los SOPs), por módulo y en el orden del classroom.
        Sin los módulos bloqueados ni las clases "Próximamente"."""
        with db_session:
            modulos = []
            for programa in sorted(Programa.select()[:], key=lambda p: p.orden):
                if programa_bloqueado(programa):
                    continue
                sops = []
                for seccion in sorted(programa.secciones, key=lambda s: s.orden):
                    for clase in sorted(seccion.clases, key=lambda c: c.orden):
                        if not clase.titulo or clase.titulo.strip().lower().startswith("próximamente"):
                            continue
                        # Los links a grupos de WhatsApp no son SOPs; cada clase es un SOP con sus documentos.
                        docs = [r for r in recursos(clase, ve_como) if not re.search(r"whatsapp\.com|wa\.me", r["url"])]
                        if docs:
                            sops.append({"clase_id": clase.id, "titulo": clase.titulo, "seccion": seccion.titulo, "documentos": docs})
                if sops:
                    modulos.append({"programa_id": programa.id, "modulo": programa.titulo, "sops": sops})
            return modulos

    def obtener_detalle_programa(
        self,
        programa_id: int,
        usuario_id: int,
        tipo: str,
        *,
        ve_como: str | None,
    ) -> dict:
        with db_session:
            programa = Programa.get(id=programa_id)
            if programa is None:
                raise HTTPException(status_code=404, detail="Programa no encontrado.")
            exigir_desbloqueado(programa)
            if modulo_cerrado(programa, ve_como):
                raise HTTPException(status_code=403, detail="Este módulo está bloqueado.")

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
                            _serializar_clase(clase, usuario_id, tipo, ve_como)
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
