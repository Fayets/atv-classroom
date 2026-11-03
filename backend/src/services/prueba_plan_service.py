"""Plan de prueba por unos días (acción rápida "Boost 7 días" en el panel del chat).

Le pone el plan en la ficha de atv-clients y a los DIAS días lo devuelve al que tenía. Lo hacen los mismos que
cambian el plan arrastrando el chat (admins, Ventas y Sistemas). El acceso (fecha de vencimiento) no se toca."""

import logging
from datetime import datetime, timedelta

from fastapi import HTTPException
from pony.orm import db_session

from src.models import Canal, ClienteExterno, PruebaPlan
from src.services.auth_service import actualizar_plan_en_sesiones, ve_plata

DIAS = 7
PLAN = "boost"
logger = logging.getLogger("prueba_plan")


def _iso(d: datetime | None) -> str | None:
    return d.isoformat(timespec="seconds") + "Z" if d else None


def _activa(cliente_id: int) -> PruebaPlan | None:
    return next((p for p in list(PruebaPlan.select()) if p.cliente_id == cliente_id and p.terminada_en is None), None)


def _dict(p: PruebaPlan | None) -> dict | None:
    if p is None:
        return None
    return {"plan": p.plan, "plan_anterior": p.plan_anterior, "desde": _iso(p.desde), "hasta": _iso(p.hasta)}


def _devolver(p: PruebaPlan) -> int | None:
    """Termina la prueba y devuelve el plan de antes (si nadie lo cambió a mano). Devuelve el cliente si cambió."""
    p.terminada_en = datetime.utcnow()
    c = ClienteExterno.get(id=p.cliente_id)
    if c is None or (c.plan_actual or "").lower() != p.plan or not p.plan_anterior:
        return None
    c.plan_actual = p.plan_anterior
    return c.id


class PruebaPlanServices:
    def _cliente_del_canal(self, canal_id: int) -> ClienteExterno:
        canal = Canal.get(id=canal_id)
        if canal is None or canal.tipo != "cliente" or not canal.cliente_id:
            raise HTTPException(status_code=404, detail="Ese chat no es de un cliente.")
        c = ClienteExterno.get(id=canal.cliente_id)
        if c is None:
            raise HTTPException(status_code=404, detail="El cliente no tiene ficha.")
        return c

    def estado(self, sesion: dict, canal_id: int) -> dict:
        with db_session:
            c = self._cliente_del_canal(canal_id)
            return {"prueba": _dict(_activa(c.id)), "puede": ve_plata(sesion), "plan": c.plan_actual, "dias": DIAS}

    def dar(self, sesion: dict, canal_id: int) -> dict:
        if not ve_plata(sesion):
            raise HTTPException(status_code=403, detail="Solo admins, Ventas o Sistemas dan el Boost de prueba.")
        with db_session:
            c = self._cliente_del_canal(canal_id)
            if _activa(c.id):
                raise HTTPException(status_code=409, detail="Ya tiene una prueba en curso.")
            if (c.plan_actual or "").lower() == PLAN:
                raise HTTPException(status_code=409, detail="Ya está en Boost.")
            ahora = datetime.utcnow()
            p = PruebaPlan(cliente_id=c.id, plan=PLAN, plan_anterior=c.plan_actual, desde=ahora, hasta=ahora + timedelta(days=DIAS),
                           admin_id=sesion.get("usuario_id"))
            c.plan_actual = PLAN
            cid, salida = c.id, _dict(p)
        actualizar_plan_en_sesiones(cid, PLAN)
        return {"prueba": salida}

    def terminar(self, sesion: dict, canal_id: int) -> dict:
        if not ve_plata(sesion):
            raise HTTPException(status_code=403, detail="Solo admins, Ventas o Sistemas terminan el Boost de prueba.")
        with db_session:
            c = self._cliente_del_canal(canal_id)
            p = _activa(c.id)
            if p is None:
                raise HTTPException(status_code=404, detail="No tiene una prueba en curso.")
            vuelto = _devolver(p)
            plan = c.plan_actual
        if vuelto:
            actualizar_plan_en_sesiones(vuelto, plan)
        return {"prueba": None, "plan": plan}


def vencer() -> int:
    """Las pruebas que ya pasaron su fecha vuelven al plan de antes. Corre cada pocos minutos."""
    cambios = []
    with db_session:
        ahora = datetime.utcnow()
        for p in [x for x in list(PruebaPlan.select()) if x.terminada_en is None and x.hasta <= ahora]:
            vuelto = _devolver(p)
            if vuelto:
                cambios.append((vuelto, p.plan_anterior))
    for cid, plan in cambios:
        actualizar_plan_en_sesiones(cid, plan)
        logger.info("Prueba de plan vencida: cliente %s vuelve a %s", cid, plan)
    return len(cambios)
