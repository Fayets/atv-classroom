"""API de lectura para los agentes (/api/agentes): claves, permisos, canales privados y solo lectura.

Estos tests no tocan ninguna base: psycopg2.connect se reemplaza por una conexión falsa que responde
filas armadas acá (y que falla si algo intenta conectarse sin que el test lo espere)."""

import hashlib
import json
import logging
from datetime import datetime, timedelta

import psycopg2
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.controllers.agentes_controller import router
from src.services import agentes_service as svc
from src.services import agentes_tablas as tablas
from src.services import cerebro_chat_service as cerebro

CLAVE = "clave-de-prueba-lectura"
CLAVE_PLATA = "clave-de-prueba-plata"
CLAVE_SIN_LECTURA = "clave-de-prueba-sin-permisos"


def _h(clave: str) -> str:
    return hashlib.sha256(clave.encode()).hexdigest()


CLAVES = json.dumps({
    "redactor": {"sha256": _h(CLAVE), "scopes": ["lectura"]},
    "cobranzas": {"sha256": _h(CLAVE_PLATA), "scopes": ["lectura", "plata"]},
    "mudo": {"sha256": _h(CLAVE_SIN_LECTURA), "scopes": []},
})

RUTAS = [
    ("post", "/api/agentes/consulta", {"sql": "SELECT 1"}),
    ("get", "/api/agentes/tablas", None),
    ("get", "/api/agentes/canales/pendientes", None),
    ("get", "/api/agentes/canales/1/mensajes", None),
    ("get", "/api/agentes/clientes/1/resumen", None),
]


class _Cursor:
    def __init__(self, conn):
        self.conn = conn
        self.description = None
        self._filas = []

    def execute(self, sql, params=None):
        self.conn.ejecutadas.append((sql, params))
        columnas, filas = self.conn.responder(sql, params)
        self.description = [(c,) for c in columnas]
        self._filas = filas

    def fetchall(self):
        return list(self._filas)

    def fetchmany(self, n):
        return list(self._filas[:n])

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _Conexion:
    def __init__(self, responder):
        self.responder = responder
        self.ejecutadas = []
        self.sesion = None
        self.rollback_hecho = False
        self.cerrada = False

    def set_session(self, **kw):
        self.sesion = kw

    def cursor(self):
        return _Cursor(self)

    def rollback(self):
        self.rollback_hecho = True

    def close(self):
        self.cerrada = True


def _sin_filas(sql, params):
    return ["x"], []


@pytest.fixture(autouse=True)
def _sin_base(monkeypatch):
    """Nadie se conecta a una base real: ni a la de producción del .env ni a ninguna otra."""

    def prohibido(**_kw):
        raise AssertionError("Este test no esperaba una conexión a la base")

    monkeypatch.setattr(psycopg2, "connect", prohibido)
    monkeypatch.setattr(svc, "_psycopg2_connect_kwargs", lambda: {})
    monkeypatch.setattr(cerebro, "_psycopg2_connect_kwargs", lambda: {})
    monkeypatch.setenv("AGENTES_KEYS", CLAVES)
    # El catálogo de toda la base se guarda 10 minutos: cada test arranca sin él.
    monkeypatch.setattr(svc, "_catalogo_cache", {"datos": None, "hasta": 0.0})


@pytest.fixture
def base(monkeypatch):
    """Conexión falsa: base(responder) la instala y la devuelve para mirar qué se ejecutó."""

    def instalar(responder=_sin_filas):
        conn = _Conexion(responder)
        monkeypatch.setattr(psycopg2, "connect", lambda **_kw: conn)
        return conn

    return instalar


@pytest.fixture
def http():
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _pedir(http, metodo, ruta, cuerpo, clave=None):
    headers = {"X-Agente-Key": clave} if clave is not None else {}
    return getattr(http, metodo)(ruta, headers=headers, **({"json": cuerpo} if cuerpo else {}))


# ---------- Claves ----------


@pytest.mark.parametrize("metodo,ruta,cuerpo", RUTAS)
@pytest.mark.parametrize("valor", ["", "esto no es json", "[1, 2]"])
def test_sin_claves_la_api_no_existe(http, monkeypatch, metodo, ruta, cuerpo, valor):
    monkeypatch.setenv("AGENTES_KEYS", valor)
    assert _pedir(http, metodo, ruta, cuerpo, CLAVE).status_code == 404


@pytest.mark.parametrize("metodo,ruta,cuerpo", RUTAS)
def test_sin_clave_o_con_clave_ajena_da_401(http, metodo, ruta, cuerpo):
    assert _pedir(http, metodo, ruta, cuerpo).status_code == 401
    assert _pedir(http, metodo, ruta, cuerpo, "otra-clave").status_code == 401
    # El hash en sí no sirve de clave.
    assert _pedir(http, metodo, ruta, cuerpo, _h(CLAVE)).status_code == 401


def test_clave_sin_permiso_de_lectura_da_403(http):
    assert _pedir(http, "get", "/api/agentes/canales/pendientes", None, CLAVE_SIN_LECTURA).status_code == 403


def test_clave_valida_entra_y_queda_registrado_quien_sin_la_clave(http, base, caplog):
    base()
    with caplog.at_level(logging.INFO, logger="agentes"):
        r = _pedir(http, "get", "/api/agentes/canales/pendientes", None, CLAVE)
    assert r.status_code == 200
    assert r.json() == {"pendientes": [], "cantidad": 0}
    assert "redactor" in caplog.text and "/api/agentes/canales/pendientes" in caplog.text
    assert CLAVE not in caplog.text and _h(CLAVE) not in caplog.text


# ---------- Consulta SQL ----------


@pytest.mark.parametrize("clave,plata", [(CLAVE, False), (CLAVE_PLATA, True)])
def test_la_consulta_lleva_plata_solo_con_el_permiso(http, monkeypatch, clave, plata):
    visto = {}

    def falsa(sql, con_plata, tablas_base=None):
        visto["plata"] = con_plata
        return {"columnas": ["n"], "filas": [[1]], "cantidad": 1, "hay_mas": False}

    monkeypatch.setattr(cerebro, "consultar_vistas", falsa)
    r = _pedir(http, "post", "/api/agentes/consulta", {"sql": "SELECT 1 AS n"}, clave)
    assert r.status_code == 200 and r.json()["filas"] == [[1]]
    assert visto["plata"] is plata


@pytest.mark.parametrize("plata", [False, True])
def test_las_vistas_de_plata_solo_existen_con_plata(base, plata):
    conn = base(lambda sql, p: (["n"], [(1,)]))
    assert not cerebro.consultar_vistas("SELECT count(*) AS n FROM clientes", plata).get("error")
    final = conn.ejecutadas[-1][0]
    assert ('"pagos" AS' in final) is plata
    assert ('"cuotas" AS' in final) is plata
    assert ("total_pagado_usd" in final) is plata


def test_las_vistas_no_traen_canales_privados_ni_borrados(base):
    conn = base(lambda sql, p: (["n"], [(1,)]))
    cerebro.consultar_vistas("SELECT count(*) AS n FROM mensajes", True)
    final = conn.ejecutadas[-1][0]
    vistas = cerebro.vistas_permitidas(True)
    for nombre in ("canales", "mensajes"):
        assert "NOT IN ('directo', 'privado', 'dm')" in vistas[nombre][0]
    assert "NOT m.borrado" in vistas["mensajes"][0]
    assert f'"mensajes" AS ({vistas["mensajes"][0]})' in final


@pytest.mark.parametrize("q", [
    "DELETE FROM mensajes",
    "UPDATE hechos SET texto = ''",
    "INSERT INTO hechos (texto) VALUES ('x')",
    "DROP TABLE clientes",
    "SELECT 1; DELETE FROM mensajes",
    "WITH d AS (DELETE FROM hechos RETURNING 1) SELECT * FROM d",
    "SELECT * FROM classroom.mensajes_canal",
    'SELECT * FROM "classroom"."sesiones"',
    "SELECT pg_sleep(5)",
    "CREATE TABLE x (id int)",
])
def test_la_consulta_rechaza_escrituras_sin_conectarse(http, q):
    # Si algo intentara conectarse, el psycopg2.connect prohibido del fixture haría fallar el test.
    r = _pedir(http, "post", "/api/agentes/consulta", {"sql": q}, CLAVE_PLATA)
    assert r.status_code == 400
    assert r.json()["detail"]


def test_la_consulta_corre_en_solo_lectura_y_se_descarta(http, base):
    conn = base(lambda sql, p: (["n"], [(i,) for i in range(cerebro.MAX_FILAS + 5)]))
    r = _pedir(http, "post", "/api/agentes/consulta", {"sql": "SELECT id AS n FROM mensajes"}, CLAVE)
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["cantidad"] == cerebro.MAX_FILAS and cuerpo["hay_mas"] is True
    assert conn.sesion == {"readonly": True, "autocommit": False}
    assert conn.rollback_hecho and conn.cerrada


def test_un_error_de_la_base_vuelve_como_400_legible(http, base):
    def falla(sql, p):
        if sql.startswith("WITH"):
            raise psycopg2.ProgrammingError('column "nada" does not exist')
        return ["x"], []

    conn = base(falla)
    r = _pedir(http, "post", "/api/agentes/consulta", {"sql": "SELECT nada FROM clientes"}, CLAVE)
    assert r.status_code == 400 and "nada" in r.json()["detail"]
    assert conn.rollback_hecho and conn.cerrada


# ---------- Toda la base: <esquema>__<tabla> ----------

S = tablas.S
COLUMNAS_CATALOGO = ["esquema", "tabla", "tipo_tabla", "columna", "tipo", "filas_aprox"]


def _col(esquema, tabla, columna, tipo="text", tipo_tabla="BASE TABLE", filas=10.0):
    return (esquema, tabla, tipo_tabla, columna, tipo, filas)


FILAS_CATALOGO = [
    _col("ops", "leads_audiencia", "id", "integer", filas=845.0),
    _col("ops", "leads_audiencia", "nombre", filas=845.0),
    _col("ops", "leads_audiencia", "autor", filas=845.0),
    _col("ops", "leads_audiencia", "monto_usd", "numeric", filas=845.0),
    _col("ops", "sesiones_notas", "id", "integer", filas=-1.0),
    _col("ops", "sesiones_notas", "resumen", filas=-1.0),
    _col("ops", "usuarios", "id", "integer"),
    _col("ops", "usuarios", "username"),
    _col("ops", "usuarios", "password_hash"),
    _col("ops", "conexiones_api", "plataforma"),
    _col("ops", "conexiones_api", "credenciales"),
    _col(S, "admins", "id", "integer"),
    _col(S, "admins", "nombre"),
    _col(S, "admins", "password_hash"),
    _col(S, "sesiones", "id", "integer"),
    _col(S, "sesiones", "email"),
    _col(S, "push_suscripciones", "endpoint"),
    _col(S, "canales", "id", "integer"),
    _col(S, "canales", "tipo"),
    _col(S, "canales", "nombre"),
    _col(S, "mensajes_canal", "id", "integer"),
    _col(S, "mensajes_canal", "canal", "integer"),
    _col(S, "mensajes_canal", "texto"),
    _col(S, "mensajes_canal", "borrado", "boolean"),
    _col(S, "reacciones", "canal_id", "integer"),
    _col(S, "reacciones", "emoji"),
    _col("clients", "clientes", "id", "integer"),
    _col("clients", "clientes", "nombre"),
    _col("clients", "clientes", "total_pagado_usd", "numeric"),
    _col("clients", "clientes", "prioridad_cobro"),
    _col("clients", "clientes", "password_hash"),
    _col("clients", "clientes_con_estado", "id", "integer", tipo_tabla="VIEW", filas=-1.0),
    _col("clients", "pagos", "cliente_id", "integer"),
    _col("clients", "pagos", "monto_usd", "numeric"),
    _col("roadmaps", "roadmaps", "id", "integer"),
    _col("roadmaps", "roadmaps", "titulo"),
    _col("roadmaps", "roadmaps", "token"),
    _col("neon_auth", "user", "id", "uuid"),
    _col("neon_auth", "user", "email"),
    _col("neon_auth", "account", "accessToken"),
]


def _catalogo():
    return tablas.armar([dict(zip(COLUMNAS_CATALOGO, f)) for f in FILAS_CATALOGO])


def _base_falsa(sql, params):
    """Responde el catálogo de arriba, los esquemas de pg_namespace y una fila para lo demás."""
    if "information_schema.columns" in sql:
        return COLUMNAS_CATALOGO, list(FILAS_CATALOGO)
    if "pg_namespace" in sql:
        return ["nspname"], [(e,) for e in ("ops", S, "clients", "roadmaps", "neon_auth", "public", "pg_catalog")]
    return ["n"], [(1,)]


def _final(conn):
    return [sql for sql, _ in conn.ejecutadas if sql.startswith("WITH")][-1]


@pytest.mark.parametrize("columna", [
    "password", "password_hash", "password_encrypted", "email_and_password", "token", "token_hash", "webhook_token",
    "contract_doc_token", "accessToken", "refreshToken", "idToken", "privateKey", "secret", "webhook_secreto_cifrado",
    "clave_cifrada", "clave_api", "fathom_api_key", "apikey", "credenciales", "privada", "auth", "oauth", "cookie", "otp",
    "vapid_publica", "access_key_id",
])
def test_columnas_secretas(columna):
    assert tablas.motivo_columna(columna) == tablas.SECRETO


@pytest.mark.parametrize("columna", [
    "monto_usd", "montos", "importe", "precio_lista", "total_pagado_usd", "total_adeudado_usd", "prioridad_cobro",
    "cash_usd", "costo_usd", "saldo_eur", "monto_ars", "pagado", "total_analizados",
])
def test_columnas_de_plata(columna):
    assert tablas.motivo_columna(columna) == tablas.PLATA


@pytest.mark.parametrize("columna", [
    "autor", "autor_nombre", "author", "clave", "clave_ia", "tokens_entrada", "hashtag", "cifras", "pasos", "session_id",
    "publica", "email", "facturacion", "ingresos_rango", "europa", "neuro", "pasos_total", "id",
])
def test_columnas_que_entran(columna):
    assert tablas.motivo_columna(columna) is None


@pytest.mark.parametrize("esquema,tabla,motivo", [
    (S, "sesiones", "secreto"),
    ("neon_auth", "user", "secreto"),
    ("neon_auth", "organization", "secreto"),
    ("onboarding", "sessions", "secreto"),
    (S, "push_suscripciones", "secreto"),
    (S, "push_claves", "secreto"),
    ("ops", "api_tokens", "secreto"),
    ("ops", "credenciales", "secreto"),
    ("ops", "webauthn_llaves", "secreto"),
    *[("clients", t, "plata") for t in (
        "pagos", "cuotas", "cuota_comprobantes", "cuota_eventos", "pago_imputaciones", "caja_meta", "caja_ventas_nuevas",
        "analisis_cash",
    )],
    ("ops", "linea_pagos_docs", "plata"),
    ("ops", "sesiones_notas", None),
    ("ops", "leads_audiencia", None),
    ("clients", "clientes", None),
    ("onboarding", "forms", None),
])
def test_tablas_secretas_y_de_plata(esquema, tabla, motivo):
    assert tablas.motivo_tabla(esquema, tabla) == motivo


def test_los_cte_llevan_solo_las_columnas_permitidas():
    sin, con = tablas.ctes(_catalogo(), False), tablas.ctes(_catalogo(), True)
    assert sin["ops__leads_audiencia"] == 'SELECT "id", "nombre", "autor" FROM "ops"."leads_audiencia"'
    assert con["ops__leads_audiencia"] == 'SELECT "id", "nombre", "autor", "monto_usd" FROM "ops"."leads_audiencia"'
    assert sin["ops__conexiones_api"] == con["ops__conexiones_api"] == 'SELECT "plataforma" FROM "ops"."conexiones_api"'
    assert sin["roadmaps__roadmaps"] == 'SELECT "id", "titulo" FROM "roadmaps"."roadmaps"'
    assert sin["clients__clientes"] == 'SELECT "id", "nombre" FROM "clients"."clientes"'
    assert con["clients__clientes"] == 'SELECT "id", "nombre", "total_pagado_usd", "prioridad_cobro" FROM "clients"."clientes"'
    assert "clients__pagos" not in sin
    assert con["clients__pagos"] == 'SELECT "cliente_id", "monto_usd" FROM "clients"."pagos"'
    for ctes in (sin, con):
        assert "ops__sesiones_notas" in ctes and "clients__clientes_con_estado" in ctes
        for vedada in (f"{S}__sesiones", f"{S}__push_suscripciones", "neon_auth__user", "neon_auth__account"):
            assert vedada not in ctes
        texto = "\n".join(ctes.values())
        assert "password_hash" not in texto and '"token"' not in texto and "credenciales" not in texto


def test_las_tablas_de_chats_no_traen_privados_ni_borrados():
    ctes = tablas.ctes(_catalogo(), True)
    privados = "NOT IN ('directo', 'privado', 'dm')"
    assert ctes[f"{S}__canales"].endswith(f"WHERE tipo {privados}")
    assert f"WHERE NOT borrado AND canal IN (SELECT id FROM \"{S}\".\"canales\" WHERE tipo {privados})" in ctes[f"{S}__mensajes_canal"]
    assert f"(canal_id IS NULL OR canal_id IN (SELECT id FROM \"{S}\".\"canales\" WHERE tipo {privados}))" in ctes[f"{S}__reacciones"]
    assert "WHERE" not in ctes["ops__leads_audiencia"]


def test_la_consulta_suma_solo_las_tablas_que_nombra(http, base):
    conn = base(_base_falsa)
    sql = 'SELECT l.nombre, c.nombre FROM ops__leads_audiencia l JOIN "clients__clientes" c ON c.id = l.id LIMIT 5'
    r = _pedir(http, "post", "/api/agentes/consulta", {"sql": sql}, CLAVE)
    assert r.status_code == 200
    final = _final(conn)
    assert '"ops__leads_audiencia" AS (SELECT "id", "nombre", "autor" FROM "ops"."leads_audiencia")' in final
    assert '"clients__clientes" AS (SELECT "id", "nombre" FROM "clients"."clientes")' in final
    assert '"ops__usuarios" AS' not in final and f'"{S}__admins" AS' not in final and '"clients__pagos" AS' not in final
    # Las vistas de siempre siguen estando.
    assert '"clientes" AS (' in final and '"mensajes" AS (' in final
    assert final.endswith(sql)
    assert conn.sesion == {"readonly": True, "autocommit": False} and conn.rollback_hecho and conn.cerrada


def test_sin_tablas_de_la_base_no_se_lee_el_catalogo(http, base):
    conn = base(_base_falsa)
    assert _pedir(http, "post", "/api/agentes/consulta", {"sql": "SELECT count(*) FROM clientes"}, CLAVE).status_code == 200
    assert not any("information_schema" in sql for sql, _ in conn.ejecutadas)


def test_el_catalogo_se_lee_una_vez_y_queda_guardado(http, base):
    conn = base(_base_falsa)
    for _ in range(3):
        r = _pedir(http, "post", "/api/agentes/consulta", {"sql": "SELECT count(*) FROM ops__leads_audiencia"}, CLAVE)
        assert r.status_code == 200
    assert _pedir(http, "get", "/api/agentes/tablas", None, CLAVE_PLATA).status_code == 200
    assert sum("information_schema.columns" in sql for sql, _ in conn.ejecutadas) == 1


def test_el_catalogo_se_vuelve_a_leer_a_los_10_minutos(http, base, monkeypatch):
    conn = base(_base_falsa)
    reloj = [1000.0]
    monkeypatch.setattr(svc.time, "monotonic", lambda: reloj[0])
    _pedir(http, "get", "/api/agentes/tablas", None, CLAVE)
    reloj[0] += svc.CATALOGO_SEGUNDOS - 1
    _pedir(http, "get", "/api/agentes/tablas", None, CLAVE)
    reloj[0] += 2
    _pedir(http, "get", "/api/agentes/tablas", None, CLAVE)
    assert sum("information_schema.columns" in sql for sql, _ in conn.ejecutadas) == 2


@pytest.mark.parametrize("cte,motivo", [
    (f"{S}__sesiones", "secretos"),
    (f"{S}__push_suscripciones", "secretos"),
    ("neon_auth__user", "secretos"),
    ("clients__pagos", "plata"),
])
def test_una_tabla_excluida_da_400_con_el_motivo(http, base, cte, motivo):
    conn = base(_base_falsa)
    r = _pedir(http, "post", "/api/agentes/consulta", {"sql": f"SELECT * FROM {cte}"}, CLAVE)
    assert r.status_code == 400
    assert cte in r.json()["detail"] and motivo in r.json()["detail"]
    assert not any(sql.startswith("WITH") for sql, _ in conn.ejecutadas)


def test_con_plata_las_tablas_de_plata_estan(http, base):
    conn = base(_base_falsa)
    r = _pedir(http, "post", "/api/agentes/consulta", {"sql": "SELECT sum(monto_usd) FROM clients__pagos"}, CLAVE_PLATA)
    assert r.status_code == 200
    assert '"clients__pagos" AS (SELECT "cliente_id", "monto_usd" FROM "clients"."pagos")' in _final(conn)


def test_el_tope_de_filas_vale_para_las_tablas(http, base):
    def responder(sql, params):
        if sql.startswith("WITH"):
            return ["id"], [(i,) for i in range(cerebro.MAX_FILAS + 5)]
        return _base_falsa(sql, params)

    base(responder)
    r = _pedir(http, "post", "/api/agentes/consulta", {"sql": "SELECT id FROM ops__leads_audiencia"}, CLAVE)
    assert r.status_code == 200
    assert r.json()["cantidad"] == cerebro.MAX_FILAS and r.json()["hay_mas"] is True


@pytest.mark.parametrize("q", [
    "SELECT * FROM ops.leads_audiencia",
    "SELECT * FROM onboarding.sessions",
    "SELECT * FROM roadmaps.roadmaps",
    "SELECT * FROM neon_auth.user",
    'SELECT * FROM "neon_auth"."user"',
    "SELECT * FROM OPS . usuarios",
    "SELECT * FROM ops/* nada */.usuarios",
    "SELECT * FROM calendars.integrantes",
    "SELECT * FROM public.algo",
    "SELECT * FROM neondb.ops.usuarios",
    "SELECT * FROM information_schema.columns",
    "SELECT * FROM pg_catalog.pg_class",
    "SELECT * FROM pg_authid",
    # Lo que la revisión vieja (por texto) dejaba pasar: comillas de dólar, comentarios y E'\''.
    "SELECT $$'$$, * FROM ops.usuarios, $$'$$",
    "SELECT $x$'$x$ FROM ops.usuarios",
    "SELECT 1 -- '\n, (SELECT count(*) FROM classroom.sesiones) -- '",
    "SELECT E'\\'' , (SELECT 1 FROM ops.usuarios), ''",
    "SELECT query_to_xml('select * from ops.usuarios', true, false, '')",
    "SELECT table_to_xml('ops.usuarios', true, false, '')",
    "SELECT ts_stat('select 1')",
    "SELECT current_setting('search_path')",
    'SELECT * FROM U&"ops".usuarios',
    "SELECT * FROM ops__usuarios WHERE id = $1",
    "SELECT 1 /* sin cerrar",
    "SELECT 'sin cerrar",
    "SELECT roadmaps.titulo FROM roadmaps",
])
def test_la_consulta_rechaza_tablas_reales_y_catalogos_sin_conectarse(http, q):
    # Si algo intentara conectarse, el psycopg2.connect prohibido del fixture haría fallar el test.
    r = _pedir(http, "post", "/api/agentes/consulta", {"sql": q}, CLAVE_PLATA)
    assert r.status_code == 400
    assert r.json()["detail"]


def test_un_esquema_nuevo_tambien_se_rechaza(base):
    def responder(sql, params):
        if "pg_namespace" in sql:
            return ["nspname"], [("ventas_nuevas",)]
        return ["n"], [(1,)]

    conn = base(responder)
    r = cerebro.consultar_vistas("SELECT * FROM ventas_nuevas.tabla", True)
    assert "esquema" in r["error"]
    assert not any(sql.startswith("WITH") for sql, _ in conn.ejecutadas)
    assert conn.rollback_hecho and conn.cerrada


@pytest.mark.parametrize("q", [
    "SELECT r.titulo FROM roadmaps r",
    "SELECT count(*) FROM mensajes WHERE texto ILIKE '%delete from ops.usuarios; set create%'",
    "SELECT 'ops.usuarios' AS x, $$classroom.sesiones$$ AS y -- ops.usuarios\nFROM clientes",
    "WITH x AS (SELECT id FROM ops__leads_audiencia) SELECT count(*) FROM x",
])
def test_textos_comentarios_y_alias_no_chocan_con_el_control(http, base, q):
    conn = base(_base_falsa)
    r = _pedir(http, "post", "/api/agentes/consulta", {"sql": q}, CLAVE)
    assert r.status_code == 200, r.json()
    assert _final(conn).endswith(q[4:].lstrip() if q.startswith("WITH") else q)


def test_piezas_de_la_consulta():
    q = 'SELECT "Raro""x", Ops__X, \'it\'\'s\', E\'\\\'\' -- ops.y\n FROM /* a /* b */ c */ t'
    assert cerebro.piezas_sql(q) == [
        ("id", "select"), ("idq", 'Raro"x'), ("op", ","), ("id", "ops__x"), ("op", ","), ("lit", ""), ("op", ","),
        ("lit", ""), ("id", "from"), ("id", "t"),
    ]


def test_catalogo_de_tablas_sin_plata(http, base):
    base(_base_falsa)
    r = _pedir(http, "get", "/api/agentes/tablas", None, CLAVE)
    assert r.status_code == 200
    c = r.json()
    ops = {t["tabla"]: t for t in c["esquemas"]["ops"]["tablas"]}
    assert ops["leads_audiencia"] == {
        "tabla": "leads_audiencia",
        "cte": "ops__leads_audiencia",
        "tipo": "tabla",
        "filas_aprox": 845,
        "columnas": [{"nombre": "id", "tipo": "integer"}, {"nombre": "nombre", "tipo": "text"}, {"nombre": "autor", "tipo": "text"}],
        "columnas_excluidas": [{"nombre": "monto_usd", "motivo": "plata"}],
    }
    assert ops["sesiones_notas"]["filas_aprox"] is None
    assert ops["usuarios"]["columnas_excluidas"] == [{"nombre": "password_hash", "motivo": "secreto"}]
    clients = c["esquemas"]["clients"]
    assert clients["tablas_excluidas"] == [{"tabla": "pagos", "cte": "clients__pagos", "motivo": "plata"}]
    clientes = {t["tabla"]: t for t in clients["tablas"]}
    assert clientes["clientes"]["columnas_excluidas"] == [
        {"nombre": "total_pagado_usd", "motivo": "plata"},
        {"nombre": "prioridad_cobro", "motivo": "plata"},
        {"nombre": "password_hash", "motivo": "secreto"},
    ]
    assert clientes["clientes_con_estado"]["tipo"] == "vista"
    assert {"tabla": "sesiones", "cte": f"{S}__sesiones", "motivo": "secreto"} in c["esquemas"][S]["tablas_excluidas"]
    assert {"tabla": "push_suscripciones", "cte": f"{S}__push_suscripciones", "motivo": "secreto"} in c["esquemas"][S]["tablas_excluidas"]
    assert "nota" in {t["tabla"]: t for t in c["esquemas"][S]["tablas"]}["mensajes_canal"]
    assert "neon_auth" not in c["esquemas"]
    assert c["esquemas_excluidos"] == [{"esquema": "neon_auth", "motivo": "secreto", "tablas": 2}]
    nombres_vistas = {v["nombre"] for v in c["vistas"]}
    assert "clientes" in nombres_vistas and "pagos" not in nombres_vistas
    assert c["totales"]["tablas_excluidas"] == 5 and c["totales"]["esquemas"] == 4


def test_catalogo_de_tablas_con_plata(http, base):
    base(_base_falsa)
    c = _pedir(http, "get", "/api/agentes/tablas", None, CLAVE_PLATA).json()
    clients = c["esquemas"]["clients"]
    assert clients["tablas_excluidas"] == []
    clientes = {t["tabla"]: t for t in clients["tablas"]}
    assert "pagos" in clientes
    assert clientes["clientes"]["columnas_excluidas"] == [{"nombre": "password_hash", "motivo": "secreto"}]
    assert {"nombre": "total_pagado_usd", "tipo": "numeric"} in clientes["clientes"]["columnas"]
    assert "pagos" in {v["nombre"] for v in c["vistas"]}


def test_si_no_se_puede_leer_el_catalogo_da_503(http, base):
    def falla(sql, params):
        if "information_schema.columns" in sql:
            raise psycopg2.OperationalError("la base no responde")
        return ["x"], []

    conn = base(falla)
    assert _pedir(http, "get", "/api/agentes/tablas", None, CLAVE).status_code == 503
    assert conn.rollback_hecho and conn.cerrada


# ---------- Canales pendientes ----------

AHORA = datetime(2026, 11, 3, 12, 0, 0)


def _ultimo(canal_id, autor_tipo, hace_min, tipo="cliente", **extra):
    return {
        "canal_id": canal_id, "tipo": tipo, "canal_nombre": f"canal {canal_id}", "cliente_id": canal_id * 10,
        "pausa": False, "inactivo": False, "vencido": False, "cliente_nombre": f"Cliente {canal_id}",
        "plan_actual": "mid", "estado_cliente": "activo", "estado_efectivo": "vigente",
        "mensaje_id": canal_id * 100, "autor_tipo": autor_tipo, "autor_nombre": "Alguien", "texto": f"hola {canal_id}",
        "creado_en": AHORA - timedelta(minutes=hace_min), **extra,
    }


def test_pendientes_son_los_que_esperan_respuesta_el_mas_viejo_primero():
    filas = [
        _ultimo(1, "cliente", 30),
        _ultimo(2, "admin", 500),  # el equipo ya respondió
        _ultimo(3, "cliente", 240),
        _ultimo(4, "cliente", 999, tipo="directo"),  # privado: nunca sale
        _ultimo(5, "cliente", 0.5),
    ]
    p = svc.pendientes_de(filas, AHORA)
    assert [x["canal_id"] for x in p] == [3, 1, 5]
    assert [x["minutos_esperando"] for x in p] == [240, 30, 0]
    primero = p[0]
    assert primero["cliente"] == {
        "id": 30, "nombre": "Cliente 3", "plan_actual": "mid", "estado_cliente": "activo", "estado_efectivo": "vigente",
    }
    assert primero["ultimo_mensaje"] == {"id": 300, "autor_nombre": "Alguien", "texto": "hola 3", "creado_en": "2026-11-03T08:00:00Z"}


def test_pendientes_lee_solo_canales_de_clientes_sin_borrados(http, base):
    conn = base()
    assert _pedir(http, "get", "/api/agentes/canales/pendientes", None, CLAVE).status_code == 200
    sql = conn.ejecutadas[-1][0]
    assert "c.tipo = 'cliente'" in sql and "NOT x.borrado" in sql
    assert conn.sesion == {"readonly": True, "autocommit": False} and conn.rollback_hecho


# ---------- Mensajes de un canal ----------


def _responder_canal(tipo):
    def responder(sql, params):
        if f'FROM "{svc.S}"."canales" WHERE id' in sql:
            return ["id", "tipo", "cliente_id", "nombre"], [(params["canal"], tipo, 7, "x")]
        if "mensajes_canal" in sql:
            # La base los devuelve del más nuevo al más viejo.
            return ["id", "autor_tipo", "autor_nombre", "texto", "respuesta_a", "creado_en", "editado_en"], [
                (2, "equipo", "Coach", "te respondo", 1, AHORA, None),
                (1, "cliente", "Cliente", "pregunta", None, AHORA - timedelta(minutes=5), None),
            ]
        return ["x"], []

    return responder


@pytest.mark.parametrize("tipo", ["directo", "privado", "dm", "grupo", "anuncios"])
def test_mensajes_de_un_canal_que_no_es_de_cliente_da_404(http, base, tipo):
    conn = base(_responder_canal(tipo))
    r = _pedir(http, "get", "/api/agentes/canales/9/mensajes", None, CLAVE)
    assert r.status_code == 404
    assert not any("mensajes_canal" in sql for sql, _ in conn.ejecutadas)


def test_mensajes_de_un_canal_que_no_existe_da_404(http, base):
    base()
    assert _pedir(http, "get", "/api/agentes/canales/9/mensajes", None, CLAVE).status_code == 404


def test_mensajes_de_un_canal_de_cliente_en_orden_de_lectura(http, base):
    conn = base(_responder_canal("cliente"))
    r = _pedir(http, "get", "/api/agentes/canales/9/mensajes?limite=2", None, CLAVE)
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["cliente_id"] == 7
    assert [m["id"] for m in cuerpo["mensajes"]] == [1, 2]
    sql, params = conn.ejecutadas[-1]
    assert "NOT m.borrado" in sql and "c.tipo = 'cliente'" in sql
    assert params == {"canal": 9, "limite": 2}


@pytest.mark.parametrize("limite", [0, 201])
def test_el_limite_de_mensajes_tiene_tope(http, limite):
    assert _pedir(http, "get", f"/api/agentes/canales/9/mensajes?limite={limite}", None, CLAVE).status_code == 422


# ---------- Resumen del cliente ----------


def _responder_resumen(sql, params):
    if "FROM clients.clientes k" in sql:
        columnas = ["id", "nombre", "email", "plan_actual", "estado_cliente"]
        fila = [params["cliente"], "Ana", "ana@x.com", "mid", "activo"]
        for c in ("total_pagado_usd", "total_adeudado_usd", "prioridad_cobro"):
            if f"k.{c}" in sql:
                columnas.append(c)
                fila.append(100)
        return columnas, [tuple(fila)]
    if "AS completadas" in sql:
        return ["completadas", "total", "ultima_completada_en"], [(3, 40, AHORA)]
    if "pr.titulo AS modulo" in sql:
        return ["id", "titulo", "modulo", "completado_en"], [(11, "Clase 1", "Start Here", AHORA)]
    if "tipo = 'cliente' AND cliente_id" in sql:
        return ["id"], [(55,)]
    if "mensajes_canal" in sql:
        return ["id", "autor_tipo", "autor_nombre", "texto", "respuesta_a", "creado_en", "editado_en"], [
            (1, "cliente", "Ana", "hola", None, AHORA, None),
        ]
    if "llamadas" in sql:
        return ["id", "titulo", "inicio", "duracion_min", "coach", "resumen"], [(4, "Llamada 1", AHORA, 45, "Coach", "Se habló de X")]
    if "cerebro_onboarding" in sql:
        return ["respondido_en", "ficha_json"], [(AHORA, '{"oferta": "curso"}')]
    return ["x"], []


@pytest.mark.parametrize("clave,plata", [(CLAVE, False), (CLAVE_PLATA, True)])
def test_resumen_del_cliente_con_plata_solo_con_permiso(http, base, clave, plata):
    conn = base(_responder_resumen)
    r = _pedir(http, "get", "/api/agentes/clientes/8/resumen", None, clave)
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["cliente"]["nombre"] == "Ana"
    assert ("total_pagado_usd" in cuerpo["cliente"]) is plata
    assert any(("total_pagado_usd" in sql) is plata for sql, _ in conn.ejecutadas if "FROM clients.clientes k" in sql)
    assert cuerpo["progreso"] == {
        "clases_completadas": 3, "clases_total": 40, "ultima_completada_en": "2026-11-03T12:00:00Z",
        "ultimas_clases": [{"id": 11, "titulo": "Clase 1", "modulo": "Start Here", "completado_en": "2026-11-03T12:00:00Z"}],
    }
    assert cuerpo["canal_id"] == 55 and [m["texto"] for m in cuerpo["mensajes"]] == ["hola"]
    assert cuerpo["llamadas"][0]["titulo"] == "Llamada 1" and "transcripcion" not in cuerpo["llamadas"][0]
    assert cuerpo["onboarding"] == {"respondido": True, "respondido_en": "2026-11-03T12:00:00Z", "ficha": {"oferta": "curso"}}
    # Nada de transcripciones completas ni de tablas de plata.
    assert not any("transcripcion" in sql or "clients.pagos" in sql or "clients.cuotas" in sql for sql, _ in conn.ejecutadas)
    assert conn.sesion == {"readonly": True, "autocommit": False} and conn.rollback_hecho and conn.cerrada


def test_resumen_de_un_cliente_que_no_existe_da_404(http, base):
    base()
    assert _pedir(http, "get", "/api/agentes/clientes/8/resumen", None, CLAVE).status_code == 404


# ---------- Solo lectura por construcción ----------


def test_el_servicio_no_usa_pony_ni_escribe():
    import inspect

    for modulo in (svc, tablas):
        fuente = inspect.getsource(modulo)
        assert "db_session" not in fuente and "from src.models" not in fuente and "commit()" not in fuente
        for palabra in ("INSERT ", "UPDATE ", "DELETE ", "ALTER ", "CREATE ", "DROP "):
            assert palabra not in fuente.upper()
