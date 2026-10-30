"""Cierre de mes: el formulario que antes era un Typeform, adentro del classroom.

Un admin lo manda (carpeta "Cierres de mes" del escritorio) y desde ahí cuentan 3 días. Durante el plazo el
cliente ve un aviso; vencido, un cartel que vuelve cada pocas acciones hasta que lo complete. Como ya sabemos
quién es, no se le pide nombre, canal ni fecha; oferta y avatar solo si cambiaron (se le muestra lo del mes
anterior), y las tasas del embudo se calculan solas."""

import json
from datetime import datetime, timedelta

from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.models import CierreEnvio, CierreRespuesta, ClienteExterno
from src.services.auth_service import _tiene_acceso, es_equipo, nombre_titular

PLAZO_DIAS = 3
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
CUELLOS = ["Mentalidad", "Equipo", "Marketing y Contenido", "Ventas", "Sistemas y operaciones"]
NUMEROS = ["reels", "historias", "youtube", "cta_historias", "cta_reels", "conversaciones", "agendas", "llamadas", "ventas", "cash", "facturacion"]
TEXTOS_MAX = 4000


def nombre_mes(periodo: str) -> str:
    anio, mes = periodo.split("-")
    return f"{MESES[int(mes) - 1]} {anio}"


def periodo_sugerido(hoy: datetime | None = None) -> str:
    """Desde el 20 se propone el mes en curso; antes, el que terminó."""
    hoy = hoy or datetime.utcnow()
    if hoy.day >= 20:
        return f"{hoy.year}-{hoy.month:02d}"
    previo = hoy.replace(day=1) - timedelta(days=1)
    return f"{previo.year}-{previo.month:02d}"


def _valido(periodo: str) -> str:
    try:
        anio, mes = (int(x) for x in periodo.split("-"))
        assert 2024 <= anio <= 2100 and 1 <= mes <= 12
    except (ValueError, AssertionError):
        raise HTTPException(status_code=422, detail="Mes inválido.") from None
    return f"{anio}-{mes:02d}"


def _iso(d: datetime | None) -> str | None:
    return d.isoformat(timespec="seconds") + "Z" if d else None


def tasas(r: dict) -> dict:
    """Agendamiento, asistencia y cierre, en %, a partir de los números (lo que antes se pedía escrito)."""
    def pct(a, b):
        a, b = r.get(a), r.get(b)
        return round(100 * a / b, 1) if isinstance(a, (int, float)) and isinstance(b, (int, float)) and b > 0 else None

    return {"agendamiento": pct("agendas", "conversaciones"), "asistencia": pct("llamadas", "agendas"), "cierre": pct("ventas", "llamadas")}


def _nombre(c: ClienteExterno) -> str:
    return nombre_titular(c.id) or c.nombre or c.email or f"Cliente {c.id}"


def _anterior(cliente_id: int) -> dict | None:
    """La oferta y el avatar que contó la última vez (para no volver a pedírselos si no cambiaron)."""
    for texto in db.select(f'SELECT respuestas_json FROM "{DB_SCHEMA}"."cierres_respuestas" WHERE cliente_id = $cliente_id ORDER BY completado_en DESC LIMIT 6'):
        r = json.loads(texto or "{}")
        if r.get("oferta") or r.get("avatar"):
            return {"oferta": r.get("oferta") or "", "avatar": r.get("avatar") or ""}
    return None


class CierreServices:
    # ---------- cliente ----------
    @db_session
    def pendiente(self, sesion: dict) -> dict:
        if es_equipo(sesion):
            return {"pendiente": None}
        cid = sesion["usuario_id"]
        envios = sorted((e for e in list(CierreEnvio.select()) if cid in json.loads(e.destinatarios_json)), key=lambda e: e.enviado_en, reverse=True)
        hechos = set(db.select(f'SELECT periodo FROM "{DB_SCHEMA}"."cierres_respuestas" WHERE cliente_id = $cid'))  # una columna: Pony da los valores
        e = next((x for x in envios if x.periodo not in hechos), None)
        if e is None:
            return {"pendiente": None}
        return {"pendiente": {
            "periodo": e.periodo, "mes": nombre_mes(e.periodo), "vence_en": _iso(e.vence_en),
            "vencido": datetime.utcnow() > e.vence_en, "anterior": _anterior(cid), "cuellos": CUELLOS,
        }}

    @db_session
    def responder(self, sesion: dict, periodo: str, datos: dict) -> dict:
        if es_equipo(sesion):
            raise HTTPException(status_code=403, detail="El cierre de mes lo completa el cliente.")
        periodo, cid = _valido(periodo), sesion["usuario_id"]
        envio = CierreEnvio.get(periodo=periodo)
        if envio is None or cid not in json.loads(envio.destinatarios_json):
            raise HTTPException(status_code=404, detail="No hay un cierre de ese mes para vos.")
        if CierreRespuesta.get(periodo=periodo, cliente_id=cid):
            raise HTTPException(status_code=409, detail="Ya completaste este cierre.")
        anterior = _anterior(cid)
        limpio: dict = {}
        cambios = [c for c in (datos.get("cambios") or []) if c in ("oferta", "avatar")]
        for campo in ("oferta", "avatar"):
            # Sin cierre anterior se pide sí o sí; después, solo si marcó que cambió (si no, sigue la de antes).
            if campo in cambios or not anterior:
                texto = str(datos.get(campo) or "").strip()[:TEXTOS_MAX]
                if not texto:
                    raise HTTPException(status_code=422, detail=f"Contanos tu {campo}.")
                limpio[campo] = texto
            else:
                limpio[campo] = anterior.get(campo, "")
        limpio["cambios"] = cambios
        for campo in NUMEROS:
            v = datos.get(campo)
            try:
                n = float(v)
                assert n >= 0
            except (TypeError, ValueError, AssertionError):
                raise HTTPException(status_code=422, detail="Completá todos los números (0 si no hubo).") from None
            limpio[campo] = int(n) if n == int(n) else n
        if datos.get("cuello") not in CUELLOS:
            raise HTTPException(status_code=422, detail="Elegí tu principal cuello de botella.")
        limpio["cuello"] = datos["cuello"]
        try:
            nota = int(datos.get("satisfaccion"))
            assert 1 <= nota <= 10
        except (TypeError, ValueError, AssertionError):
            raise HTTPException(status_code=422, detail="Calificá el servicio del 1 al 10.") from None
        limpio["satisfaccion"] = nota
        for campo, falta in (("cuello_por_que", "Contanos el porqué."), ("satisfaccion_por_que", "Contanos el porqué."), ("propuesta", "Contanos qué podrías agregar o implementar de nuevo en ATV.")):
            texto = str(datos.get(campo) or "").strip()[:TEXTOS_MAX]
            if not texto:
                raise HTTPException(status_code=422, detail=falta)
            limpio[campo] = texto
        CierreRespuesta(periodo=periodo, cliente_id=cid, miembro_id=sesion.get("miembro_id"), respuestas_json=json.dumps(limpio, ensure_ascii=False))
        return {"ok": True, "tasas": tasas(limpio)}

    # ---------- admin ----------
    @db_session
    def meses(self) -> dict:
        respondieron: dict[str, int] = {}
        for p, n in db.select(f'SELECT periodo, count(*) FROM "{DB_SCHEMA}"."cierres_respuestas" GROUP BY periodo'):
            respondieron[p] = int(n)
        salida = []
        for e in sorted(CierreEnvio.select(), key=lambda x: x.periodo, reverse=True):
            total = len(json.loads(e.destinatarios_json))
            salida.append({"periodo": e.periodo, "mes": nombre_mes(e.periodo), "enviado_en": _iso(e.enviado_en), "vence_en": _iso(e.vence_en),
                           "total": total, "completaron": respondieron.get(e.periodo, 0)})
        activos = sum(1 for c in list(ClienteExterno.select()) if _tiene_acceso(c))
        sugerido = periodo_sugerido()
        return {"meses": salida, "sugerido": sugerido, "sugerido_mes": nombre_mes(sugerido), "activos": activos}

    @db_session
    def mes(self, periodo: str) -> dict:
        periodo = _valido(periodo)
        e = CierreEnvio.get(periodo=periodo)
        if e is None:
            raise HTTPException(status_code=404, detail="Ese mes no se envió.")
        ids = json.loads(e.destinatarios_json)
        resp = {r.cliente_id: r for r in CierreRespuesta.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."cierres_respuestas" WHERE periodo = $periodo')}
        buscados = set(ids)
        clientes = {c.id: c for c in list(ClienteExterno.select()) if c.id in buscados}
        completaron, faltan = [], []
        for cid in ids:
            c = clientes.get(cid)
            nombre = _nombre(c) if c else f"Cliente {cid}"
            if cid in resp:
                r = json.loads(resp[cid].respuestas_json)
                completaron.append({"cliente_id": cid, "nombre": nombre, "plan": c.plan_actual if c else None, "completado_en": _iso(resp[cid].completado_en), "respuestas": r, "tasas": tasas(r)})
            else:
                faltan.append({"cliente_id": cid, "nombre": nombre, "plan": c.plan_actual if c else None})
        orden = lambda x: x["nombre"].lower()  # noqa: E731
        return {"periodo": periodo, "mes": nombre_mes(periodo), "enviado_en": _iso(e.enviado_en), "vence_en": _iso(e.vence_en),
                "vencido": datetime.utcnow() > e.vence_en, "completaron": sorted(completaron, key=orden), "faltan": sorted(faltan, key=orden)}

    @db_session
    def enviar(self, sesion: dict, periodo: str) -> dict:
        """Lo manda a todos los clientes con acceso. Si el mes ya se envió, suma a los clientes nuevos."""
        periodo = _valido(periodo)
        activos = [c.id for c in list(ClienteExterno.select()) if _tiene_acceso(c)]
        e = CierreEnvio.get(periodo=periodo)
        ahora = datetime.utcnow()
        if e is None:
            CierreEnvio(periodo=periodo, admin_id=sesion["usuario_id"], enviado_en=ahora, vence_en=ahora + timedelta(days=PLAZO_DIAS), destinatarios_json=json.dumps(sorted(activos)))
            return {"periodo": periodo, "mes": nombre_mes(periodo), "enviados": len(activos), "nuevos": len(activos)}
        previos = set(json.loads(e.destinatarios_json))
        nuevos = [i for i in activos if i not in previos]
        e.destinatarios_json = json.dumps(sorted(previos | set(nuevos)))
        return {"periodo": periodo, "mes": nombre_mes(periodo), "enviados": len(previos) + len(nuevos), "nuevos": len(nuevos)}
