# API de lectura para agentes (`/api/agentes`)

Los agentes de IA del equipo (Command Center, en la Mac de Franco) leen desde acá los chats de los
clientes, su progreso, sus llamadas y su onboarding para preparar borradores de respuesta, y con
`POST /api/agentes/consulta` pueden leer **toda la base** (cada tabla de cada esquema, sin secretos).
**Los mensajes los manda siempre una persona**: esta API no escribe nada.

## Qué garantiza

- **Solo lectura por construcción.** Cada pedido abre una conexión aparte de Postgres en modo
  `READ ONLY` (con tiempo límite de 15 s) y la descarta con `rollback`. No usa entidades de Pony ni
  toca el esquema: no hay escrituras posibles, ni aunque una consulta las intente.
- **Nunca canales privados.** Los canales `directo`, `privado` y `dm` no existen para los agentes;
  los endpoints de canales solo aceptan canales de tipo `cliente`. Los mensajes borrados no salen.
  Vale también para las tablas del classroom (`classroom__mensajes_canal`, `classroom__canales`,
  `classroom__adjuntos`, …): esas filas no están.
- **Plata solo con permiso.** Totales, pagos, cuotas, caja y montos solo para las claves con el
  permiso `plata`.
- **Sin secretos.** Contraseñas, hashes, tokens, claves de API, cifrados, sesiones de login y el
  esquema `neon_auth` no se pueden leer con ninguna clave (ver [Toda la base](#toda-la-base)).
- **Registro.** Cada pedido deja en el log (`agentes`) el nombre del agente, el método y la ruta.
  Nunca la clave ni el contenido de los mensajes.
- **Apagada por defecto.** Sin `AGENTES_KEYS` todas las rutas responden 404.

## Claves

Cada agente tiene su propia clave. En el servidor solo se guarda el **sha256** de la clave; la clave
en sí la tiene el agente y no se puede recuperar desde el servidor.

Generar una clave y su hash (en cualquier máquina con Python):

```bash
python3 -c "import secrets, hashlib; k = secrets.token_urlsafe(32); print('clave: ', k); print('sha256:', hashlib.sha256(k.encode()).hexdigest())"
```

La `clave` va en el agente (Command Center); el `sha256` va en `AGENTES_KEYS`.

### Formato de `AGENTES_KEYS`

Un objeto JSON **en una sola línea**, con un nombre por agente:

```env
AGENTES_KEYS={"redactor": {"sha256": "<sha256 de la clave>", "scopes": ["lectura"]}, "cobranzas": {"sha256": "<sha256>", "scopes": ["lectura", "plata"]}}
```

- `lectura`: obligatorio para usar la API (sin él, 403).
- `plata`: opcional; suma las vistas `pagos` y `cuotas`, las columnas `total_pagado_usd`,
  `total_adeudado_usd` y `prioridad_cobro` de los clientes, y en toda la base las tablas y columnas
  de plata (ver [Toda la base](#toda-la-base)). Por defecto, no darlo.
- Si el JSON está mal escrito, la API queda apagada (404) y el log lo avisa.

Para revocar una clave: sacar su entrada de `AGENTES_KEYS` y reiniciar el backend.

## Respuestas de error

| Código | Cuándo |
| --- | --- |
| 404 | API apagada (sin `AGENTES_KEYS`), o el canal / cliente no existe (o el canal no es de cliente) |
| 401 | Falta `X-Agente-Key` o la clave no es de ningún agente |
| 403 | La clave no tiene el permiso `lectura` |
| 400 | La consulta SQL no está permitida, nombra una tabla excluida para esa clave, o la base la rechazó (`detail` dice por qué) |
| 503 | No se pudo leer el catálogo de la base (probar de nuevo en un rato) |
| 422 | Parámetros fuera de rango (por ejemplo `limite=500`) |

## Endpoints

En los ejemplos: `export BASE=https://classroom.atvos.io` y `export CLAVE=<la clave del agente>`.
Las fechas salen en ISO, en UTC (`...Z`).

### `POST /api/agentes/consulta`

Un `SELECT` (o `WITH … SELECT`) sobre:

- Las vistas del chat del cerebro: `clientes`, `canales`, `mensajes`, `hechos`, `perfiles`,
  `onboarding`, `llamadas`, `roadmaps`, `consultas_guia`, `solicitudes_sop`, `programas`, `secciones`,
  `clases`, `progreso`, `frentes`, `proximos_pasos`, `observaciones`, `equipo` (y `pagos` / `cuotas`
  con `plata`).
- **Toda la base**, como `<esquema>__<tabla>` (dos guiones bajos): `ops__leads_audiencia`,
  `clients__clientes`, `classroom__llamadas`, `roadmaps__tareas`, … Qué hay y con qué columnas lo dice
  [`GET /api/agentes/tablas`](#get-apiagentestablas).

No se pueden nombrar tablas reales (`esquema.tabla`, aunque sea con comillas o comentarios en el
medio), catálogos de Postgres (`pg_…`, `information_schema`), funciones que leen tablas por nombre
(`query_to_xml`, `table_to_xml`, …) ni escribir. Como `onboarding` y `roadmaps` son a la vez vistas y
esquemas, para nombrar sus columnas usá un alias (`FROM roadmaps r … r.titulo`, no `roadmaps.titulo`);
lo mismo si le ponés a una tabla un alias igual a un esquema (`FROM ops__leads_audiencia ops` no:
usá `l`). Tope: 200 filas (`hay_mas` avisa si había más), 600 caracteres por celda y 15 s por consulta.

```bash
curl -s -X POST "$BASE/api/agentes/consulta" \
  -H "X-Agente-Key: $CLAVE" -H "Content-Type: application/json" \
  -d '{"sql": "SELECT tipo, count(*) FROM hechos GROUP BY tipo ORDER BY 2 DESC"}'
```

```json
{"columnas": ["tipo", "count"], "filas": [["tema", 5120], ["dolor", 2210]], "cantidad": 2, "hay_mas": false}
```

Más ejemplos (el valor de `"sql"`):

```sql
-- Una tabla cualquiera
select * from ops__leads_audiencia limit 5

-- Cuántas filas tiene
select count(*) from ops__leads_audiencia

-- Cruzar esquemas: llamadas de Fathom (classroom) por plan del cliente (clients)
select c.plan_actual, count(*) from classroom__llamadas l
join clients__clientes c on c.id = l.cliente_id group by 1 order by 2 desc

-- Roadmaps (esquema roadmaps) con el estado del cliente
select r.titulo, r.estado, c.nombre, c.estado_cliente from roadmaps__roadmaps r
left join clients__clientes c on c.id = r.cliente_id_clients limit 20

-- Mezclar con las vistas del cerebro
select h.tipo, count(*) from hechos h join clients__clientes c on c.id = h.cliente_id
where c.plan_actual = 'mid' group by 1
```

### `GET /api/agentes/tablas`

Qué se puede consultar con esta clave: las vistas del cerebro y, por esquema, cada tabla con su nombre
para consultar (`cte`), si es tabla o vista, las filas aproximadas (`filas_aprox`, de las
estadísticas de Postgres; `null` si todavía no se midió), sus columnas con el tipo, y lo excluido con
el motivo (`secreto` o `plata`). Las tablas sin chats privados traen una `nota`. Con `plata`, lo de
plata deja de figurar como excluido y aparece en las columnas. El catálogo se arma solo, leyendo la
base cada 10 minutos: una tabla nueva aparece sin tocar código.

```bash
curl -s "$BASE/api/agentes/tablas" -H "X-Agente-Key: $CLAVE"
```

```json
{
  "vistas": [{"nombre": "clientes", "descripcion": "Clientes de ATV. plan: ..."}],
  "esquemas": {
    "ops": {
      "tablas": [
        {
          "tabla": "reuniones_crm", "cte": "ops__reuniones_crm", "tipo": "tabla", "filas_aprox": 501,
          "columnas": [{"nombre": "id", "tipo": "integer"}, {"nombre": "prospecto", "tipo": "text"}],
          "columnas_excluidas": [{"nombre": "cash_usd", "motivo": "plata"}]
        }
      ],
      "tablas_excluidas": [{"tabla": "linea_pagos_docs", "cte": "ops__linea_pagos_docs", "motivo": "plata"}]
    }
  },
  "esquemas_excluidos": [{"esquema": "neon_auth", "motivo": "secreto", "tablas": 9}],
  "totales": {"esquemas": 11, "tablas": 152, "columnas": 1379, "tablas_excluidas": 22, "columnas_excluidas": 31}
}
```

### Toda la base

Cada tabla (y vista) de cada esquema se lee como una vista segura `<esquema>__<tabla>`: el servidor
arma un `WITH` con solo las columnas permitidas y suma solo las tablas que la consulta nombra (así
las consultas siguen siendo rápidas). La consulta corre en solo lectura y sin acceso a los esquemas
reales, así que lo que no está en la vista no se puede leer. Las reglas
(`backend/src/services/agentes_tablas.py`):

**Secreto (ninguna clave lo ve):**

- El esquema `neon_auth` entero.
- Las tablas `classroom.sesiones`, las que se llaman `sesion`/`sesiones`/`session`/`sessions` o
  terminan así (`onboarding.sessions`), y las que tienen en el nombre `token`, `credencial`, `secret`,
  `vault`, `push_sub`/`push_sus`, `push_clave`, `webauthn` u `otp` (`classroom.push_suscripciones`,
  `classroom.push_claves`). `ops.sesiones_notas` (notas de llamadas de setting) sí entra.
- Las columnas de contraseñas (`pass…`), `hash`, `token` (no `tokens_entrada`/`tokens_salida`, que
  son conteos de la IA), `secret…`, `api_key`, `clave_api`/`clave_privada`/`clave_cifrada`…, `cifrad…`,
  `encrypt…`, `cookie`, `refresh…`, `access_key`, `vapid`, `credencial…`, `otp`, `privad…`/`private…`
  y `auth`/`oauth`. No caen `autor`, `author`, `hashtag`, `cifras` ni `clave` sola (en esta base es el
  nombre de un ajuste o de un evento, no una clave secreta).

**Plata (solo con el permiso `plata`):**

- Las tablas `clients.pagos`, `cuotas`, `cuota_comprobantes`, `cuota_eventos`, `pago_imputaciones`,
  `caja_meta`, `caja_ventas_nuevas`, `analisis_cash`, y cualquier otra con `pago(s)`, `cuota(s)`,
  `caja` o `cash` en el nombre (`ops.linea_pagos_docs`).
- Las columnas `monto…`, `importe…`, `precio…`, `pagad…`, `adeudad…`, `cobr…` (`prioridad_cobro`),
  `cash`, `usd`, `eur`, `ars` y `total_…` (por ejemplo `total_pagado_usd`, `cash_usd`, `costo_usd`,
  `precio_usd`, `total_analizados`).

**Chats privados:** en las tablas del classroom con canal (`classroom__canales`,
`classroom__mensajes_canal`, y las que tienen `canal_id`: adjuntos, reacciones, menciones, lecturas,
sugerencias…) no están las filas de los canales `directo`, `privado` y `dm`, ni los mensajes borrados.

Hoy (3-11-2026) eso deja, sin `plata`, 152 tablas en 11 esquemas con 1379 columnas; afuera quedan
`neon_auth` (9 tablas), `classroom.sesiones`, `classroom.push_claves`, `classroom.push_suscripciones`,
`onboarding.sessions`, las 9 tablas de plata y 31 columnas (con `plata`: 161 tablas y 12 columnas
afuera, todas secretas). La lista exacta y al día la da `GET /api/agentes/tablas`.

### `GET /api/agentes/canales/pendientes`

Los chats de clientes cuyo último mensaje (no borrado) es del cliente o de alguien de su equipo:
los que esperan respuesta, **el que más espera primero**.

```bash
curl -s "$BASE/api/agentes/canales/pendientes" -H "X-Agente-Key: $CLAVE"
```

```json
{
  "pendientes": [
    {
      "canal_id": 12,
      "cliente": {"id": 345, "nombre": "Ana", "plan_actual": "mid", "estado_cliente": "activo", "estado_efectivo": "vigente"},
      "canal": {"pausa": false, "inactivo": false, "vencido": false},
      "ultimo_mensaje": {"id": 9876, "autor_nombre": "Ana", "texto": "¿Cómo armo el guion?", "creado_en": "2026-11-03T13:05:00Z"},
      "minutos_esperando": 42
    }
  ],
  "cantidad": 1
}
```

### `GET /api/agentes/canales/{canal_id}/mensajes?limite=50`

Los últimos `limite` mensajes (1 a 200, por defecto 50) de un canal de cliente, del más viejo al más
nuevo. `autor_tipo` es `cliente` o `equipo`. Un canal que no es de cliente da 404.

```bash
curl -s "$BASE/api/agentes/canales/12/mensajes?limite=30" -H "X-Agente-Key: $CLAVE"
```

```json
{
  "canal_id": 12,
  "cliente_id": 345,
  "mensajes": [
    {"id": 9875, "autor_tipo": "equipo", "autor_nombre": "Jeremy", "texto": "...", "respuesta_a": null, "creado_en": "2026-11-02T18:00:00Z", "editado_en": null}
  ]
}
```

### `GET /api/agentes/clientes/{cliente_id}/resumen?mensajes=20&llamadas=5`

Todo lo del cliente en un pedido: ficha (sin plata salvo con `plata`), progreso en el classroom,
los últimos `mensajes` (0 a 200) de su chat, sus últimas `llamadas` (0 a 50: título, fecha, duración,
coach y el resumen de Fathom recortado; **nunca la transcripción**) y su onboarding.

```bash
curl -s "$BASE/api/agentes/clientes/345/resumen?mensajes=20&llamadas=3" -H "X-Agente-Key: $CLAVE"
```

```json
{
  "cliente": {"id": 345, "nombre": "Ana", "email": "ana@...", "plan_actual": "mid", "estado_cliente": "activo", "estado_efectivo": "vigente", "dias_restantes": 80, "fecha_vencimiento": "2027-01-20", "responsable": "...", "...": "..."},
  "progreso": {"clases_completadas": 12, "clases_total": 140, "ultima_completada_en": "2026-10-30T21:10:00Z", "ultimas_clases": [{"id": 51, "titulo": "...", "modulo": "Sales", "completado_en": "..."}]},
  "canal_id": 12,
  "mensajes": [{"id": 9876, "autor_tipo": "cliente", "autor_nombre": "Ana", "texto": "...", "respuesta_a": null, "creado_en": "...", "editado_en": null}],
  "llamadas": [{"id": 77, "titulo": "Onboarding Ana", "inicio": "2026-10-01T15:00:00Z", "duracion_min": 52, "coach": "...", "resumen": "..."}],
  "onboarding": {"respondido": true, "respondido_en": "2026-09-28T12:00:00Z", "ficha": {"...": "..."}}
}
```

### Piloto y llamadas (lo que usa Leverage)

El piloto contesta a los clientes en la voz de cada coach (`backend/src/services/piloto_service.py`). Corre en el
servidor con `PILOTO=1`. Cambiar algo pide el permiso `piloto` en la clave, además de `lectura`.

| Ruta | Permiso | Qué hace |
|---|---|---|
| `GET /api/agentes/piloto` | lectura | Modo de cada coach, lo de hoy (salieron solos, enviados, editados) y lo que quedó para el equipo |
| `PUT /api/agentes/piloto/{admin_id}` | piloto | Cambia el modo (`apagado`, `borrador`, `automatico`) o los temas que no salen solos |
| `GET /api/agentes/piloto/borradores` | piloto | Borradores pendientes, con lo que escribió el cliente |
| `POST /api/agentes/piloto/borradores/{id}/enviar` | piloto | Lo manda en nombre del coach que lleva el chat (`{"texto": null}` = tal cual) |
| `POST /api/agentes/piloto/borradores/{id}/descartar` | piloto | Lo descarta |
| `GET /api/agentes/llamadas?coach=ID&despues_de=0&limite=50&transcripcion=false` | lectura | Llamadas de Fathom de un coach, de a páginas |

## Puesta en producción (VPS)

1. Generar una clave por agente (comando de arriba). Guardar la clave en Command Center.
2. En el VPS, agregar al `.env` del backend (`/opt/atv-classroom/backend/.env`) la línea
   `AGENTES_KEYS={...}` con los sha256, en una sola línea.
3. Desplegar la rama como siempre y reiniciar el backend para que lea el `.env` nuevo.
4. Probar desde la Mac:
   `curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/agentes/canales/pendientes"` → 401 (sin clave),
   y con `-H "X-Agente-Key: $CLAVE"` → 200.

Para apagar la API alcanza con dejar `AGENTES_KEYS` vacía (o borrarla) y reiniciar.
