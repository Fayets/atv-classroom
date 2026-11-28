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
- **2026-11-27 · Biblioteca y Roadmap**:
  - **Mock**: `mock/biblioteca.mjs` sirve los datos de prueba.
    - `/library`: 9 historias, 3 reels, guías de "lo que aprendieron" y material (brandbook, landings, Miro, caso, VSL, mercado);
    - `/swipes`;
    - `state.roadmap`: "Lanzamiento del programa High Ticket", 5 pasos. El 3 está en curso, con partes, una tarea que espera tu OK y una entrega.
  - **Biblioteca** (solo estilos):
    - las pestañas en la cápsula del Classroom y "Sumar material" en rojo;
    - **Historias y Reels son carpetas de cartón** con pestaña roja: las fotos asoman como hojas y suben al pasar el mouse;
    - cada estante es una **bandeja con pestaña** (BRANDBOOK, LANDINGS, MIROS…) en dos columnas; los que faltan, punteados y rayados;
    - "Lo que aprendieron tus agentes" es una nota con el filo rojo;
    - "Tus decisiones" va al costado en papel; con poco ancho baja.
    - Ojo: `.lib` tenía `margin: 0 auto` y se encogía dentro de la grilla; ahora va con `margin: 0` y `width: 100%`.
  - **Roadmap**: mantiene el sendero en zigzag que ya tenía y se puede arrastrar.
    - El título es una tarjeta con "Roadmap · paso X de N" en mono, el nombre del plan y una barra por pasos:
      tinta lo aprobado y rojo que late lo que está en curso (cambio chico en `roadmapHtml`, 02).
    - El sendero hecho va en tinta y los pasos aprobados en tinta con el tilde. El paso en curso va en rojo, con un halo que late.
    - Las etiquetas son pastillas de papel. La tarjeta abierta es una hoja con el filo rojo; el "Punto de encuentro" va en
      una caja suave y Aprobar en tinta. Las entregas siguen el tema (en oscuro se veían blancas).
    - El mundo baja 76 px para no quedar tapado por el título.
    - En el celular se sigue explorando arrastrando: achicarlo para que entre haría ilegible el texto.
  - Probado en 1440, celular y oscuro.
- **2026-11-27 · Gestión y Configuración**: en Tickets, Rutinas, Uso, Decisiones, Actividad y Configuración
  todo es de estilos, salvo una línea de JS.
  - En `renderHead` (11), `#main` queda con `data-vista="<pantalla>"`. Con eso se adapta la cabecera según la pantalla.
    - En Gestión, Configuración, Biblioteca y Carpeta, la cabecera es de página: ícono en un cuadrado de tinta, título grande y bajada en mono.
    - En Equipo se oculta, porque ya tiene su título grande.
    - En el celular la cabecera no lleva sangría (el espacio era para la flecha de volver de los chats).
  - **Tablas** (`.kt`: Rutinas, Uso, KPIs): hojas redondeadas con el encabezado en mono sobre fondo suave y filas con hover.
    En el celular se deslizan de costado.
  - **Interruptor** (`.sw`) en tinta, más grande, con el botón con sombra.
  - **Tickets**: la caja de nuevo ticket es flotante, con Crear en rojo. Cada ticket es una tarjeta con su número en mono.
  - **Uso**: cuentas y cifras en tarjetas, y las barras de límite en tinta, ámbar o rojo según cuánto se usó.
  - **Actividad**: los días en mono y una línea de tiempo que une los avatares.
  - **Configuración**:
    - el menú es una bandeja suave con la sección elegida **en tinta**, como la barra lateral; en el celular pasa a
      pastillas que se deslizan;
    - cada bloque es una tarjeta con su rótulo en mono;
    - los botones Guardar van en tinta y los selectores en la cápsula;
    - las opciones del **piloto automático** son tarjetas, con la elegida en tinta.
  - Probado en 1440, celular y oscuro.
- **2026-11-27 · Juan IA**. Es el mentor del método ATV: contesta con los SOPs y las clases. Ahora:
  - **Juan habla primero.** El inicio arranca con la cara de Juan, "Juan IA · tu mentor del método ATV" y el saludo. Abajo hay hasta
    **3 preguntas que Juan te haría hoy**, armadas con el estado real (`preguntasDeJuan` en 02):
    - el paso del roadmap en curso;
    - lo que espera tu OK;
    - un KPI propuesto;
    - el último reporte en #ceo.
    Si no hay nada de eso, quedan las preguntas del tema. Tocar una la deja en la caja (`data-juan-idea`) para mandarla o cambiarla.
    Debajo van la caja, "O mirá tu negocio desde" (los temas, en pastillas) y las ideas.
  - **La charla es un cuaderno**, no globos de chat:
    - lo de Juan va en una hoja de papel con un margen rojo, renglones y su firma "JUAN" en una pastilla roja, con lo importante resaltado;
    - lo tuyo es una nota corta en tinta;
    - "Trabajando" lleva un punto rojo que late.
  - La lista de chats queda a la derecha, con "Chat nuevo" en rojo y el abierto en tinta. En el celular se oculta.
  - **Mock**: `state.juanChats` trae 2 chats. `POST /juan/chats` crea uno o lo continúa, muestra los pasos y contesta a los 2,5 s.
- **2026-11-27 · Classroom: cómo funciona** (09-classroom.js). **No es el classroom**: es el **escritorio del equipo de ATV** sobre
  los chats del classroom de los clientes. Se conecta con "Entrar con el classroom", que en el repo del Classroom es
  `/leverage/conectar` y da una clave personal de lectura. En la app de escritorio, además, abre el classroom en el navegador
  del costado. Tiene tres pestañas:
  - **Consultas**: lo que los clientes esperan que el equipo responda. Vienen del "update de Mauri" o de chats que dejó el piloto.
    - Cada una dice cuánto espera y si está tomada. Filtros: Sin tomar / Mías / Todas.
    - Al abrir una, se ve el chat del cliente (con adjuntos y Looms). "Armar respuesta" **toma** la consulta, y el equipo ve
      quién la está respondiendo.
    - Juan IA lee todo, transcribe los Looms y deja un borrador con "qué le estás diciendo, en simple". Se corrige, y se manda con
      "Mandar como X", "Pedir otra" o "Descartar".
  - **Responder**: lo mismo, pero buscando a cualquier cliente por nombre.
  - **Piloto**: el que contesta solo a los clientes.
    - Lo de hoy: salieron solos, borradores mandados tal cual, editados y para el equipo.
    - El **modo de cada coach**: apagado, borrador o automático.
    - "Esperan respuesta": lo que el piloto dejó para el equipo, y se abre en el classroom.
    - El conocimiento: las llamadas de Fathom de Juan.
- **2026-11-27 · Classroom: rediseño**:
  - La cabecera es propia (el título, "● classroom.atvos.io · conectado" y las pestañas en la cápsula, con las consultas
    sin tomar en rojo). La cabecera chica se oculta (`data-vista="classroom"`).
  - **Consultas**: una bandeja suave con fichas. La abierta va en tinta y la espera, en una pastilla que pasa de gris a ámbar y a rojo.
    El chat del cliente va sobre papel: el cliente en papel y el equipo en tinta, con los adjuntos en pastillas.
  - **La respuesta que arma Juan va en su hoja de cuaderno** (la misma de Juan IA, con su firma "JUAN IA"): el texto se corrige
    sobre los renglones, "Qué le estás diciendo" va en una nota roja suave y "Mandar como…" en rojo.
  - **Piloto**: las cifras del día en un marcador 2×2 (lo que es para el equipo, en rojo), el modo de cada coach en la cápsula
    y "Esperan respuesta" con la espera en rojo.
  - **Mock**: `mock/classroom.mjs` sirve las consultas, los clientes, el chat, armar (borrador a los 3 s), tomar, soltar,
    mandar, descartar y el modo del piloto.
  - **Choque de clases**: el classroom usa `.cls-msg.eq` para los mensajes del equipo, y el Equipo tenía su raíz en `.eq`
    con `container-type`, que aplastaba esas burbujas. **La raíz del Equipo ahora es `.eqm`.**
  - Probado en 1440, celular y oscuro (las dos pantallas).
- **2026-11-27 · Repaso general**: se recorrieron las 19 vistas y las 8 secciones de Configuración sin errores de consola.
  - **Lo que quedaba con el diseño viejo**:
    - **Programado e historial**, la otra pestaña del Tablero: ahora tiene su misma cabecera (línea roja, título grande, cápsula),
      columnas en tarjetas y filtros en la cápsula.
    - **Visor de archivos**: una hoja que entra desde la derecha. El documento se lee en papel, con un ancho de lectura,
      títulos con aire, lo importante resaltado y las viñetas en rojo.
    - **Embudos / Negocio** (vista `carpeta`): cada bloque es una tarjeta con su rótulo en mono, y el CRM es la carpeta de cartón.
    - **La ficha del agente** (modal): una hoja con el filo rojo, campos suaves, rótulos en mono y el modelo elegido en tinta.
  - **Errores arreglados**:
    - el menú de "Tu espacio" era transparente y se veían las secciones de la barra a través: `z-index` en `.sb-espacio`;
    - en la ficha, las opciones del modelo heredaban el rótulo en mono;
    - en el celular, Embudos y la Biblioteca se salían por la derecha: `.lib` con `minmax(0, 1fr)`;
    - en el celular, en Automatizaciones los números bajan a su propia fila y el ícono sin miniatura mide lo mismo que las miniaturas;
    - en el celular, la caja de Juan IA esconde la pastilla de Juan para no desbordar.
  - Se midió el desborde horizontal de todas las vistas en el celular: quedó en cero (salvo los paneles laterales ocultos a propósito).
  - **Mock**: `/embudos` (negocio, publicados, workflows y CRM) y `/file`, un .md de prueba para el visor.
- **Para entregar**: los archivos de `ui/` que cambiaron desde el original salen con `git diff --name-only c718430 -- ui`.
  - Archivos nuevos: `ui/atv.css` y `ui/fonts/` (Helvetica Now Display).
  - Archivos tocados: `ui/index.html` (`atv.css` y los elementos de la barra), `ui/app.css` (colores a variables) y
    `ui/app/01, 02, 04, 08, 08-z, 09 y 11`.
  - `mock/`, `package.json`, `CONTEXTO.md` y `.claude/` **no** se entregan.
- **Git local**: se inicializó un repo solo local en `ATV-LEVERAGE` para ver los cambios (`git diff c718430`),
  y hay una copia de la `ui/` original en `D:\Landings - Copy\ATV\ui-original-leverage-backup`.
  Para entregar se devuelven los archivos de `ui/` que cambiaron: `git diff --name-only c718430 -- ui`.
- **2026-11-28 · Tu equipo, segunda vuelta** (pedido "Modificaciones del sistema — Tu equipo"):
  - **Arriba a la derecha, como en el Classroom** (`renderArriba`, `perfilHtml` y `migasHtml` en 01; `#lv-top` en `index.html`):
    a la izquierda, las migas (Tu equipo › Bandeja › Sofía); a la derecha, el piloto automático, el modo claro/oscuro
    (dos íconos) y tu avatar, que abre el menú (Mi cuenta, Configuración, Tu navegador y Cerrar o iniciar sesión de Claude).
    La barra lateral quedó solo para navegar: se sacó el pie (piloto, navegador, modo y configuración).
    En el celular, el avatar va en la barra de arriba y el menú suma el piloto y el modo.
    - "Cerrar sesión de Claude" llama a `POST /claude/salir`. **Esa ruta no existe en el servidor real** (no se encontró
      cómo se cierra la sesión): si falla, avisa que se quite la cuenta en Mi cuenta. ATV tiene que confirmar la ruta.
  - **Tablero** (`tableroHtml` en 01):
    - "Trabajando ahora": sin aros que giran; una pastilla verde "Trabajando · 12 min" (o "En fila") y lo que está haciendo debajo, con un filo verde.
    - La caja de abajo es una frase: "**Asistente**, …". El nombre es un botón para elegir a quién le escribís (`tbPara`, se guarda).
      Lo que mandás va a `POST /agents/:id/order` y se abre ese chat en la Bandeja, donde se ve tu mensaje y la respuesta.
      Antes iba al chat de trabajo y en el mock no llegaba (el mock no atendía `/order`).
    - Las **métricas propuestas** (ej. "Llamadas agendadas por semana") ya no se mezclan con "Esperan tu OK": van aparte, en
      otro bloque y con otro diseño (la meta en grande, "Sumar la métrica" / "Descartar").
    - La cápsula de arriba ahora tiene tres: **Hoy · Programados · Historial**.
  - **Programados** (solo lo que viene): cada vez que corre una rutina en los próximos 7 días, por día, con **Hoy** primero y
    marcado. Cada una se puede **pausar**; las pausadas quedan al costado con **Reanudar** (usa `POST /routines`). Al costado,
    lo que los agentes se anotaron para revisar.
  - **Historial** (solo lo que pasó): por día, del más nuevo al más viejo, con filtros **Hoy, Ayer, Últimos 7 días, Últimos 30
    días y Todo** (con la cantidad en cada uno). Junta pedidos, entregas, lo que decidiste (y lo que aprobó el piloto), reportes
    de #ceo, KPIs, lo que le pediste a cada uno y las rutinas que corrieron.
    - Lee dos datos nuevos si vienen: `requests[].decididoAt` (cuándo se decidió) y `state.corridas` (las rutinas que corrieron).
      **El servidor real puede no mandarlos** (⚠ sin verificar): sin ellos, el historial muestra igual lo demás.
  - **Bandeja y chat** (`renderPanel` en 01): se sacó el panel fijo de la derecha ("Último pedido", "Archivos"). Los íconos de
    arriba del chat (**Archivos, Actividad, Ficha**) abren un panel al costado **sin cerrar el chat**, también en la Bandeja.
    La ficha se edita y guarda ahí mismo (`PATCH /agents/:id`). En tablet ancha el panel va al lado y se guarda la lista;
    en tablet angosta y celular sube desde abajo. La Bandeja en tablet angosta pasa a "lista o chat", como el celular.
  - **Equipo** (`equipoHtml` en 04): se cambió la constelación por un organigrama limpio: vos → el Asistente, y cada área como
    una bandeja con pestaña, con su capitán y su gente. El estado es un punto (y la palabra en los capitanes); al pie de cada área,
    la última orden que se pasaron adentro. Los números de arriba filtran por estado. A la derecha la credencial, del mismo alto,
    con lo que espera tu OK (Aprobar/Ver) y lo último que hizo. Abajo, de borde a borde, **"Lo último que se dijeron"** en fichas.
  - **Roadmap** (`roadmapHtml` en 02): se cambió el sendero que se arrastraba por un **riel de hitos** (cada uno con su estado y
    su barrita, el elegido en tinta) y, abajo, el hito entero: tareas por partes, y al costado el punto de encuentro, lo que se
    logró, las entregas, quiénes trabajan y las notas. Flechas para pasar de hito. Las acciones son las mismas (`data-rm-*`).
    Lee campos opcionales nuevos del roadmap: `meta`, y en cada paso `inicio`, `resultado` y `notas`.
  - **Mock** (no se entrega): `mock/equipo.mjs` simula al equipo: pedirle algo a un agente (el Asistente lo reparte por tema y el
    agente entrega), aprobar / pedir cambios / rechazar, KPIs, editar o sacar un agente, todas las rutas del roadmap, #ceo,
    rutinas y la sesión de Claude. **Los datos se guardan en `mock/.guardado.json`** (no va a git): sobreviven a reiniciar el
    server. Para volver a cero: borrar ese archivo o `POST /mock/reiniciar`. El roadmap de prueba tiene 2 hitos completos.
  - Probado en 1440, 1024, tablet (768) y celular (375), claro y oscuro, sin errores de consola ni desborde horizontal.
