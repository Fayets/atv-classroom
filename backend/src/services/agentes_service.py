"""API de lectura para los agentes de IA del equipo (Command Center): leen chats, progreso, llamadas y
onboarding de los clientes para preparar borradores. Los mensajes los manda siempre una persona.

Solo lectura por construcción:
- Cada consulta corre en una conexión aparte de psycopg2 en modo READ ONLY, con tiempo límite, y se
  descarta con rollback al terminar. Acá no hay entidades de Pony ni escrituras.
- Nunca se leen los canales privados (directo, privado, dm) ni los mensajes borrados.
- Plata (totales, pagos, cuotas) solo para las claves con el permiso "plata".
- Toda la base se lee como vistas seguras `<esquema>__<tabla>` (ver agentes_tablas): sin secretos y con la
  plata solo para "plata". Las tablas reales no se pueden nombrar.

Claves: AGENTES_KEYS es un JSON {"<nombre>": {"sha256": "<hex de la clave>", "scopes": ["lectura"]}}.
En la base y en el .env solo vive el hash; la clave la tiene el agente. Sin AGENTES_KEYS la API no existe (404).
"""

import hashlib
import hmac
import json
import logging
import time
from contextlib import contextmanager
from datetime import date, datetime

import psycopg2
from decouple import config
from fastapi import HTTPException, Request

from src.db import DB_SCHEMA, _psycopg2_connect_kwargs
from src.services import agentes_tablas, cerebro_chat_service

logger = logging.getLogger("agentes")

S = DB_SCHEMA
ENCABEZADO = "X-Agente-Key"
MAX_RESUMEN_LLAMADA = 1500
# Las columnas de plata de la ficha (como en las vistas del cerebro): solo con el permiso "plata".
_COLUMNAS_PLATA = ("total_pagado_usd", "total_adeudado_usd", "prioridad_cobro")
# El catálogo de toda la base se relee cada 10 minutos (una tabla nueva aparece sola).
CATALOGO_SEGUNDOS = 600
_catalogo_cache = {"datos": None, "hasta": 0.0}


# ---------- Claves ----------


def _claves() -> dict:
    """Las claves cargadas en AGENTES_KEYS; {} si no hay (la API queda apagada) o si el JSON está mal."""
    crudo = config("AGENTES_KEYS", default="").strip()
    if not crudo:
        return {}
    try:
        claves = json.loads(crudo)
    except ValueError:
        logger.error("AGENTES_KEYS no es un JSON válido: la API de agentes queda apagada")
        return {}
    if not isinstance(claves, dict):
        logger.error("AGENTES_KEYS tiene que ser un objeto {nombre: {sha256, scopes}}: la API de agentes queda apagada")
        return {}
    return {
        nombre: {"sha256": str(v.get("sha256", "")).lower(), "scopes": [str(s) for s in (v.get("scopes") or [])]}
        for nombre, v in claves.items()
        if isinstance(v, dict) and v.get("sha256")
    }


def agente_desde_request(request: Request) -> dict:
    """Dependencia de FastAPI: el agente dueño de la clave del encabezado X-Agente-Key.
    404 si la API está apagada, 401 si la clave falta o no es de nadie, 403 si no tiene permiso de lectura."""
    claves = _claves()
    if not claves:
        raise HTTPException(status_code=404, detail="Not Found")
    clave = request.headers.get(ENCABEZADO) or ""
    if not clave:
        raise HTTPException(status_code=401, detail=f"Falta el encabezado {ENCABEZADO}.")
    huella = hashlib.sha256(clave.encode("utf-8")).hexdigest()
    agente = None
    # Se comparan todas, sin cortar en la primera, para que el tiempo no diga cuál se parece.
    for nombre, datos in claves.items():
        if hmac.compare_digest(huella, datos["sha256"]) and agente is None:
            agente = {"nombre": nombre, "scopes": datos["scopes"]}
    if agente is None:
        # Las claves personales de ATV Leverage ("Entrar con el classroom") viven en la base.
        from src.services.leverage_service import agente_de_clave

        try:
            agente = agente_de_clave(huella)
        except Exception:
            # Si la base no responde, la clave personal no se puede validar: se rechaza como cualquier otra.
            logger.exception("Agentes: no se pudo buscar la clave personal")
            agente = None
    if agente is None:
        logger.warning("Agentes: clave rechazada en %s %s", request.method, request.url.path)
        raise HTTPException(status_code=401, detail="Clave de agente inválida.")
    if "lectura" not in agente["scopes"]:
        raise HTTPException(status_code=403, detail="Esta clave no tiene el permiso de lectura.")
    # Quién leyó qué: el nombre del agente y la ruta. Nunca la clave ni el contenido.
    logger.info("Agentes: %s %s %s", agente["nombre"], request.method, request.url.path)
    return agente


def ve_plata(agente: dict) -> bool:
    return "plata" in agente.get("scopes", [])


# ---------- Lectura ----------


@contextmanager
def _lectura():
    """Cursor de una conexión en solo lectura: Postgres rechaza cualquier escritura y todo se descarta al final."""
    conn = psycopg2.connect(**_psycopg2_connect_kwargs())
    try:
        conn.set_session(readonly=True, autocommit=False)
        with conn.cursor() as cur:
            cur.execute("SET LOCAL statement_timeout = 15000")
            yield cur
    finally:
        conn.rollback()
        conn.close()


def _filas(cur, sql: str, params: dict | None = None) -> list[dict]:
    cur.execute(sql, params)
    columnas = [d[0] for d in cur.description]
    return [dict(zip(columnas, fila)) for fila in cur.fetchall()]


def _iso(v):
    if isinstance(v, datetime):
        return v.isoformat(timespec="seconds") + ("Z" if v.tzinfo is None else "")
    if isinstance(v, date):
        return v.isoformat()
    return v


def _limpio(fila: dict) -> dict:
    """Fechas en ISO y números de Postgres (Decimal) como float, para que salga JSON plano."""
    out = {}
    for k, v in fila.items():
        if isinstance(v, (datetime, date)):
            v = _iso(v)
        elif v is not None and not isinstance(v, (str, int, float, bool, list, dict)):
            try:
                v = float(v)
            except (TypeError, ValueError):
                v = str(v)
        out[k] = v
    return out


def _json(v):
    if not v:
        return None
    try:
        return json.loads(v)
    except (TypeError, ValueError):
        return None


# ---------- Consulta SQL y catálogo de toda la base ----------


def _catalogo() -> dict:
    """El catálogo de todas las tablas (sin mirar permisos), leído en solo lectura y guardado 10 minutos."""
    ahora = time.monotonic()
    if _catalogo_cache["datos"] is None or ahora >= _catalogo_cache["hasta"]:
        try:
            with _lectura() as cur:
                datos = agentes_tablas.armar(_filas(cur, agentes_tablas.SQL_CATALOGO))
        except psycopg2.Error:
            logger.exception("Agentes: no se pudo leer el catálogo de la base")
            raise HTTPException(status_code=503, detail="No se pudo leer el catálogo de la base. Probá de nuevo en un rato.")
        _catalogo_cache.update(datos=datos, hasta=ahora + CATALOGO_SEGUNDOS)
    return _catalogo_cache["datos"]


def consulta(agente: dict, sql: str) -> dict:
    """La consulta del chat del cerebro (vistas permitidas, solo lectura, tope de filas) más toda la base como
    `<esquema>__<tabla>`: entran solo las tablas que la consulta nombra."""
    plata = ve_plata(agente)
    _, piezas, problema = cerebro_chat_service.revisar_sql(sql)
    if problema:
        raise HTTPException(status_code=400, detail=problema)
    tablas_base = {}
    nombres = cerebro_chat_service.nombres_sql(piezas)
    if any(agentes_tablas.SEPARADOR in n for n in nombres):
        catalogo = _catalogo()
        ausentes = agentes_tablas.ausentes(catalogo, plata)
        vedadas = sorted(nombres & ausentes.keys())
        if vedadas:
            nombre = vedadas[0]
            motivo = "es de plata (pide el permiso plata)" if ausentes[nombre] == agentes_tablas.PLATA else "tiene secretos"
            raise HTTPException(status_code=400, detail=f"La tabla {nombre} no está disponible para esta clave: {motivo}.")
        tablas_base = agentes_tablas.ctes(catalogo, plata)
    r = cerebro_chat_service.consultar_vistas(sql, plata, tablas_base)
    if r.get("error"):
        raise HTTPException(status_code=400, detail=r["error"])
    return r


def catalogo_tablas(agente: dict) -> dict:
    """Qué se puede leer con esta clave: las vistas del cerebro y toda la base por esquema, con lo excluido y por qué."""
    plata = ve_plata(agente)
    vistas = [{"nombre": n, "descripcion": d} for n, (_, d) in cerebro_chat_service.vistas_permitidas(plata).items()]
    return {"vistas": vistas, **agentes_tablas.para_agente(_catalogo(), plata)}


# ---------- Canales ----------

_SQL_ULTIMOS = f"""SELECT c.id AS canal_id, c.tipo, c.nombre AS canal_nombre, c.cliente_id, c.pausa, c.inactivo, c.vencido,
  k.nombre AS cliente_nombre, k.plan_actual, k.estado_cliente, e.estado_efectivo,
  m.id AS mensaje_id, m.autor_tipo, coalesce(m.autor_nombre, mc.nombre, k.nombre) AS autor_nombre, m.texto, m.creado_en,
  r.autor_id AS responsable_id, ra.nombre AS responsable_nombre,
  (SELECT array_agg(DISTINCT men.admin_id) FROM "{S}"."menciones" men
    WHERE men.canal_id = c.id AND men.respondida_en IS NULL AND men.creado_en > coalesce(r.creado_en, '-infinity'::timestamp)) AS mencionados
FROM "{S}"."canales" c
JOIN LATERAL (
  SELECT x.id, x.autor_tipo, x.autor_id, x.autor_nombre, x.miembro_id, x.texto, x.creado_en
  FROM "{S}"."mensajes_canal" x WHERE x.canal = c.id AND NOT x.borrado
  ORDER BY x.creado_en DESC, x.id DESC LIMIT 1
) m ON true
LEFT JOIN LATERAL (
  SELECT y.autor_id, y.creado_en FROM "{S}"."mensajes_canal" y
  WHERE y.canal = c.id AND y.autor_tipo <> 'cliente' AND NOT y.borrado
  ORDER BY y.creado_en DESC, y.id DESC LIMIT 1
) r ON true
LEFT JOIN "{S}"."admins" ra ON ra.id = r.autor_id
LEFT JOIN clients.clientes k ON k.id = c.cliente_id
LEFT JOIN clients.clientes_con_estado e ON e.id = c.cliente_id
LEFT JOIN "{S}"."miembros_cliente" mc ON mc.id = m.miembro_id
WHERE c.tipo = 'cliente'"""


def pendientes_de(filas: list[dict], ahora: datetime) -> list[dict]:
    """De los últimos mensajes de cada canal, los de cliente que quedaron sin respuesta: el que más espera primero."""
    salida = []
    for f in filas:
        if f.get("tipo") != "cliente" or f.get("autor_tipo") != "cliente" or f.get("creado_en") is None:
            continue
        espera = max(0, int((ahora - f["creado_en"]).total_seconds() // 60))
        salida.append(
            {
                "canal_id": f["canal_id"],
                "cliente": {
                    "id": f["cliente_id"],
                    "nombre": f.get("cliente_nombre") or f.get("canal_nombre"),
                    "plan_actual": f.get("plan_actual"),
                    "estado_cliente": f.get("estado_cliente"),
                    "estado_efectivo": f.get("estado_efectivo"),
                },
                "canal": {"pausa": bool(f.get("pausa")), "inactivo": bool(f.get("inactivo")), "vencido": bool(f.get("vencido"))},
                "ultimo_mensaje": {
                    "id": f["mensaje_id"],
                    "autor_nombre": f.get("autor_nombre"),
                    "texto": f.get("texto") or "",
                    "creado_en": _iso(f["creado_en"]),
                },
                "minutos_esperando": espera,
                # Quién lleva el chat (el último del equipo que escribió) y a quién etiquetó el cliente sin respuesta.
                "responsable": {"id": f.get("responsable_id"), "nombre": f.get("responsable_nombre")} if f.get("responsable_id") else None,
                "mencionados": [int(x) for x in (f.get("mencionados") or [])],
                "_desde": f["creado_en"],
            }
        )
    salida.sort(key=lambda p: (p["_desde"], p["canal_id"]))
    for p in salida:
        del p["_desde"]
    return salida


# Lo que cuenta como cliente con quien se trabaja hoy. Vencidos, en pausa e inactivos no esperan respuesta del equipo.
ESTADOS_ACTIVOS = {"vigente", "proximo_a_vencer", "no_va_a_renovar", "llamada_recompra", "estan_bien"}


def activo(p: dict) -> bool:
    canal = p["canal"]
    if canal["inactivo"] or canal["pausa"] or canal["vencido"]:
        return False
    estado = p["cliente"].get("estado_efectivo") or p["cliente"].get("estado_cliente")
    return estado is None or estado in ESTADOS_ACTIVOS


def filtrar_pendientes(pendientes: list[dict], dias: int, persona: int | None, todos: bool) -> list[dict]:
    """Por defecto, solo clientes activos y lo de los últimos `dias`. Con persona, los chats que lleva o donde la etiquetaron."""
    salida = pendientes if todos else [p for p in pendientes if activo(p) and p["minutos_esperando"] <= dias * 1440]
    if persona is not None:
        salida = [p for p in salida if (p["responsable"] or {}).get("id") == persona or persona in p["mencionados"]]
    return salida


_SQL_EQUIPO = f'SELECT id, nombre, email, email_alterno FROM "{S}"."admins" WHERE activo AND NOT borrado'


def persona_de(equipo: list[dict], quien: str) -> dict:
    """De quién son los pendientes: id, mail o nombre (o solo el primer nombre, si no hay dos iguales)."""
    q = (quien or "").strip().lower()
    if q.isdigit():
        hallada = [a for a in equipo if a["id"] == int(q)]
    else:
        hallada = [a for a in equipo if q in {(a.get("email") or "").lower(), (a.get("email_alterno") or "").lower(), (a.get("nombre") or "").lower()}]
        if not hallada:
            hallada = [a for a in equipo if (a.get("nombre") or "").lower().split(" ")[:1] == [q]]
    if len(hallada) != 1:
        nombres = ", ".join(a["nombre"] for a in equipo if a.get("nombre"))
        raise HTTPException(status_code=404, detail=f"No sé quién es «{quien}» en el equipo. Están: {nombres}.")
    return hallada[0]


def canales_pendientes(agente: dict, dias: int = 14, para: str | None = None, todos: bool = False) -> dict:
    with _lectura() as cur:
        filas = _filas(cur, _SQL_ULTIMOS)
        equipo = _filas(cur, _SQL_EQUIPO) if para else []
    pendientes = pendientes_de(filas, datetime.utcnow())
    persona = persona_de(equipo, para) if para else None
    lista = filtrar_pendientes(pendientes, dias, persona["id"] if persona else None, todos)
    return {
        "pendientes": lista,
        "cantidad": len(lista),
        "de": persona["nombre"] if persona else None,
        "criterio": "todos los chats" if todos else f"clientes activos, últimos {dias} días, el que más espera primero",
    }


_SQL_CANAL = f'SELECT id, tipo, cliente_id, nombre FROM "{S}"."canales" WHERE id = %(canal)s'

_SQL_MENSAJES = f"""SELECT m.id, CASE WHEN m.autor_tipo = 'cliente' THEN 'cliente' ELSE 'equipo' END AS autor_tipo,
  coalesce(m.autor_nombre, a.nombre, mc.nombre, k.nombre) AS autor_nombre, m.texto, m.respuesta_a, m.creado_en, m.editado_en
FROM "{S}"."mensajes_canal" m
JOIN "{S}"."canales" c ON c.id = m.canal
LEFT JOIN "{S}"."admins" a ON m.autor_tipo <> 'cliente' AND a.id = m.autor_id
LEFT JOIN "{S}"."miembros_cliente" mc ON m.autor_tipo = 'cliente' AND mc.id = m.miembro_id
LEFT JOIN clients.clientes k ON m.autor_tipo = 'cliente' AND k.id = m.autor_id
WHERE m.canal = %(canal)s AND c.tipo = 'cliente' AND NOT m.borrado
ORDER BY m.creado_en DESC, m.id DESC
LIMIT %(limite)s"""


def _mensajes(cur, canal_id: int, limite: int) -> list[dict]:
    """Los últimos `limite` mensajes del canal, en orden de lectura (el más viejo primero)."""
    filas = _filas(cur, _SQL_MENSAJES, {"canal": canal_id, "limite": limite})
    return [_limpio(f) for f in reversed(filas)]


def mensajes_canal(agente: dict, canal_id: int, limite: int) -> dict:
    with _lectura() as cur:
        canal = next(iter(_filas(cur, _SQL_CANAL, {"canal": canal_id})), None)
        # Solo los chats de clientes: un canal privado o de la comunidad no existe para los agentes.
        if not canal or canal["tipo"] != "cliente":
            raise HTTPException(status_code=404, detail="Ese canal de cliente no existe.")
        mensajes = _mensajes(cur, canal_id, limite)
    return {"canal_id": canal_id, "cliente_id": canal["cliente_id"], "mensajes": mensajes}


# ---------- Resumen del cliente ----------


def _sql_cliente(plata: bool) -> str:
    extra = "".join(f", k.{c}" for c in _COLUMNAS_PLATA) if plata else ""
    return (
        "SELECT k.id, k.nombre, k.email, k.plan_actual, k.estado_cliente, e.estado_efectivo, e.dias_restantes, "
        "k.fecha_inicio, k.fecha_vencimiento, k.duracion_dias, k.fecha_alta, k.fecha_baja, k.responsable, k.oportunidad, "
        f"k.observaciones, k.dudas, k.acciones_revisar{extra} "
        "FROM clients.clientes k LEFT JOIN clients.clientes_con_estado e ON e.id = k.id WHERE k.id = %(cliente)s"
    )


_SQL_PROGRESO = f"""SELECT
  (SELECT count(DISTINCT clase_id) FROM "{S}"."progreso" WHERE cliente_id = %(cliente)s AND completado) AS completadas,
  (SELECT count(*) FROM "{S}"."clase") AS total,
  (SELECT max(completado_en) FROM "{S}"."progreso" WHERE cliente_id = %(cliente)s AND completado) AS ultima_completada_en"""

_SQL_ULTIMAS_CLASES = f"""SELECT c.id, c.titulo, pr.titulo AS modulo, p.completado_en
FROM "{S}"."progreso" p JOIN "{S}"."clase" c ON c.id = p.clase_id
JOIN "{S}"."seccion" s ON s.id = c.seccion JOIN "{S}"."programa" pr ON pr.id = s.programa
WHERE p.cliente_id = %(cliente)s AND p.completado ORDER BY p.completado_en DESC NULLS LAST LIMIT 5"""

_SQL_CANAL_CLIENTE = f"SELECT id FROM \"{S}\".\"canales\" WHERE tipo = 'cliente' AND cliente_id = %(cliente)s"

_SQL_LLAMADAS = f"""SELECT l.id, l.titulo, l.inicio, l.duracion_min, a.nombre AS coach, left(l.resumen, {MAX_RESUMEN_LLAMADA}) AS resumen
FROM "{S}"."llamadas" l LEFT JOIN "{S}"."admins" a ON a.id = l.admin_id
WHERE l.cliente_id = %(cliente)s ORDER BY l.inicio DESC NULLS LAST, l.id DESC LIMIT %(limite)s"""

_SQL_ONBOARDING = f'SELECT respondido_en, ficha_json FROM "{S}"."cerebro_onboarding" WHERE cliente_id = %(cliente)s'


def resumen_cliente(agente: dict, cliente_id: int, mensajes: int, llamadas: int) -> dict:
    plata = ve_plata(agente)
    p = {"cliente": cliente_id}
    with _lectura() as cur:
        cliente = next(iter(_filas(cur, _sql_cliente(plata), p)), None)
        if not cliente:
            raise HTTPException(status_code=404, detail="Ese cliente no existe.")
        progreso = _filas(cur, _SQL_PROGRESO, p)[0]
        ultimas = _filas(cur, _SQL_ULTIMAS_CLASES, p)
        canal = next(iter(_filas(cur, _SQL_CANAL_CLIENTE, p)), None)
        chat = _mensajes(cur, canal["id"], mensajes) if canal else []
        lista_llamadas = _filas(cur, _SQL_LLAMADAS, {**p, "limite": llamadas})
        onboarding = next(iter(_filas(cur, _SQL_ONBOARDING, p)), None)
    if not plata:
        for c in _COLUMNAS_PLATA:
            cliente.pop(c, None)
    return {
        "cliente": _limpio(cliente),
        "progreso": {
            "clases_completadas": progreso["completadas"] or 0,
            "clases_total": progreso["total"] or 0,
            "ultima_completada_en": _iso(progreso["ultima_completada_en"]),
            "ultimas_clases": [_limpio(f) for f in ultimas],
        },
        "canal_id": canal["id"] if canal else None,
        "mensajes": chat,
        "llamadas": [_limpio(f) for f in lista_llamadas],
        "onboarding": {
            "respondido": onboarding is not None,
            "respondido_en": _iso(onboarding["respondido_en"]) if onboarding else None,
            "ficha": _json(onboarding["ficha_json"]) if onboarding else None,
        },
    }


# ---------- Piloto y llamadas (lo que usa Leverage) ----------
def puede_piloto(agente: dict) -> None:
    """Cambiar el modo del piloto escribe: pide el permiso "piloto" además de lectura."""
    if "piloto" not in agente.get("scopes", []):
        raise HTTPException(status_code=403, detail='Esta clave no tiene el permiso "piloto".')


_SQL_LLAMADAS_COACH = f"""SELECT l.id, l.titulo, l.inicio, l.duracion_min, l.cliente_id, k.nombre AS cliente,
  l.resumen, l.puntos_json{{transcripcion}}
FROM "{S}"."llamadas" l LEFT JOIN "clients"."clientes" k ON k.id = l.cliente_id
WHERE l.admin_id = %(coach)s AND l.id > %(despues_de)s ORDER BY l.id LIMIT %(limite)s"""


def llamadas_de_coach(agente: dict, coach_id: int, despues_de: int, limite: int, transcripcion: bool) -> dict:
    """Las llamadas de Fathom de un coach, en orden, de a páginas (despues_de = el último id que ya tenés)."""
    sql = _SQL_LLAMADAS_COACH.replace("{transcripcion}", ", l.transcripcion" if transcripcion else "")
    with _lectura() as cur:
        coach = next(iter(_filas(cur, f'SELECT id, nombre FROM "{S}"."admins" WHERE id = %(coach)s', {"coach": coach_id})), None)
        if coach is None:
            raise HTTPException(status_code=404, detail="No existe esa persona del equipo.")
        filas = _filas(cur, sql, {"coach": coach_id, "despues_de": despues_de, "limite": limite + 1})
    hay_mas = len(filas) > limite
    filas = filas[:limite]
    salida = []
    for f in filas:
        f = _limpio(f)
        f["puntos"] = _json(f.pop("puntos_json", None))
        salida.append(f)
    return {"coach": _limpio(coach), "llamadas": salida, "hay_mas": hay_mas, "ultimo_id": salida[-1]["id"] if salida else despues_de}

