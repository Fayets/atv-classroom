# Contexto del rediseño de ATV Leverage (noviembre 2026)

Este archivo reúne lo que hay que saber para trabajar el diseño de Leverage. Se actualiza en cada tanda.
El de Classroom está en `ATV-CLASSROOM/.claude/CONTEXTO.md`, y ese repo queda quieto en `prueba-v1`.

## 1. Qué es Leverage

- Es una app de escritorio (Electron) donde el **dueño de un negocio** (en los datos de prueba, "Franco Ruiz · Escala Digital")
  maneja un **equipo de agentes de IA**:
  - el **Asistente**, que es su mano derecha;
  - **departamentos** (Marketing, Ventas, Contenido, Ops y Sistemas), cada uno con un capitán y especialistas
    (estratega, analista, setter, closer, guionista, editor, bugs…).
- Los agentes piensan con la cuenta de Claude del dueño. Lo que gasta plata, publica o le escribe a alguien
  **espera su OK** en la Bandeja, salvo que el **piloto automático** lo apruebe.
- Tiene **carpetas por cliente**: la "Principal" es la empresa, y cada cliente tiene su propio equipo y sus datos.
- Se conecta con el Classroom de ATV: "Entrar con el classroom" le da una clave personal de solo lectura
  (ver `ATV-CLASSROOM/docs/agentes-api.md`, sección "Claves personales de ATV Leverage", y `LeveragePage.jsx`).

## 2. Qué tenemos y qué no

- **Solo la interfaz** (`ui/`): HTML, CSS y JavaScript sin frameworks. Ver `LEEME.md`.
  - **No** tenemos el servidor, el método, los datos ni las claves. "El cerebro de la app no lo tocamos".
  - Se entrega **devolviendo los archivos tocados con la misma estructura de carpetas**. ATV los prueba con la app real.
- `ui/index.html` carga `/ui/app.js`, que es la **unión de `ui/app/*.js` en orden alfabético**: el servidor real
  los concatena y el mock hace lo mismo. Todos los scripts comparten el mismo ámbito global (`state`, `view`,
  `extra`, `api()`, `go()`, `renderBody()`…).
- No es una carpeta de git. Hacer copia antes de cambios grandes, o inicializar git solo local si hace falta.

## 3. Cómo levantarlo (mock)

- Usamos `npm run dev:mock` dentro de `ATV-LEVERAGE` (o el preview `leverage-mock` de `D:\Landings - Copy\ATV\.claude\launch.json`).
  Queda en **http://localhost:5180**.
- El mock está en `mock/` y **no es parte de la entrega**:
  - `server.mjs` sirve `ui/`, arma `/ui/app.js`, reemplaza `__TOKEN__` del HTML, dibuja avatares con
    iniciales (`/avatar/:id.svg`) y responde la API.
  - `datos.mjs` tiene los datos inventados: 12 agentes en 4 áreas, pedidos para aprobar, entregas, #ceo,
    órdenes entre agentes, KPIs, rutinas, tickets, uso, Instagram conectado y 2 clientes.
  - Lo que se manda por POST se acepta y, en lo simple (aprobar, chatear, prender rutinas, piloto), cambia los
    datos en memoria. **Si cambiás el mock, hay que reiniciar el server** (Node no recarga solo).
  - Lo que no está programado en el mock devuelve una lista vacía.
- Pantallas que **todavía se ven vacías o con error** por falta de datos (sumarlos cuando se rediseñen):
  - Ventas/DMs (`/ig/...`), Automatizaciones (`/ig/flujos`) y Contenido (`/contenido`);
  - Biblioteca (`/library`), Roadmap (`state.roadmap`), Juan IA (`/juan/chats`), Classroom (piloto y consultas)
    y las Conexiones de Ajustes.
- El tema se guarda en `localStorage.tema` (`"light"`, `"dark"` o `"system"`) y se aplica en `<html data-theme>`.

## 4. Mapa de la interfaz

- **Barra de arriba** (`renderSide`, en `01-paneles-y-tablero.js`):
  - logo, pestañas Tablero · Bandeja (con contador) · Ventas · Contenido (si Instagram está conectado) · Equipo · Roadmap;
  - a la derecha: selector de carpeta (Principal/clientes), piloto automático (avión), Classroom, navegador y el menú
    (Equipo, Biblioteca, Tickets, Rutinas, Uso, Decisiones, Actividad, Configuración).
- Las vistas están en `VIEWS` (`10-navegador.js`), y el dibujo va por `renderShell`, `renderHead` y `renderBody` (`11-pintar.js`):

  | Vista | Archivo | Qué muestra |
  |---|---|---|
  | `tablero` | 01 | Cuatro columnas: "Esperan tu OK", "En curso", "Entregado hoy" y "Programado", más la caja de pedido "Para: Asistente". |
  | `historial` | 01 | Rutinas programadas y lo hecho por persona. |
  | `agent` | 02 | Chat con un agente: a la izquierda las conversaciones por área (`renderConvs`), a la derecha el panel "Trabajo en curso" (`renderPanel`). |
  | `ceo` | 02 | El canal #ceo, con los reportes de los directores. |
  | `juan` | 02 | Juan IA. |
  | `roadmap` | 02 | El roadmap. |
  | `bandeja` | 03 | Lista de chats, filtros (Todos / Te necesitan / Reportes / Entregas) y el hilo con lo que pide OK. |
  | `onboarding`, `carpeta` y `equipo` | 04 | Primeros pasos, la carpeta del cliente y el organigrama (dueño → Asistente → áreas). |
  | `ajustes` | 05 | Secciones: Embudos, General, Objetivo, Conexiones, Píxel, Clientes, Horario libre, Claves, Gasto… |
  | `biblioteca`, `rutinas`, `uso`, `decisiones`, `actividad` y `tickets` | 06 | Una pantalla cada una. |
  | `auto` | 07 | Automatizaciones de Instagram. |
  | `dms` | 08 | Ventas: DMs de Instagram y contactos. |
  | `contenido` | 08-z | Contenido. |
  | `classroom` | 09 | El Classroom de ATV adentro de Leverage. |

- El resto de los archivos:
  - `12-voz.js`: notas de voz;
  - `13-acciones-y-avisos.js`: clics, avisos, licencia y actualización;
  - `14-arranque.js`: arranca y vuelve a pedir el estado (`/state` cada 2,5 s, los mensajes cada 2 s).
- Ojo con `renderBody`: **repinta todo con `innerHTML`** y guarda el scroll y el foco. Animaciones de entrada con
  CSS se repetirían en cada repintado si la vista cambia de HTML. Conviene animar solo al cambiar de vista.

## 5. Sistema visual actual (`ui/app.css`, unas 2450 líneas)

- **Tipografías**: General Sans para el texto (`--sans`) y Satoshi 700 para el logo (`--logo`). Las dos vienen de Fontshare.
- **Colores claros**:

  | Variable | Valor |
  |---|---|
  | `--bg` y `--sheet` | `#FFF` |
  | `--fg` | `#242321` (carbón ATV) |
  | `--line` y `--bubble` | `#F3F0E9` (hueso) |
  | `--me` (azul, burbuja propia y foco) | `#1351C2` |
  | `--red` | `#F65046` |

- **Colores oscuros**: `html[data-theme="dark"]`, con `--bg #1C1B19` y `--sheet #242321`.
- **Layout**:
  - `.app` es una grilla con la barra arriba (`.side.topbar`), las conversaciones (`.convs`), `.main` como hoja
    blanca con borde y radio 12, el `.panel` a la derecha y el `#dock` del navegador;
  - tiene 40 `@media`.
- **Marca ATV** (la misma que el Classroom): hueso `#F3F0E9`, carbón `#242321` y rojo vivo `#FF2518`.
  - En el Classroom usamos el rojo `#c0392b`, la tinta, el papel y el kraft, con wordmark ΛUMENTA® TU >ALOR e isotipo.
  - El logo de Leverage es el isotipo de ATV con una ® en círculo.

## 6. Preferencias del dueño del proyecto (vienen del Classroom)

- Habla en español rioplatense y los textos van en voseo.
- Quiere un diseño **innovador, que no parezca hecho con IA**, con referencias brasileñas.
- Cuida el UX/UI básico: márgenes, nada tirado a un costado, que nada salte.
- Siempre se verifica en **PC, tablet y celular**, en **claro y oscuro**.
- Revisa con capturas marcadas; si dice que algo "está bien", no se toca.
- Va "de a poco y muy preciso", varios pedidos por mensaje, cada uno verificado.
- Commit/push solo cuando lo pide (acá no hay repo: la entrega es devolver los archivos de `ui/`), y se
  actualiza este archivo antes de entregar.

## 7. Bitácora

- **2026-11-27**: se armó el mock (`mock/`, `package.json` con `dev:mock`), se levantó en el puerto 5180 y se
  recorrieron todas las vistas. Todavía no se tocó nada de `ui/`.
- **2026-11-27 · Base y barra lateral** (primera tanda de diseño):
  - Se creó `ui/atv.css`, que se carga después de `app.css` y concentra el rediseño, y `ui/fonts/` con Helvetica Now
    Display (la misma del Classroom). `index.html` suma `atv.css` y tres elementos nuevos: la barra (`<aside id="side" class="side sb">`),
    la barra del celular (`#sb-movil`) y el fondo del cajón (`#sb-fondo`).
  - En `app.css`, los colores escritos a mano pasaron a variables:
    - el azul `#1351C2` y sus `rgba(19,81,194,…)` son `--acento` y `--acento-rgb` (carbón en claro, hueso en oscuro);
    - `#FF2518` y `#F65046` son `--rojo` (`#c0392b`);
    - `#B40210` es `--rojo-texto`.
  - Base: papel `#f6f4f0`, hojas `#fffefb`, sombra cálida y bordes suaves; en oscuro, carbón. El foco va en rojo.
  - **Barra lateral** (`renderSide` en `01-paneles-y-tablero.js`, con el estilo del sidebar del Classroom). Reemplaza a la barra de arriba:
    - credencial (isotipo, "Leverage" y la empresa) y botón para plegar a riel (`localStorage.sbRiel`);
    - "Tu espacio", con el selector de carpeta (empresa o clientes) de siempre;
    - bandejas con pestaña: Tu equipo (Tablero, Bandeja, Equipo, Roadmap), Ventas (si hay Instagram),
      Herramientas (Juan IA, Classroom, Biblioteca) y Gestión (Tickets, Rutinas, Uso, Decisiones, Actividad, Configuración);
    - la píldora de tinta que se desliza a la sección activa (con su filo rojo y su luz interna);
    - abajo, el piloto automático con su estado, el navegador, el modo claro/oscuro (`data-lev-tema`, guarda `tema`) y la configuración.
  - El menú del engranaje ya no se pinta: sus opciones están en la barra. Bandeja queda marcada también en los chats con agentes.
  - En la app de Mac la barra deja 40 px arriba para los botones de la ventana y se puede arrastrar.
  - **Celular (≤760 px)**: barra de arriba con menú, logo y el contador de la Bandeja; la lateral es un cajón que se
    cierra al elegir una sección, al tocar afuera o con Esc. En el celular no hay riel.
  - Pendiente: las pantallas en sí (Tablero, Bandeja, chat, Equipo…) todavía tienen su diseño viejo, aunque ya toman
    la paleta y la tipografía nuevas. En el chat, la columna de conversaciones queda pegada a la barra: se rediseña con esa pantalla.
- **2026-11-27 · Tablero** (`tableroHtml` en `01-paneles-y-tablero.js`, estilos `.tb2-*` en `atv.css`), con el lenguaje del Inicio del Classroom:
  - **Saludo**: línea roja + fecha y empresa en mono, y el título "Buen día / Buenas tardes / Buenas noches, Franco. Esto es lo de tu equipo hoy."
    A la derecha, la cápsula Hoy / Programado e historial.
  - **Marcador**: una tira con 4 cifras. Esperan tu OK va en rojo; trabajando ahora lleva un punto verde que late; después, entregas hoy y en la agenda.
  - **Grilla** de dos columnas independientes cuando hay lugar (container query a partir de 820 px):
    - **Esperan tu OK**: fichas con el tipo (con el logo de la app si es una acción, como Gmail o Instagram), el pedido,
      quién lo pide y cuándo, y Aprobar (tinta) / Ver.
    - **Entregado hoy**: cada entrega es una hoja con la extensión del archivo (PDF, MD, HTML) y su estado.
    - **Trabajando ahora**: cada agente con un aro rojo que gira, su tarea, el paso y el indicador "En vivo".
    - **Lo que viene**: una agenda con la hora a la izquierda y una línea que une los puntos.
  - Angosto: una columna, en este orden: OK, trabajando, entregado y lo que viene. El marcador pasa a 2×2.
  - Al pie, el pedido al Asistente (la caja de siempre, `tb-form`, con otro estilo).
  - Sin animaciones de entrada: el tablero se repinta cada pocos segundos y se repetirían.
  - Probado en 1440, tablet y celular, claro y oscuro. Aprobar funciona (en el mock cambia los datos: reiniciar el server para volver a cero).
- **2026-11-27 · Bandeja y chat con agentes**: solo con estilos, el HTML y la lógica de `03-bandeja.js` y del chat no cambian.
  Va en `atv.css`, en la sección "Bandeja… y chat con un agente", con el lenguaje de Mensajes del Classroom.
  - **Lista de la Bandeja**:
    - título grande y buscador con borde;
    - los filtros, en la cápsula del Classroom;
    - filas redondeadas, con la abierta en **tinta** (como la píldora de la barra) y un filo rojo a la izquierda en las que te necesitan;
    - #ceo con un cuadradito de tinta.
  - **Charla**:
    - fondo de papel cálido (`--bw-papel`) y los días como pastilla mono;
    - burbujas con cola: la del equipo en papel con borde, la tuya en tinta;
    - las fichas (pedidos, entregas, reportes) como hojas con la etiqueta como pestaña. "Te necesito" va en rojo,
      con un degradé y un borde rojo suave. Aprobar va en tinta y los botones no se cortan en el celular.
  - **Caja de escribir**: flotante y redonda, con sombra, como el campo de la guía del Inicio. Enviar va en rojo.
  - **Chat con un agente**:
    - la columna "Conversaciones" es una bandeja de papel al lado de la barra, con la activa en tinta y los grupos
      por área como etiquetas en mayúsculas;
    - la cabecera tiene el estado en una pastilla (con un punto rojo que late si está trabajando);
    - la charla, la caja y las burbujas son iguales a las de la Bandeja;
    - el panel de la derecha tiene títulos mono.
  - Ojo con la especificidad: `app.css` tiene reglas `html[data-theme="dark"] …` para `.convs .item.on`, `.btag.rojo`,
    `.bwchip` y otras. En `atv.css` esas reglas van con `html .app …` o `html .bw …` para ganarles.
  - Probado en 1440, celular (lista → chat → volver) y oscuro.
- **2026-11-27 · Equipo: "la constelación en vivo"** (`equipoHtml`, `eqPosiciones`, `eqCredencial` y `drawOrg`
  en `04-onboarding-carpeta-equipo.js`; estilos `.eq-*` en `atv.css`). Se pidió algo que impresione. Hay referencias de vistas de agentes
  como "Agents Office", con el estado del equipo a la vista, y de los canvas de equipos de Relevance AI, además de páginas de equipo premiadas en Awwwards.
  - **El mapa** (lienzo de 1000 × 1000 en %): vos en el centro (disco de tinta con tus iniciales), el Asistente en la primera
    órbita, y cada área es un **sector** con su capitán (órbita 300) y su gente más afuera (425). Lleva órbitas punteadas,
    sectores en tonos alternados y el nombre del área en mono en el borde.
  - **Estados** en el aro de cada agente:
    - trabajando: aro rojo que gira y un halo que late;
    - te necesita: aro rojo y número;
    - en fila: aro punteado;
    - dormido: en gris;
    - disponible: aro verde.
  - **Hilos**: cada par que se habló en la semana (`talks()`: comms, pedidos, #ceo) es una curva hacia el centro. Las de la
    **última hora** van en rojo, con el trazo que fluye y una luz que viaja (`animateMotion`). Al pasar el mouse por alguien
    se encienden sus hilos y su rama, y lo demás se apaga.
  - **Credencial** del elegido, a la derecha (como la de Mi cuenta del Classroom):
    - la lámina oscura con las iniciales de marca de agua, el estado, el nombre, el cargo y chips (área, modelo, a quién reporta);
    - el talón con el corte punteado: qué está haciendo, la orden entre comillas y quién se la pidió, las cifras
      (esperan tu OK, entregas, charlas en 7 días), lo que espera tu OK (abre la Bandeja) y Abrir chat / Editar ficha
      (la ficha de siempre, `data-edit-agent`).
  - Abajo de la credencial, **"Lo último que se dijeron"**: las acciones crudas (GMAIL_SEND_EMAIL) se leen como "Mandar un mail".
    Tocar un agente o una charla lo elige (`data-eq-sel`). En pantallas angostas baja hasta la credencial.
  - Las animaciones quedan atadas al reloj de la página en `drawOrg` (`startTime = 0`): repintar no las reinicia.
  - Los KPIs aprobados siguen abajo, como antes. Del organigrama viejo ya no se usan `fitOrg` ni `#org-talks`.
  - Tamaños: en PC, el mapa al lado de la credencial (container query a partir de 900 px). Si no, el mapa arriba y la credencial
    abajo. Los nodos se achican en dos escalones (560 y 420 px). Probado en 1440, tablet, celular, claro y oscuro.
  - Ojo: el panel de vista previa de Claude anima lento si no está en foco; en las capturas la píldora puede salir a mitad de camino.
- **2026-11-27 · Ventas y Contenido**:
  - **Mock**: `mock/ventas.mjs` sirve las rutas de Ventas y Contenido. En `server.mjs`, `rutaGet` recibe la URL para leer
    los parámetros, y `/media/historias/*` dibuja miniaturas SVG con degradés de la marca.
    - `/ig/bandeja`: 8 chats con calificación, solicitudes, anuncios y verificados;
    - `/ig/chat/:id`, `/ig/buscar`, `/ig/embudo` (12 días), `/ig/contactos`, `/ig/notas`, `/ig/calificacion`,
      `/ig/calificados` y `/ig/llamadas`;
    - `/ig/flujos`: 4 automatizaciones (prendida, apagada y borrador);
    - `/ig/vista`: Contenido, con 3 secuencias, 3 ideas de reels, dolores, "Lo que se ve" y los números de ventas.
  - **Cabecera** `.vt-cab` arriba de las dos secciones: el título y "@cuenta · …" en mono.
    - En Ventas, las pestañas (Bandeja / Reporte / Contactos / Automatizaciones) van al lado, en la cápsula del Classroom (`ventasModos`, en 08).
    - En Contenido, la cabecera se agregó en `contenidoHtml` (08-z).
  - **DMs**, como la Bandeja:
    - la lista y el chat en tarjetas, con la fila abierta en tinta y el punto de sin leer en rojo;
    - las burbujas tuyas en tinta, en lugar del azul de Instagram;
    - la charla sobre papel, la caja flotante con Enviar en rojo y el estado de la llamada como pastilla.
  - **Reporte**: el embudo va de la tinta al rojo ATV a medida que baja hasta los cierres (variables `--emb-0` a `--emb-5`).
    Las tasas son fichas con su color (bien, ojo, alerta) y la tabla de días tiene cabecera mono.
  - **Contactos**: filtros en pastillas y filas como tarjetas; la fila abierta va en tinta y el paso actual, en rojo.
  - **Automatizaciones**: filas como tarjetas, con la miniatura de la historia o del reel. "Prendida" tiene un punto verde
    que late y "+ Nueva" va en rojo. El celular de la vista previa sigue en azul de Instagram a propósito: es cómo lo ve el lead.
  - **Contenido**:
    - filtros en la cápsula del Classroom (en el celular se deslizan de costado);
    - los números de ventas, como el marcador del Tablero, con los cierres en rojo;
    - el mapa y "Lo que se ve" en un bloque redondeado, con las cifras grandes en rojo;
    - Secuencias y Reels en bloques, con miniaturas redondeadas y el pedido marcado en rojo.
  - Probado en 1440, celular (lista → chat, Contenido) y oscuro.
- **Git local**: se inicializó un repo solo local en `ATV-LEVERAGE` para ver los cambios (`git diff c718430`),
  y hay una copia de la `ui/` original en `D:\Landings - Copy\ATV\ui-original-leverage-backup`.
  Para entregar se devuelven los archivos de `ui/` que cambiaron: `git diff --name-only c718430 -- ui`.
