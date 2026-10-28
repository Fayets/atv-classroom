"""Chat para consultar el cerebro (solo el equipo): "¿qué fue lo que más preguntaron los clientes?".

La IA no responde de memoria: arma consultas SQL de solo lectura y responde con lo que devuelven
(conteos hechos por la base y citas textuales). Las consultas corren con candados:
- Una conexión aparte en modo solo lectura, con tiempo límite y tope de filas.
- La IA no ve las tablas reales: ve vistas armadas acá (CTE) con las columnas permitidas. Nunca
  contraseñas, sesiones, claves ni los mensajes directos entre el equipo (son privados hasta del admin).
- Plata (pagos, cuotas, totales) solo para quien ya la puede ver en el classroom (ve_plata).
"""

import json
import logging
import re
from datetime import date
from pathlib import Path

import psycopg2
from anthropic import APIConnectionError, APIStatusError, APITimeoutError, Anthropic
from decouple import config
from fastapi import HTTPException

from src.db import DB_SCHEMA, _psycopg2_connect_kwargs
from src.services import gasto_ia
from src.services.auth_service import es_equipo, ve_plata

logger = logging.getLogger(__name__)

# Haiku 5.5: con las cuentas hechas por la base responde igual de bien que Opus y cuesta ~US$ 0,003 por
# pregunta (Opus 5.5 rondaba los US$ 0,30). Medido el 24-10-2026 con la misma pregunta.
MODELO = config("CEREBRO_CHAT_MODEL", default="claude-haiku-5-5")
MAX_VUELTAS = 12
MAX_FILAS = 200
MAX_CELDA = 600
TOPE_DIARIO_USD = config("CEREBRO_CHAT_TOPE_USD", default=15.0, cast=float)
S = DB_SCHEMA

# Lo que la IA puede consultar: nombre de la vista → (SELECT que la arma, descripción para la IA).
VISTAS = {
    "equipo": (
        f'SELECT id, nombre, rol, area, activo AND NOT coalesce(borrado, false) AS activo FROM "{S}"."admins"',
        "Personas del equipo de ATV (coaches y admins). area: ventas, marketing, fulfillment, sistemas.",
    ),
    "clientes": (
        "SELECT c.id, c.nombre, c.email, c.plan_actual AS plan, c.estado_cliente AS estado, e.estado_efectivo, e.dias_restantes, "
        "c.fecha_inicio, c.fecha_vencimiento, c.duracion_dias, c.fecha_alta, c.fecha_baja, c.responsable, c.oportunidad, "
        "c.observaciones, c.dudas, c.acciones_revisar, c.canal_discord{plata} "
        "FROM clients.clientes c LEFT JOIN clients.clientes_con_estado e ON e.id = c.id",
        "Clientes de ATV. plan: entry, mid, high, boost, mentoria… estado_efectivo: vigente, proximo_a_vencer, vencido, "
        "pausa, inactivo, etc. dias_restantes de programa.",
    ),
    "canales": (
        f'SELECT id, tipo, cliente_id, nombre, pausa, inactivo, creado_en FROM "{S}"."canales" WHERE tipo NOT IN (\'directo\', \'privado\')',
        "Chats. tipo 'cliente' = el canal privado de un cliente con el equipo (cliente_id); 'grupo' = canales de la comunidad.",
    ),
    "mensajes": (
        f"SELECT m.id, m.canal AS canal_id, c.cliente_id, CASE WHEN m.autor_tipo = 'cliente' THEN 'cliente' ELSE 'equipo' END AS autor_tipo, "
        f"m.autor_id, coalesce(m.autor_nombre, a.nombre) AS autor_nombre, m.texto, m.creado_en, (m.id < 0) AS de_discord "
        f'FROM "{S}"."mensajes_canal" m JOIN "{S}"."canales" c ON c.id = m.canal '
        f"LEFT JOIN \"{S}\".\"admins\" a ON m.autor_tipo <> 'cliente' AND a.id = m.autor_id "
        # Los directos del equipo y los privados entre clientes no los lee nadie más que sus participantes.
        f"WHERE NOT m.borrado AND c.tipo NOT IN ('directo', 'privado')",
        "Todos los mensajes de los chats con clientes y de la comunidad (incluye el historial importado de Discord, "
        "de_discord = true). autor_tipo: 'cliente' o 'equipo'. ~66 mil mensajes desde 2025.",
    ),
    "hechos": (
        f'SELECT id, cliente_id, tipo, concepto, texto, cita, CASE WHEN autor_tipo = \'cliente\' THEN \'cliente\' ELSE \'equipo\' END AS autor_tipo, '
        f'autor_id, dicho_en FROM "{S}"."cerebro_hechos"',
        "Lo que el cerebro aprendió de cada conversación: un hecho concreto con la cita textual que lo prueba. "
        "tipo: tema | dolor | objecion | recomendacion | le_funciono | no_le_funciono | logro | pedido. "
        "concepto: id del tema (ver catalogo_temas). ~15 mil hechos. Es la mejor fuente para '¿qué preguntan / qué les duele?'.",
    ),
    "perfiles": (
        f'SELECT cliente_id, nicho, subnicho, nicho_texto, que_vende, etapa, facturacion, objetivo, tono_cliente FROM "{S}"."cerebro_perfil_cliente"',
        "Perfil de cada cliente aprendido de sus conversaciones: nicho, qué vende, etapa, facturación que contó, objetivo.",
    ),
    "onboarding": (
        f'SELECT cliente_id, respondido_en, respuestas_json, ficha_json FROM "{S}"."cerebro_onboarding"',
        "Respuestas del formulario de onboarding de cada cliente (JSON).",
    ),
    "llamadas": (
        f'SELECT id, admin_id AS coach_id, cliente_id, titulo, inicio, duracion_min, resumen, puntos_json, transcripcion FROM "{S}"."llamadas"',
        "Llamadas grabadas con Fathom entre un coach y un cliente: resumen, puntos clave y transcripción completa.",
    ),
    "roadmaps": (
        f'SELECT id, cliente_id, coach_id, area, titulo, tipo, fecha, pasos_total, paso_actual, principal, pasos_json FROM "{S}"."roadmap_docs"',
        "Roadmaps que cada coach armó para un cliente, con sus pasos (pasos_json: texto, quien, hecho).",
    ),
    "consultas_guia": (
        f'SELECT id, usuario_id AS cliente_id, texto, frente, creado_en FROM "{S}"."consultas_guia" WHERE tipo_usuario <> \'admin\'',
        "Lo que los clientes le escribieron a la Guía ATV del inicio del classroom.",
    ),
    "solicitudes_sop": (
        f'SELECT id, usuario_id AS cliente_id, nombre, area, entregable AS problema, consulta, estado, creado_en, resuelto_en FROM "{S}"."solicitud_sop"',
        "SOPs que pidieron los clientes porque no había material.",
    ),
    "programas": (f'SELECT id, titulo, orden FROM "{S}"."programa"', "Módulos del classroom (Start Here, Sales, Ads…)."),
    "secciones": (f'SELECT id, programa AS programa_id, titulo, orden FROM "{S}"."seccion"', "Secciones de cada módulo."),
    "clases": (
        f'SELECT id, seccion AS seccion_id, titulo, orden, duracion_segundos FROM "{S}"."clase"',
        "Clases (videos) del classroom.",
    ),
    "progreso": (
        f'SELECT clase_id, cliente_id, miembro_id, completado, completado_en FROM "{S}"."progreso" WHERE cliente_id IS NOT NULL',
        "Qué clases completó cada cliente y cuándo.",
    ),
    "frentes": (
        f'SELECT usuario_id AS cliente_id, slug, creado_en, actualizado_en, revisado FROM "{S}"."frente" WHERE tipo_usuario <> \'admin\'',
        "Frentes de trabajo que abrió cada cliente desde el inicio (slug = problema).",
    ),
    "proximos_pasos": (
        "SELECT cliente_id, fecha_llamada, mentor, contenido FROM clients.proximos_pasos",
        "Próximos pasos que dejó un mentor después de una llamada (de la ficha del cliente).",
    ),
    "observaciones": (
        "SELECT cliente_id, autor, texto, created_at AS creado_en FROM clients.observaciones",
        "Notas del equipo en la ficha de cada cliente.",
    ),
}
VISTAS_PLATA = {
    "pagos": (
        "SELECT cliente_id, monto_usd, fecha FROM clients.pagos",
        "Pagos recibidos de cada cliente (USD).",
    ),
    "cuotas": (
        "SELECT cliente_id, numero_cuota, monto_usd, fecha_vence, fecha_pago, estado FROM clients.cuotas",
        "Cuotas de cada cliente: estado pagada/pendiente/vencida.",
    ),
}
_COLUMNAS_PLATA = ", c.total_pagado_usd, c.total_adeudado_usd, c.prioridad_cobro"

# Lo que nunca puede aparecer en una consulta: tablas reales, catálogos de Postgres, escrituras.
_PROHIBIDO = re.compile(
    r'\b(classroom|clients|public|ops|hiring|pg_catalog|information_schema)\s*"?\s*\.|\bpg_\w+|"\s*\.|;\s*\S'
    r"|\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|do|execute|prepare|listen|notify|vacuum|set|reset|lock)\b",
    re.I,
)


def _vistas(sesion: dict) -> dict:
    plata = ve_plata(sesion)
    vistas = {k: (sql.replace("{plata}", _COLUMNAS_PLATA if plata else ""), d) for k, (sql, d) in VISTAS.items()}
    if plata:
        vistas.update(VISTAS_PLATA)
    return vistas


def ejecutar_sql(sesion: dict, consulta: str) -> dict:
    """Corre la consulta de la IA sobre las vistas permitidas, en solo lectura. Devuelve filas o un error legible."""
    q = (consulta or "").strip().rstrip(";").strip()
    if not re.match(r"(?is)^(select|with)\b", q):
        return {"error": "Solo se permiten consultas SELECT (o WITH … SELECT)."}
    # Los textos entre comillas simples (lo que se busca con ILIKE) no cuentan para el control.
    if _PROHIBIDO.search(re.sub(r"'(?:[^']|'')*'", "''", q)):
        return {"error": "La consulta usa algo no permitido: solo podés leer las vistas listadas, sin esquemas, catálogos ni escrituras."}
    vistas = _vistas(sesion)
    ctes = ",\n".join(f'"{nombre}" AS ({sql})' for nombre, (sql, _) in vistas.items())
    # Si la IA ya arrancó con WITH, sus CTE se suman a las nuestras.
    final = f"WITH {ctes},\n{q[4:].lstrip()}" if re.match(r"(?i)^with\b", q) else f"WITH {ctes}\n{q}"
    conn = psycopg2.connect(**_psycopg2_connect_kwargs())
    try:
        conn.set_session(readonly=True, autocommit=False)
        with conn.cursor() as cur:
            # Sin search_path a los esquemas reales: solo se resuelven las vistas de arriba.
            cur.execute("SET LOCAL statement_timeout = 15000; SET LOCAL search_path = pg_catalog")
            cur.execute(final)
            columnas = [d[0] for d in cur.description]
            filas = cur.fetchmany(MAX_FILAS + 1)
    except psycopg2.Error as exc:
        return {"error": (getattr(exc, "pgerror", None) or str(exc)).strip()[:500]}
    finally:
        conn.rollback()
        conn.close()
    mas = len(filas) > MAX_FILAS

    def celda(v):
        if isinstance(v, (date,)):
            return v.isoformat()
        if isinstance(v, str) and len(v) > MAX_CELDA:
            return v[:MAX_CELDA] + f"… [{len(v)} caracteres]"
        if isinstance(v, (int, float, bool)) or v is None:
            return v
        return str(v)

    return {
        "columnas": columnas,
        "filas": [[celda(v) for v in f] for f in filas[:MAX_FILAS]],
        "cantidad": min(len(filas), MAX_FILAS),
        "hay_mas": mas,
    }


def catalogo_temas() -> list[dict]:
    datos = json.loads((Path(__file__).resolve().parent.parent / "data" / "conceptos.json").read_text(encoding="utf-8"))
    return [{"id": c["id"], "nombre": c["nombre"], "definicion": c.get("definicion", "")} for c in datos["conceptos"]]


def _system(sesion: dict) -> list[dict]:
    vistas = _vistas(sesion)
    esquema = "\n".join(f"- {n}: {d}\n  columnas: {_columnas(sql)}" for n, (sql, d) in vistas.items())
    texto = (
        "Sos el analista del cerebro de ATV: una mentoría para dueños de negocio (coaches de ventas, marketing, "
        "fulfillment y sistemas acompañan a cada cliente por chat y en llamadas). Te consulta alguien del equipo.\n\n"
        "Cómo trabajás:\n"
        "- No respondas de memoria ni supongas: todo número sale de una consulta con la herramienta consultar_sql, "
        "y los conteos los hace la base (COUNT, GROUP BY), no vos leyendo filas.\n"
        "- Para '¿qué preguntan / qué les duele / qué piden?' empezá por la vista hechos (tipo + concepto) y usá "
        "catalogo_temas para los nombres de los temas. Para preguntas sobre un cliente puntual, buscalo por nombre en clientes "
        "(ILIKE) y cruzá con mensajes, hechos, llamadas y roadmaps.\n"
        "- Para buscar palabras en lo que se habló usá ILIKE sobre mensajes.texto o hechos.cita, siempre con LIMIT.\n"
        "- Respaldá las conclusiones con 1 a 3 citas textuales cortas, con el nombre del cliente y la fecha.\n"
        "- Si los datos no alcanzan para responder, decilo y explicá qué sí se puede ver.\n"
        "- Respondé en español rioplatense, directo y corto: primero la respuesta, después el detalle. Usá listas o una tabla "
        "chica cuando ayude. No muestres el SQL en la respuesta (el equipo lo puede ver aparte).\n\n"
        "Vistas disponibles (son las únicas tablas que existen para vos; Postgres):\n" + esquema
    )
    return [{"type": "text", "text": texto, "cache_control": {"type": "ephemeral"}}]


def _columnas(sql: str) -> str:
    cabeza = re.split(r"(?i)\sFROM\s", sql, maxsplit=1)[0]
    cabeza = re.sub(r"(?i)^SELECT\s+", "", cabeza)
    partes, nivel, actual = [], 0, ""
    for ch in cabeza:
        nivel += ch == "("
        nivel -= ch == ")"
        if ch == "," and nivel == 0:
            partes.append(actual)
            actual = ""
        else:
            actual += ch
    partes.append(actual)
    nombres = []
    for p in partes:
        m = re.search(r"(?i)\bAS\s+(\w+)\s*$", p.strip())
        nombres.append(m.group(1) if m else p.strip().split(".")[-1])
    return ", ".join(nombres)


TOOLS = [
    {
        "name": "consultar_sql",
        "description": "Corre una consulta SQL de solo lectura (Postgres) sobre las vistas del cerebro y devuelve las filas "
        f"(máximo {MAX_FILAS}; los textos largos vienen recortados). Usá GROUP BY / COUNT para contar y LIMIT para ejemplos.",
        "input_schema": {
            "type": "object",
            "properties": {
                "consulta": {"type": "string", "description": "Una sola sentencia SELECT (o WITH … SELECT)."},
                "para_que": {"type": "string", "description": "En pocas palabras, qué buscás con esta consulta."},
            },
            "required": ["consulta", "para_que"],
            "additionalProperties": False,
        },
    },
    {
        "name": "catalogo_temas",
        "description": "Lista de los temas (conceptos) con los que se etiquetan los hechos: id, nombre y definición.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
]


def _extras() -> dict:
    cuerpo = {"output_config": {"effort": "medium"}}
    if not MODELO.startswith("claude-haiku"):  # Haiku no tiene respaldo del lado del servidor
        return {"extra_headers": {"anthropic-beta": "server-side-fallback-2026-07-01"}, "extra_body": {**cuerpo, "fallbacks": "default"}}
    return {"extra_body": cuerpo}


def preguntar(sesion: dict, pregunta: str, historial: list[dict], al_consultar=None) -> dict:
    if not es_equipo(sesion):
        raise HTTPException(status_code=403, detail="Solo el equipo puede consultar el cerebro.")
    pregunta = (pregunta or "").strip()
    if len(pregunta) < 3:
        raise HTTPException(status_code=422, detail="Escribí la pregunta.")
    if gasto_ia.gastado_hoy("cerebro_chat") >= TOPE_DIARIO_USD:
        raise HTTPException(status_code=429, detail="Se llegó al tope de consultas de hoy. Mañana se puede seguir.")
    api_key = config("ANTHROPIC_API_KEY", default=None)
    if not api_key:
        raise HTTPException(status_code=503, detail="La IA no está configurada en el servidor.")

    # La conversación anterior viaja como texto (sin las consultas): alcanza para seguir el hilo.
    mensajes = []
    for h in (historial or [])[-12:]:
        rol = "assistant" if h.get("rol") == "cerebro" else "user"
        texto = str(h.get("texto") or "").strip()[:6000]
        if texto:
            mensajes.append({"role": rol, "content": texto})
    while mensajes and mensajes[0]["role"] != "user":
        mensajes.pop(0)
    mensajes.append({"role": "user", "content": f"(Hoy es {date.today().isoformat()}.)\n\n{pregunta[:4000]}"})

    client = Anthropic(api_key=api_key, timeout=120, max_retries=2)
    consultas = []
    system = _system(sesion)
    try:
        for _ in range(MAX_VUELTAS):
            r = client.messages.create(
                model=MODELO,
                max_tokens=16000,
                system=system,
                tools=TOOLS,
                messages=mensajes,
                # Campos nuevos de la API que la versión instalada del SDK no conoce todavía: esfuerzo medio
                # (alcanza para armar consultas) y, en los modelos que lo tienen, respaldo si se rechaza una respuesta.
                **_extras(),
            )
            gasto_ia.registrar("cerebro_chat", r.usage)
            if r.stop_reason == "refusal":
                return {"respuesta": "No puedo responder esa consulta.", "consultas": consultas}
            # El turno entero vuelve tal cual (con sus bloques de razonamiento) para la próxima vuelta.
            mensajes.append({"role": "assistant", "content": r.content})
            usos = [b for b in r.content if b.type == "tool_use"]
            if not usos:
                texto = "\n".join(b.text for b in r.content if b.type == "text").strip()
                return {"respuesta": texto or "No encontré una respuesta.", "consultas": consultas}
            resultados = []
            for uso in usos:
                entrada = uso.input if isinstance(uso.input, dict) else {}
                if uso.name == "consultar_sql":
                    res = ejecutar_sql(sesion, str(entrada.get("consulta", "")))
                    consultas.append({
                        "para_que": str(entrada.get("para_que", ""))[:200],
                        "sql": str(entrada.get("consulta", ""))[:4000],
                        "filas": res.get("cantidad"),
                        "error": res.get("error"),
                    })
                    if al_consultar:
                        al_consultar(consultas[-1])
                elif uso.name == "catalogo_temas":
                    res = catalogo_temas()
                else:
                    res = {"error": "Herramienta desconocida."}
                resultados.append({
                    "type": "tool_result",
                    "tool_use_id": uso.id,
                    "content": json.dumps(res, ensure_ascii=False, default=str)[:60000],
                    **({"is_error": True} if isinstance(res, dict) and res.get("error") else {}),
                })
            mensajes.append({"role": "user", "content": resultados})
    except (APITimeoutError, APIConnectionError) as exc:
        logger.warning("Cerebro chat: la IA no respondió (%s)", type(exc).__name__)
        raise HTTPException(status_code=503, detail="La IA no respondió. Probá de nuevo en un rato.")
    except APIStatusError as exc:
        logger.warning("Cerebro chat: error de la IA %s: %s", exc.status_code, str(exc)[:300])
        raise HTTPException(status_code=502, detail="La IA devolvió un error. Probá de nuevo.")
    return {"respuesta": "La consulta necesitó demasiados pasos. Probá hacerla más concreta.", "consultas": consultas}


# ---------- consultas en segundo plano ----------
# Una respuesta tarda entre 30 y 60 s: más que lo que nginx deja abierto un pedido. La pregunta arranca
# aparte y la pantalla consulta cómo va (y muestra en vivo qué está buscando). En memoria: el backend
# corre en un solo proceso.
import secrets
import threading
import time

_TRABAJOS: dict[str, dict] = {}
_CANDADO = threading.Lock()


def _limpiar() -> None:
    limite = time.time() - 30 * 60
    with _CANDADO:
        for k in [k for k, t in _TRABAJOS.items() if t["creado"] < limite]:
            _TRABAJOS.pop(k, None)


def empezar(sesion: dict, pregunta: str, historial: list[dict]) -> dict:
    if not es_equipo(sesion):
        raise HTTPException(status_code=403, detail="Solo el equipo puede consultar el cerebro.")
    _limpiar()
    tid = secrets.token_urlsafe(12)
    trabajo = {"dueno": sesion["usuario_id"], "creado": time.time(), "estado": "pensando", "pasos": [], "resultado": None, "error": None}
    with _CANDADO:
        _TRABAJOS[tid] = trabajo

    def correr():
        try:
            trabajo["resultado"] = preguntar(sesion, pregunta, historial, al_consultar=lambda c: trabajo["pasos"].append(c["para_que"]))
            trabajo["estado"] = "listo"
        except HTTPException as exc:
            trabajo["error"], trabajo["estado"] = exc.detail, "error"
        except Exception:
            logger.exception("Cerebro chat: falló la consulta")
            trabajo["error"], trabajo["estado"] = "No se pudo responder. Probá de nuevo.", "error"

    threading.Thread(target=correr, daemon=True).start()
    return {"id": tid}


def estado(sesion: dict, tid: str) -> dict:
    trabajo = _TRABAJOS.get(tid)
    if trabajo is None or trabajo["dueno"] != sesion["usuario_id"]:
        raise HTTPException(status_code=404, detail="Esa consulta ya no existe.")
    salida = {"estado": trabajo["estado"], "pasos": list(trabajo["pasos"])}
    if trabajo["estado"] == "listo":
        salida.update(trabajo["resultado"])
    elif trabajo["estado"] == "error":
        salida["error"] = trabajo["error"]
    return salida
