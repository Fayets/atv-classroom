"""Toda la base para los agentes: cada tabla (y vista) de cada esquema se lee como una vista segura
`<esquema>__<tabla>` (por ejemplo `ops__leads_audiencia`), un CTE con las columnas permitidas.

Acá solo se arma el catálogo y el SELECT de cada CTE. Las consultas las corre agentes_service en una
conexión de solo lectura, y los agentes nunca nombran tablas reales (esquema.tabla se rechaza): lo que no
está en el CTE no se puede leer.

Qué no sale nunca (motivo "secreto"):
- El esquema neon_auth entero, classroom.sesiones y las tablas de sesiones de login, tokens,
  credenciales, secretos y claves o suscripciones push.
- Las columnas de contraseñas, hashes, tokens, secretos, claves de API, cifrados, cookies, OTP,
  claves privadas, credenciales y auth.
Plata (motivo "plata", solo con el permiso "plata"): las tablas de pagos, cuotas y caja, y las columnas
de montos, importes, precios, pagado, adeudado, cobro, cash, USD/EUR/ARS y totales.
Chats privados: en el esquema del classroom no están las filas de los canales directo/privado/dm (ni sus
mensajes, adjuntos, reacciones…) ni los mensajes borrados, igual que en las vistas del cerebro.
"""

import re

from src.db import DB_SCHEMA

S = DB_SCHEMA
SEPARADOR = "__"
SECRETO = "secreto"
PLATA = "plata"

ESQUEMAS_SECRETOS = frozenset({"neon_auth"})
TABLAS_SECRETAS = frozenset({(S, "sesiones")})
# Sesiones de login (la tabla se llama sesion/es o session/s: «sesiones_notas» son notas de llamadas de
# setting y sí entra), tokens, credenciales, secretos y claves o suscripciones push (endpoint + claves del navegador).
_TABLA_SECRETA = re.compile(
    r"(^|_)(sesion|sesiones|session|sessions)$|token|credencial|credential|secret|vault|push_su[bs]|push_clave|webauthn|otp"
)
# Sobre el nombre en minúscula y con camelCase pasado a snake_case (accessToken → access_token).
_COLUMNA_SECRETA = re.compile(
    r"(^|_)pass"  # password, passwd, password_hash, password_encrypted
    r"|(^|_)hash(ed)?(_|$)"  # password_hash, token_hash (no «hashtag»)
    r"|(^|_)token(_|$)"  # token, webhook_token, id_token (no «tokens_entrada»: son conteos de uso de la IA)
    r"|secret"  # secret, webhook_secreto_cifrado
    r"|api_?key"  # fathom_api_key
    r"|(^|_)claves?_(api|privada|secreta|cifrada|acceso)"  # «clave» sola es el nombre de un ajuste o de un evento
    r"|cifrad|encrypt"  # clave_cifrada (no «cifra»)
    r"|cookie|refresh|access_key|vapid|credencial|credential"
    r"|(^|_)otp(_|$)"
    r"|privad|private"  # privada (claves push), private_key
    r"|(^|_)o?auth(_|$)"  # auth, oauth (no «autor» ni «author»)
)

TABLAS_PLATA = frozenset(
    ("clients", t)
    for t in (
        "pagos", "cuotas", "cuota_comprobantes", "cuota_eventos", "pago_imputaciones", "caja_meta",
        "caja_ventas_nuevas", "analisis_cash",
    )
)
# Y cualquier otra tabla de pagos, cuotas, caja o cash (ops.linea_pagos_docs).
_TABLA_PLATA = re.compile(r"(^|_)(pagos?|cuotas?|caja|cash)(_|$)")
_COLUMNA_PLATA = re.compile(
    r"(^|_)(monto|importe|precio|pagad|adeudad|cobr)"  # monto_usd, precio_usd, total_pagado_usd, prioridad_cobro
    r"|(^|_)(cash|usd|eur|ars)(_|$)"  # cash_usd, costo_usd, saldo_usd
    r"|(^|_)total_"  # total_usd, total_analizados
)

_TIPOS_PRIVADOS = "('directo', 'privado', 'dm')"
_NOTA_PRIVADOS = "Sin los chats privados (canales directo, privado y dm)."

SQL_CATALOGO = """SELECT c.table_schema AS esquema, c.table_name AS tabla, t.table_type AS tipo_tabla, c.column_name AS columna,
  CASE WHEN c.data_type IN ('USER-DEFINED', 'ARRAY') THEN c.udt_name ELSE c.data_type END AS tipo,
  cl.reltuples AS filas_aprox
FROM information_schema.columns c
JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = c.table_schema
LEFT JOIN pg_catalog.pg_class cl ON cl.relnamespace = n.oid AND cl.relname = c.table_name
WHERE c.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast') AND c.table_schema NOT LIKE 'pg\\_%'
ORDER BY c.table_schema, c.table_name, c.ordinal_position"""


def _snake(nombre: str) -> str:
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", nombre).lower()


def _comillas(nombre: str) -> str:
    return '"' + nombre.replace('"', '""') + '"'


def nombre_cte(esquema: str, tabla: str) -> str:
    return f"{esquema}{SEPARADOR}{tabla}"


def motivo_tabla(esquema: str, tabla: str) -> str | None:
    """secreto, plata o None (la tabla entra para todos)."""
    nombre = _snake(tabla)
    if esquema in ESQUEMAS_SECRETOS or (esquema, tabla) in TABLAS_SECRETAS or _TABLA_SECRETA.search(nombre):
        return SECRETO
    if (esquema, tabla) in TABLAS_PLATA or _TABLA_PLATA.search(nombre):
        return PLATA
    return None


def motivo_columna(columna: str) -> str | None:
    nombre = _snake(columna)
    if _COLUMNA_SECRETA.search(nombre):
        return SECRETO
    if _COLUMNA_PLATA.search(nombre):
        return PLATA
    return None


def _filtro(esquema: str, tabla: str, columnas: set[str]) -> tuple[str, str | None]:
    """El WHERE que deja afuera los chats privados en el esquema del classroom, y la nota que lo explica."""
    if esquema != S:
        return "", None
    canales_ok = f"SELECT id FROM {_comillas(S)}.\"canales\" WHERE tipo NOT IN {_TIPOS_PRIVADOS}"
    if tabla == "canales":
        return f"tipo NOT IN {_TIPOS_PRIVADOS}", _NOTA_PRIVADOS
    if tabla == "mensajes_canal":
        return f"NOT borrado AND canal IN ({canales_ok})", _NOTA_PRIVADOS + " Sin los mensajes borrados."
    if "canal_id" in columnas:
        return f"(canal_id IS NULL OR canal_id IN ({canales_ok}))", _NOTA_PRIVADOS
    return "", None


def _filas_aprox(v) -> int | None:
    # reltuples es -1 si Postgres todavía no midió la tabla.
    return None if v is None or v < 0 else int(v)


def armar(filas: list[dict]) -> dict:
    """El catálogo completo (sin mirar permisos) a partir de las filas de SQL_CATALOGO."""
    tablas: dict[tuple[str, str], dict] = {}
    for f in filas:
        clave = (f["esquema"], f["tabla"])
        t = tablas.get(clave)
        if t is None:
            t = tablas[clave] = {
                "esquema": f["esquema"],
                "tabla": f["tabla"],
                "cte": nombre_cte(f["esquema"], f["tabla"]),
                "tipo": "vista" if f["tipo_tabla"] == "VIEW" else "tabla",
                "filas_aprox": _filas_aprox(f["filas_aprox"]),
                "motivo": motivo_tabla(f["esquema"], f["tabla"]),
                "columnas": [],
            }
        t["columnas"].append({"nombre": f["columna"], "tipo": f["tipo"], "motivo": motivo_columna(f["columna"])})
    for t in tablas.values():
        t["filtro"], t["nota"] = _filtro(t["esquema"], t["tabla"], {c["nombre"] for c in t["columnas"]})
    return {"tablas": sorted(tablas.values(), key=lambda t: (t["esquema"], t["tabla"]))}


def _oculto(motivo: str | None, plata: bool) -> bool:
    return motivo == SECRETO or (motivo == PLATA and not plata)


def _visibles(t: dict, plata: bool) -> list[dict]:
    return [c for c in t["columnas"] if not _oculto(c["motivo"], plata)]


def motivo_ausente(t: dict, plata: bool) -> str | None:
    """Por qué la tabla no está para esta clave (secreto / plata), o None si está."""
    if _oculto(t["motivo"], plata):
        return t["motivo"]
    if not _visibles(t, plata):
        # Todas sus columnas son secretas o de plata: la tabla tampoco está.
        return SECRETO if any(c["motivo"] == SECRETO for c in t["columnas"]) else PLATA
    return None


def sql_cte(t: dict, plata: bool) -> str:
    columnas = ", ".join(_comillas(c["nombre"]) for c in _visibles(t, plata))
    sql = f"SELECT {columnas} FROM {_comillas(t['esquema'])}.{_comillas(t['tabla'])}"
    return f"{sql} WHERE {t['filtro']}" if t["filtro"] else sql


def ctes(catalogo: dict, plata: bool) -> dict[str, str]:
    """{nombre del CTE: SELECT} de todas las tablas que esta clave puede leer."""
    return {t["cte"]: sql_cte(t, plata) for t in catalogo["tablas"] if motivo_ausente(t, plata) is None}


def ausentes(catalogo: dict, plata: bool) -> dict[str, str]:
    """{nombre del CTE: motivo} de las tablas que existen pero esta clave no puede leer."""
    return {t["cte"]: m for t in catalogo["tablas"] if (m := motivo_ausente(t, plata))}


def para_agente(catalogo: dict, plata: bool) -> dict:
    """Lo que ve el agente en GET /api/agentes/tablas: por esquema, sus tablas con columnas y lo excluido."""
    esquemas: dict[str, dict] = {}
    excluidos: dict[str, int] = {}
    totales = {"tablas": 0, "columnas": 0, "tablas_excluidas": 0, "columnas_excluidas": 0}
    for t in catalogo["tablas"]:
        if t["esquema"] in ESQUEMAS_SECRETOS:
            excluidos[t["esquema"]] = excluidos.get(t["esquema"], 0) + 1
            totales["tablas_excluidas"] += 1
            continue
        e = esquemas.setdefault(t["esquema"], {"tablas": [], "tablas_excluidas": []})
        motivo = motivo_ausente(t, plata)
        if motivo:
            e["tablas_excluidas"].append({"tabla": t["tabla"], "cte": t["cte"], "motivo": motivo})
            totales["tablas_excluidas"] += 1
            continue
        visibles = _visibles(t, plata)
        excluidas = [{"nombre": c["nombre"], "motivo": c["motivo"]} for c in t["columnas"] if _oculto(c["motivo"], plata)]
        tabla = {
            "tabla": t["tabla"],
            "cte": t["cte"],
            "tipo": t["tipo"],
            "filas_aprox": t["filas_aprox"],
            "columnas": [{"nombre": c["nombre"], "tipo": c["tipo"]} for c in visibles],
            "columnas_excluidas": excluidas,
        }
        if t["nota"]:
            tabla["nota"] = t["nota"]
        e["tablas"].append(tabla)
        totales["tablas"] += 1
        totales["columnas"] += len(visibles)
        totales["columnas_excluidas"] += len(excluidas)
    totales["esquemas"] = len(esquemas)
    return {
        "esquemas": esquemas,
        "esquemas_excluidos": [{"esquema": e, "motivo": SECRETO, "tablas": n} for e, n in sorted(excluidos.items())],
        "totales": totales,
    }
