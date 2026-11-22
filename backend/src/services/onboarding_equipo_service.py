"""Onboarding del equipo del cliente: el coach se lo pide a un miembro (un socio que maneja otro creador) y a
ese miembro le aparece el cartel hasta que completa las mismas 49 preguntas del onboarding del mail."""

import json
from datetime import datetime

from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA
from src.models import MiembroCliente, OnboardingMiembro
from src.services.auth_service import es_equipo
from src.services.equipo_cliente_service import nombre_rol

_PREGUNTAS = 49


def _iso(d: datetime | None) -> str | None:
    return d.isoformat() + "Z" if d else None


def _limpias(datos: dict) -> dict:
    """Solo las 49 respuestas, como texto (las de varias opciones ya vienen "A, B" como en el onboarding)."""
    respuestas = {str(i): str((datos or {}).get(str(i)) or "").strip()[:5000] for i in range(1, _PREGUNTAS + 1)}
    if not any(respuestas.values()):
        raise HTTPException(status_code=422, detail="Respondé al menos una pregunta.")
    return respuestas


class OnboardingEquipoServices:
    # ---------- el miembro ----------
    @db_session
    def pendiente(self, sesion: dict) -> dict:
        miembro_id = sesion.get("miembro_id")
        if es_equipo(sesion) or not miembro_id:
            return {"pendiente": None}
        o = OnboardingMiembro.get(miembro_id=miembro_id)
        if o is None or o.completado_en:
            return {"pendiente": None}
        return {"pendiente": {"pedido_en": _iso(o.pedido_en)}}

    @db_session
    def responder(self, sesion: dict, datos: dict) -> dict:
        o = OnboardingMiembro.get(miembro_id=sesion.get("miembro_id") or 0)
        if o is None:
            raise HTTPException(status_code=404, detail="No tenés un onboarding pendiente.")
        if o.completado_en:
            return {"ok": True}
        o.respuestas_json = json.dumps(_limpias(datos), ensure_ascii=False)
        o.completado_en = datetime.utcnow()
        return {"ok": True}

    # ---------- el equipo de ATV ----------
    @db_session
    def de_cliente(self, cliente_id: int) -> dict:
        miembros = list(MiembroCliente.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."miembros_cliente" WHERE cliente_id = $cliente_id ORDER BY id'))
        pedidos = {o.miembro_id: o for o in OnboardingMiembro.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."onboarding_miembros" WHERE cliente_id = $cliente_id')}
        salida = []
        for m in miembros:
            o = pedidos.get(m.id)
            salida.append({
                "id": m.id, "nombre": m.nombre, "email": m.email, "rol": nombre_rol(m.rol),
                "estado": "completado" if o and o.completado_en else "pedido" if o else None,
                "pedido_en": _iso(o.pedido_en) if o else None, "completado_en": _iso(o.completado_en) if o else None,
                "respuestas": json.loads(o.respuestas_json) if o and o.respuestas_json else None,
            })
        return {"miembros": salida}

    @db_session
    def pedir(self, sesion: dict, miembro_id: int) -> dict:
        m = MiembroCliente.get(id=miembro_id)
        if m is None:
            raise HTTPException(status_code=404, detail="Ese miembro ya no está en el equipo.")
        if OnboardingMiembro.get(miembro_id=m.id) is None:
            OnboardingMiembro(miembro_id=m.id, cliente_id=m.cliente_id, pedido_por=sesion["usuario_id"])
        cliente_id = m.cliente_id
        return self.de_cliente(cliente_id)

    @db_session
    def cancelar(self, miembro_id: int) -> dict:
        """Deshace un pedido que todavía no completó (lo completado no se borra)."""
        o = OnboardingMiembro.get(miembro_id=miembro_id)
        if o is None:
            raise HTTPException(status_code=404, detail="No hay pedido.")
        if o.completado_en:
            raise HTTPException(status_code=409, detail="Ya lo completó.")
        cliente_id = o.cliente_id
        o.delete()
        return self.de_cliente(cliente_id)
