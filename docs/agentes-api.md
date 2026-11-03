# API de lectura para agentes (`/api/agentes`)

Los agentes de IA del equipo (Command Center, en la Mac de Franco) leen desde acá los chats de los
clientes, su progreso, sus llamadas y su onboarding para preparar borradores de respuesta. **Los
mensajes los manda siempre una persona**: esta API no escribe nada.

## Qué garantiza

- **Solo lectura por construcción.** Cada pedido abre una conexión aparte de Postgres en modo
  `READ ONLY` (con tiempo límite de 15 s) y la descarta con `rollback`. No usa entidades de Pony ni
  toca el esquema: no hay escrituras posibles, ni aunque una consulta las intente.
- **Nunca canales privados.** Los canales `directo`, `privado` y `dm` no existen para los agentes;
  los endpoints de canales solo aceptan canales de tipo `cliente`. Los mensajes borrados no salen.
- **Plata solo con permiso.** Totales, pagos y cuotas solo para las claves con el permiso `plata`.
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
- `plata`: opcional; suma las vistas `pagos` y `cuotas`, y las columnas `total_pagado_usd`,
  `total_adeudado_usd` y `prioridad_cobro` de los clientes. Por defecto, no darlo.
- Si el JSON está mal escrito, la API queda apagada (404) y el log lo avisa.

Para revocar una clave: sacar su entrada de `AGENTES_KEYS` y reiniciar el backend.

## Respuestas de error

| Código | Cuándo |
| --- | --- |
| 404 | API apagada (sin `AGENTES_KEYS`), o el canal / cliente no existe (o el canal no es de cliente) |
| 401 | Falta `X-Agente-Key` o la clave no es de ningún agente |
| 403 | La clave no tiene el permiso `lectura` |
| 400 | La consulta SQL no está permitida o la base la rechazó (`detail` dice por qué) |
| 422 | Parámetros fuera de rango (por ejemplo `limite=500`) |

## Endpoints

En los ejemplos: `export BASE=https://classroom.atvos.io` y `export CLAVE=<la clave del agente>`.
Las fechas salen en ISO, en UTC (`...Z`).

### `POST /api/agentes/consulta`

Un `SELECT` (o `WITH … SELECT`) sobre las mismas vistas del chat del cerebro: `clientes`, `canales`,
`mensajes`, `hechos`, `perfiles`, `onboarding`, `llamadas`, `roadmaps`, `consultas_guia`,
`solicitudes_sop`, `programas`, `secciones`, `clases`, `progreso`, `frentes`, `proximos_pasos`,
`observaciones`, `equipo` (y `pagos` / `cuotas` con `plata`). No se pueden nombrar tablas reales,
esquemas, catálogos de Postgres ni escribir. Tope: 200 filas (`hay_mas` avisa si había más) y
600 caracteres por celda.

```bash
curl -s -X POST "$BASE/api/agentes/consulta" \
  -H "X-Agente-Key: $CLAVE" -H "Content-Type: application/json" \
  -d '{"sql": "SELECT tipo, count(*) FROM hechos GROUP BY tipo ORDER BY 2 DESC"}'
```

```json
{"columnas": ["tipo", "count"], "filas": [["tema", 5120], ["dolor", 2210]], "cantidad": 2, "hay_mas": false}
```

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

## Puesta en producción (VPS)

1. Generar una clave por agente (comando de arriba). Guardar la clave en Command Center.
2. En el VPS, agregar al `.env` del backend (`/opt/atv-classroom/backend/.env`) la línea
   `AGENTES_KEYS={...}` con los sha256, en una sola línea.
3. Desplegar la rama como siempre y reiniciar el backend para que lea el `.env` nuevo.
4. Probar desde la Mac:
   `curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/agentes/canales/pendientes"` → 401 (sin clave),
   y con `-H "X-Agente-Key: $CLAVE"` → 200.

Para apagar la API alcanza con dejar `AGENTES_KEYS` vacía (o borrarla) y reiniciar.
