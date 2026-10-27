"""Carpeta Clientes del escritorio del admin: una carpeta por cliente y, adentro, su ficha completa.

Lee el esquema `clients` (lo que carga atv-clients: plan, pagos, cuotas, observaciones, tableros)
y suma lo que pasa en el classroom (progreso, frentes y consultas a la guía).
Es solo lectura: nada de acá modifica atv-clients.
"""

import json
import re
from datetime import date, datetime

from fastapi import HTTPException
from pony.orm import db_session

from src.db import db

_ESTADOS = {
    "vigente": "Vigente",
    "proximo_a_vencer": "Por vencer",
    "vencido": "Vencido",
    "pausa": "En pausa",
    "no_va_a_renovar": "No va a renovar",
    "llamada_recompra": "Llamada de recompra",
}


def _iso(v):
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.isoformat(timespec="seconds") + "Z"
    if isinstance(v, date):
        return v.isoformat()
    return v


def _filas(sql: str, params: dict) -> list[dict]:
    """db.select con nombres de columna: devuelve dicts en vez de tuplas."""
    cursor = db.execute(sql, params)
    columnas = [c[0] for c in cursor.description]
    return [dict(zip(columnas, fila)) for fila in cursor.fetchall()]


# Marcas internas de cómo se cargó el pago (migración del sistema viejo, carga manual, el cierre automático
# de una cuota): no dicen nada del cliente, así que no se muestran. Las notas que escribió alguien sí.
_ORIGENES_INTERNOS = {"migracion", "manual"}
_NOTAS_INTERNAS = re.compile(r"^\s*(migraci[oó]n desde cuota pagada legacy|cierre cuota #\d+)\s*$", re.I)


def _pago_visible(p: dict) -> dict:
    return {
        **p,
        "origen": None if (p.get("origen") or "").lower() in _ORIGENES_INTERNOS else p.get("origen"),
        "notas": None if _NOTAS_INTERNAS.match(p.get("notas") or "") else p.get("notas"),
    }


class ClientesServices:
    def carpeta(self) -> list[dict]:
        with db_session:
            filas = _filas(
                "SELECT e.id, e.nombre, e.email, e.plan_actual, e.estado_efectivo, e.dias_restantes, e.fecha_vencimiento, "
                "k.responsable, c.ultimo_mensaje_en "
                "FROM clients.clientes_con_estado e JOIN clients.clientes k ON k.id = e.id "
                "LEFT JOIN classroom.canales c ON c.cliente_id = e.id "
                "ORDER BY lower(coalesce(e.nombre, e.email))",
                {},
            )
        from src.services.dispositivos_service import alertas_por_cliente

        alertas = alertas_por_cliente()
        return [
            {
                "id": f["id"],
                "nombre": f["nombre"] or f["email"],
                "plan": f["plan_actual"],
                "estado": f["estado_efectivo"],
                "estado_texto": _ESTADOS.get(f["estado_efectivo"], f["estado_efectivo"]),
                "dias_restantes": f["dias_restantes"],
                "vence": _iso(f["fecha_vencimiento"]),
                "responsable": f["responsable"],
                "ultimo_mensaje": _iso(f["ultimo_mensaje_en"]),
                "dispositivos_alerta": alertas.get(f["id"]),
            }
            for f in filas
        ]

    def ficha(self, cliente_id: int) -> dict:
        # Una sola ida y vuelta a la base: cada parte de la ficha sale como JSON de una subconsulta.
        with db_session:
            filas = _filas(_SQL_FICHA, {"id": cliente_id})
        if not filas or filas[0]["cliente"] is None:
            raise HTTPException(status_code=404, detail="Ese cliente no existe.")
        f = {k: (json.loads(v) if isinstance(v, str) else v) for k, v in filas[0].items()}
        c = f["cliente"]
        for k in ("password_hash", "session_id"):
            c.pop(k, None)
        try:
            otros_mails = [m for m in json.loads(c.pop("emails_json", None) or "[]") if m and m != c["email"]]
        except (TypeError, ValueError):
            otros_mails = []
        c["otros_mails"] = otros_mails
        c["estado_texto"] = _ESTADOS.get(c.get("estado_efectivo"), c.get("estado_efectivo"))

        archivos = f["archivos"] or []
        if c.get("miro_url") and not any(a["url"] == c["miro_url"] for a in archivos):
            archivos.insert(0, {"tipo": "miro", "titulo": "Miro del cliente", "url": c["miro_url"], "creado_en": None})
        if c.get("fathoms_url") and not any(a["url"] == c["fathoms_url"] for a in archivos):
            archivos.append({"tipo": "fathom", "titulo": "Llamadas en Fathom", "url": c["fathoms_url"], "creado_en": None})

        return {
            "cliente": c,
            "pagos": [_pago_visible(x) for x in (f["pagos"] or [])],
            "cuotas": f["cuotas"] or [],
            "observaciones": f["observaciones"] or [],
            "proximos_pasos": f["proximos_pasos"] or [],
            "archivos": archivos,
            "classroom": {
                "clases_completadas": f["clases_completadas"] or 0,
                "ultimas_clases": f["ultimas_clases"] or [],
                "frentes": f["frentes"] or [],
                "consultas_guia": f["consultas_guia"] or [],
            },
            "chat": f"/mensajes?c={f['canal_id']}" if f["canal_id"] else None,
        }


_SQL_FICHA = """SELECT
  (SELECT row_to_json(x) FROM (
     SELECT e.*, k.responsable, k.canal_discord, k.emails_json, k.fecha_recompra, k.fathoms_url, k.arreglo_closer
     FROM clients.clientes_con_estado e JOIN clients.clientes k ON k.id = e.id WHERE e.id = $id) x)::text AS cliente,
  (SELECT json_agg(x)::text FROM (SELECT fecha, monto_usd::float AS monto_usd, origen, notas FROM clients.pagos
     WHERE cliente_id = $id ORDER BY fecha DESC, id DESC) x) AS pagos,
  (SELECT json_agg(x)::text FROM (SELECT numero_cuota, monto_usd::float AS monto_usd, fecha_vence, fecha_pago, estado, notas
     FROM clients.cuotas WHERE cliente_id = $id ORDER BY fecha_vence, id) x) AS cuotas,
  (SELECT json_agg(x)::text FROM (SELECT autor, texto, created_at FROM clients.observaciones
     WHERE cliente_id = $id ORDER BY created_at DESC) x) AS observaciones,
  (SELECT json_agg(x)::text FROM (SELECT fecha_llamada, mentor, contenido, link FROM clients.proximos_pasos
     WHERE cliente_id = $id ORDER BY fecha_llamada DESC NULLS LAST, id DESC) x) AS proximos_pasos,
  (SELECT json_agg(x)::text FROM (
     SELECT 'miro' AS tipo, titulo, url, created_at AS creado_en, id FROM clients.miro_boards WHERE cliente_id = $id
     UNION ALL SELECT 'fathom', titulo, url, created_at, id FROM clients.fathom_boards WHERE cliente_id = $id
     UNION ALL SELECT 'documento', titulo, url, created_at, id FROM clients.documento_links WHERE cliente_id = $id
     ORDER BY 1, 5) x) AS archivos,
  (SELECT count(*) FROM classroom.progreso WHERE cliente_id = $id AND completado) AS clases_completadas,
  (SELECT json_agg(x)::text FROM (
     SELECT c.id, c.titulo, pr.titulo AS modulo, p.completado_en
     FROM classroom.progreso p JOIN classroom.clase c ON c.id = p.clase_id
     JOIN classroom.seccion s ON s.id = c.seccion JOIN classroom.programa pr ON pr.id = s.programa
     WHERE p.cliente_id = $id AND p.completado ORDER BY p.completado_en DESC NULLS LAST LIMIT 6) x) AS ultimas_clases,
  (SELECT json_agg(x)::text FROM (SELECT slug, revisado, automatizado, actualizado_en FROM classroom.frente
     WHERE tipo_usuario = 'cliente' AND usuario_id = $id ORDER BY actualizado_en DESC) x) AS frentes,
  (SELECT json_agg(x)::text FROM (SELECT left(texto, 300) AS texto, creado_en FROM classroom.consultas_guia
     WHERE tipo_usuario = 'cliente' AND usuario_id = $id ORDER BY id DESC LIMIT 6) x) AS consultas_guia,
  (SELECT id FROM classroom.canales WHERE cliente_id = $id) AS canal_id"""
