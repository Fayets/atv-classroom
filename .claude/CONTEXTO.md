# Contexto de la sesión de rediseño (noviembre 2026, rama `prueba-v1`)

Este archivo resume todo lo que se hizo y se decidió en la sesión de trabajo con Claude sobre el frontend del
classroom de ATV, para poder seguir desde otra PC u otro chat sin perder nada. Si abrís un chat nuevo, pasale
este archivo y decile que lo lea antes de tocar nada.

---

## 1. Cómo levantar el proyecto

- Repo: `https://github.com/Fayets/atv-classroom`, rama **`prueba-v1`**.
- El frontend está en `frontend/` (React 19 + Vite 8, sin TypeScript, sin Tailwind, sin shadcn).
- Instalar y levantar en **modo mock** (datos de prueba, sin backend ni base):

```powershell
cd frontend
npm ci
npm run dev:mock
```

- Abre en `http://localhost:5173`. `npm run dev` (sin mock) le pega al backend real.
- En `.claude/launch.json` del repo está la configuración `classroom-mock` para la vista previa de Claude Code.
  (En la PC original además se creó un `launch.json` en la carpeta de arriba del repo, `ATV/.claude/`, porque la
  vista previa lo buscaba ahí; no es parte del repo.)

### Usuarios de prueba (modo mock)

El login mock no mira la contraseña (cualquiera sirve). El rol sale de lo que contiene el email
(`frontend/src/api/mock/handler.js`, función `login`):

| Email | Entra como |
|---|---|
| contiene `cliente` (ej. `cliente@atv.io`) | **Alan Klein**, cliente plan Boost (el "miembro normal") |
| contiene `coach` (ej. `coach@atv.io`) | **Lucho Vicente**, coach (equipo, sin admin) |
| cualquier otro (ej. `admin@atv.io`) | **Laureano Sierra**, admin |

Para cambiar de usuario: avatar arriba a la derecha → Cerrar sesión (ver 2.9).

### Cosas a saber del mock

- Los datos viven en memoria: **al recargar la página vuelven los "sin leer"** y todo lo que se cambió.
- Admin (Permisos, Tools, Contenido), Cerebro y Equipo muestran "Sin datos de prueba para esta ruta":
  esas rutas no están simuladas.
- La **guía con IA** del Inicio no está simulada: al preguntarle algo muestra "Sin datos de prueba para esta ruta".
- (Desde 2.8 el mock cubre muchas más rutas: guía, frentes, admin, cerebro, consultas, equipo, carpetas.)
- Se agregaron al mock (copiando la forma exacta del backend) `/api/programas/continuar`
  (`continuarClase` en `api/mock/classroom.js`) y `/api/frentes` (`frentesDelCliente` en `api/mock/extras.js`),
  para que el Inicio muestre "Seguí donde quedaste" y "Tus frentes abiertos".

---

## 2. Cambios hechos (en orden)

### 2.1 Rediseño de **Tools** (`/tools`)
- Archivos: `frontend/src/pages/ToolsPage.jsx`, `frontend/src/styles/tools.css`,
  `frontend/src/components/tools/DibujosTools.jsx`.
- Mismo lenguaje que **Material** (`.cr-root` de `styles/classroom-rediseno.css`: papel cálido `#f6f4f0`,
  vidrio, títulos grandes, rojo ATV `#c0392b`).
- Referencias brasileñas: RD Station (tablero de productos con el dibujo adentro), Rocketseat (etiquetas y
  botones píldora), Hotmart (vitrina oscura para lo que se compra aparte).
- **"En tu plan"**: tablero (bento) de tarjetas de vidrio; la tool nueva (o la primera) va destacada ocupando
  dos columnas. Cada tarjeta ya trae descripción y botón **Abrir** (en el mock dicen "Muy pronto" porque `abrir`
  viene en false).
- **"Para sumar"**: vitrina carbón, dibujo empañado, "No está en tu plan", precio y **"Sumarla con Juampi"**
  (WhatsApp).
- Los dibujos ahora usan `currentColor` (sirven en tarjetas claras y oscuras).
- Responsive: en tablet una tarjeta que queda sola en la última fila ocupa todo el ancho; en celular una columna.

### 2.2 Adaptación a **tablet y celular** de todas las pantallas (cliente, admin, coach)
- El cliente ya tenía barra de abajo en el celular. Se corrigió:
  - **Equipo (admin/coach) en celular**: barra de abajo con íconos como el cliente (`cliente-tabs--equipo`);
    arriba el isotipo y el nombre de la sección (`mac-titulo-movil`). Archivos: `components/AppHeader.jsx`,
    `index.css`, `styles/mensajes.css`.
  - **Equipo en tablet (761–1080px)**: se saca el semáforo decorativo y el menú se centra sin pisar las flechas.
  - **Admin en celular**: título arriba y pestañas abajo a todo el ancho (`styles/permisos.css`).
  - **Mensajes**: el texto de ayuda del cuadro para escribir va en una línea (antes se cortaba).
  - **Barra de la clase** en tablet: en una línea, sin el atajo ⌘K.
- (Histórico) El equipo en pantallas de 900px o más trabajaba en el "escritorio macOS"
  (`components/mac/Escritorio.jsx`). **Ya no**: ver 2.7.

### 2.3 Menú del equipo en dos grupos (histórico: después se reemplazó por la barra lateral, ver 2.7)
- Izquierda lo **común** (lo que también ven los clientes): **Mensajes, Classroom**.
- Línea separadora "bien hecha".
- Derecha lo del **equipo/admin**: Consultas, Biblioteca (todo el equipo) y Cerebro, Equipo, Módulos, Clientes
  (solo admin). El coach ve: Mensajes, Classroom | Consultas, Biblioteca.
- Aplicado en el **Dock** de PC (`Escritorio.jsx`, separador en `styles/finder.css`), en la barra de arriba de
  tablet (`mac-nav__separador`) y en la barra de abajo del celular (`a.is-grupo::before`).
- Al equipo **no** se le agregaron Tools ni Roadmap al menú (no se pidió; quedó como opción).

### 2.4 Nombres de canales sin emoji en el chat
- Los canales de grupo se guardan con emoji y separador (`"👋┊presentación"`). La barra lateral ya los mostraba
  limpios; ahora también el chat: barra de arriba, "Este es el comienzo de #…", texto de ayuda, sugerencias de
  `#canal`, alertas, lista del cliente, editar/borrar canal.
- Se usa `nombreVisible()` (`utils/canales.js`) y el ícono de línea `IconoCanal` (ahora acepta `className`).
- El nombre guardado no cambia.

### 2.5 El punto rojo de "sin leer" no se iba
- Causa: `Conversacion.jsx` marcaba leído hasta el último mensaje; un canal abierto **sin mensajes a la vista**
  (en el mock casi todos; en producción si lo nuevo se borró) nunca se marcaba.
- Arreglo: si el canal abre sin mensajes, se marca leído "hasta el final" (`LEIDO_HASTA_EL_FINAL`) y el backend
  lo recorta al último que existe (`min(ultimo_id, tope)` en `mensajeria_service.marcar_leido`). No hubo que
  tocar el backend.

### 2.6 Rediseño del **Inicio** del cliente (`/`)
- Archivos: `pages/InicioPage.jsx`, `components/inicio/Hoy.jsx`, `components/inicio/HazGuia.jsx`,
  `styles/inicio.css` (nuevo), `components/efectos/LaserFlow.jsx` + `.css` (nuevos).
- Referencias brasileñas: **Stone** (lista tipográfica gigante, un renglón se enciende y el resto apagado),
  **Nubank** (banda de color de borde a borde con letra enorme), **Cora** (sello con texto girando en círculo).
- Estructura actual:
  1. **Primera pantalla a alto completo** (en PC, tablet y celular): título "Alan, ¿qué está trabando tu negocio
     hoy?" con "trabando" subrayado a mano en rojo, el campo de la guía, y la lista **"O tocá lo que más se
     repite"** (4 ejemplos grandes) a **15px** del aviso **"Scrolleá"** (flecha roja que rebota; al tocarlo baja
     a la banda roja). La banda roja y lo demás aparecen recién al bajar.
     - Espacio libre: 3 partes arriba del título y 1 entre el campo y la lista (pseudo-elementos `::before` y
       `::after` de `.in-ask` con `flex`).
     - El **título queda alineado a la izquierda** donde arranca el contenido de la página (alineado con la banda
       roja). El **campo, la lista y "Scrolleá" van centrados** en la página, en una columna de
       `--in-col: 940px`.
     - Tamaños: título hasta 60px (en celular 32–40px); campo 70px de alto (60px en celular); lista hasta 36px.
  2. **Haz de luz (LaserFlow)**: cae desde la barra de arriba y choca contra el campo, justo a la izquierda del
     botón de enviar. Va detrás del contenido. Claro y oscuro (sigue a `<html data-modo="azul">`); en celular a
     menor resolución y con menos niebla/partículas; sin el "derrame" por los costados (`spill={0}`, dibujaba un
     borde recto). Respeta "reducir movimiento". Componente copiado del registro de React Bits
     (`@react-bits/LaserFlow-JS-CSS`) a mano porque el proyecto no usa shadcn.
  3. **Al buscar con la guía**: el título **no se mueve** (se mide su altura antes de preguntar y se guarda en
     `--in-arriba`), no hay barra "Guía ATV / Nueva consulta", la lista de ejemplos desaparece y la respuesta
     aparece abajo del campo. Para otra consulta se escribe de nuevo en el mismo campo.
  4. **Banda roja "Tu próximo paso"** (Nubank): paso del roadmap en grande, coach, `1/5` con segmentos y
     "Ver mi roadmap".
  5. **"Tu semana"** (bento de vidrio): Seguí donde quedaste (portada del módulo + play), Tu chat con ATV (último
     mensaje como globo), Biblioteca de SOPs (pila de hojas), Tu avance en el material (anillo chico).
  6. **Tus frentes abiertos**.
- **Se sacaron la fecha y el anillo "87 días"** en todas las pantallas. El componente `AnilloPrograma` (en
  `Hoy.jsx`, estilos `.in-anillo` en `inicio.css`) **quedó guardado para usarlo en otra sección más adelante**
  (recibe la cuenta de `fetchCuenta()`).
- En celular la primera pantalla descuenta la barra de arriba (55px) y la de abajo (66px); en PC/tablet, con la
  barra lateral, la barra de arriba (migas) mide 56px (variables `--in-barra`, `--in-abajo`, `--in-gap` en
  `inicio.css`; el 56px lo pone `sidebar.css`).
- La banda roja y el haz usan `--vista` (el ancho de la ventana menos la barra lateral) para ir de borde a borde.

### 2.7 **Barra lateral** (sidebar) para todos: miembro, coach y admin
Pedido del superior: sacar el menú del medio y poner "un sidebar a la izquierda, bien facha", con secciones como
Mi cuenta / configuración. Referencias: las capturas de un "Knowledge Base" (sidebar + árbol de carpetas) que pasó
el dueño, adaptadas a ATV, y patrones de apps brasileñas (credencial de cuenta arriba como Cora, riel de íconos +
panel como Pipefy). No se copió: árbol de módulos con anillos de avance y grupos como bandejas con pestaña.
- Archivos: `components/Sidebar.jsx`, `styles/sidebar.css` (nuevos), `App.jsx` (`BarraLateral` monta la barra una
  sola vez, fuera de las páginas, para que la píldora se deslice), `components/AppHeader.jsx` (migas y botón de
  menú), `components/mac/HerramientasEquipo.jsx` (nuevo), `pages/MensajesPage.jsx` (ficha del cliente).
- **Contenido de arriba a abajo**:
  - Credencial: isotipo, "ATV Classroom" y "Boost · 87 días" (cliente; los días en rojo con 15 o menos) o
    "Administrador"/"Coach". Botón para plegar.
  - Buscador "Buscar o preguntar" (⌘K/Ctrl+K): lleva al campo de la guía del Inicio (solo clientes con guía).
  - Grupos de secciones con una **píldora de tinta que se desliza** a la activa (y una rayita roja):
    - Cliente: "Tu espacio" (Inicio, Material, Roadmap, Tools, Mensajes con contador).
    - Equipo: "General" (Mensajes, Classroom) y "Equipo y admin" (Consultas; admin además Cerebro, Equipo, Módulos).
  - Equipo: grupo **"Carpetas"** (Clientes, Contratos, Cierres de mes —solo admin—, Onboardings, Llamadas,
    Cuellos de botella, SOPs solicitados, Biblioteca, y en rojo Nuevo onboarding / Nueva clase —esta solo admin—).
  - **"Tu material"** (cliente) / "Módulos del classroom" (equipo): árbol de módulos con mini anillo de avance y
    "hechas/total"; candado si está bloqueado. **Cerrado se ve como una carpeta entera** (tapa con pestaña, dos
    hojas que asoman y el frente con "Tu material · 13 módulos · 19% hecho"; al pasar el mouse el frente se
    inclina y las hojas suben). Abierto/cerrado queda guardado (`localStorage` `atv_sb_material`).
  - Los hijos de la barra no se aplastan (`.sb > * { flex-shrink: 0 }`): la barra hace scroll si no entra.
  - Abajo: tu cuenta ("Mi cuenta y configuración" → `/cuenta`), mensajes directos (equipo), modo de color (claro →
    oscuro → auto) y cerrar sesión.
- **Separación de grupos**: cada grupo es una **bandeja** un tono más clara que la barra, con su nombre como
  **pestaña de carpeta** arriba a la izquierda (como las pestañas de las hojas de SOPs de Material).
- **Encabezado de arriba**: con la barra lateral queda como **migas** ("ATV › Material"), 56px de alto; el menú del
  medio y el avatar ya no se muestran ahí (el equipo conserva las flechas atrás/adelante).
- **Tamaños**: PC (≥1100px) barra desplegada de 264px; tablet (721–1099px) arranca plegada como **riel de íconos**
  de 76px. El botón de plegar guarda la preferencia (`localStorage` `atv_sb_riel`). La página se corre a la derecha
  con `body:has(> .sb) { padding-left: var(--sb-w) }`.
- **Celular (≤720px)**: sigue la **barra de abajo** (lo más fácil con el pulgar) y arriba aparece un botón de menú
  (≡) que abre la barra lateral como **cajón** (siempre desplegada; sin el grupo Carpetas). El botón manda el evento
  `atv:menu`.
- **El escritorio macOS del equipo se reemplazó**: en PC el equipo navega con la barra lateral como el cliente.
  Sus carpetas son las mismas ventanas de antes (`Finder`, `BibliotecaApp`, `*Carpeta`, `NuevaClase`,
  `NuevoCliente`), ahora en `HerramientasEquipo.jsx`: flotan sobre la página a la derecha de la barra, se abren
  con el evento `atv:carpeta` (desde la barra) y "Ver ficha" en Mensajes manda `atv:ficha` (abre Clientes en esa
  ficha). Al ir a un chat o pantalla desde una carpeta, las ventanas se cierran. `Escritorio.jsx` y
  `EscritorioContext.jsx` quedaron sin usar (no se borraron, por si se quiere volver).

### 2.8 Trabajo hecho desde la otra PC (commits `6f40485`, `0fc7dc4`, `bbc34da`, `62c43cb`)
Resumido de los mensajes de commit; en algunos puntos reemplaza lo descrito arriba.
- **Branding 2026** (`styles/marca.css` y otros):
  - Fuente de toda la app: **Helvetica Now Display**. **Hoosegow JNL** en números y **Biro Script Plus** en la
    firma del coach y la pizarra. El PDF del diagnóstico de cuellos usa Helvetica Now (Poppins de respaldo).
  - **Login** con fotos del brandbook (22 en rotación) y el sello "Aumenta tu valor". Sello y círculo ATV en la
    credencial y en la banda roja del Inicio.
  - Textura de papel detrás del contenido en modo claro; fotos en los estados vacíos de SOPs y Roadmap.
  - Logo y favicon con los íconos de `public/icons`.
  - El **título del Inicio** quedó más chico (cambia lo de 2.6).
- **Mi cuenta**: credencial en carbón liso, sin holograma ni brillos y con más contraste (antes hubo una versión
  holográfica con "pase perforado de semanas", reemplazada).
- **Celular (cambia lo de 2.2 y 2.7)**: **ya no hay barra de abajo ni avatar**. Solo el menú hamburguesa: abre la
  barra lateral como cajón, con el fondo sin scroll y el pie (Mi cuenta, modo de color, cerrar sesión) fijo abajo.
- **Notificaciones**: campanita en Mensajes (roadmap, pasos, cierre de mes, acceso, avisos), con vistas por
  dispositivo. Archivos nuevos en `utils/alertasApp.js`.
- **Contador de Mensajes** (`utils/contador.js`): muestra el número solo cuando hay menciones; si solo hay sin
  leer, un punto. **Mensajes directos** tienen su propia vista (ícono de avión).
- **Cierre de mes**: aviso, cartel y formulario con la paleta de la app, en claro y oscuro.
- **SOPs**: en celular y tablet los filtros van en un desplegable; filas de módulos y "Tu próximo paso" con más aire.
- **Barra lateral**: el árbol de módulos se actualiza al marcar una clase (evento `atv:progreso`). El atajo del
  buscador dice Ctrl K o ⌘K según la compu.
- **Tools** en celular: la última tarjeta se apila como las demás. **Roadmap**: tocar el punto abierto lo pliega.
- **Se sacaron**: el efecto TechText (nombre y "Scrolleá") y el "Modo Miembro" del admin (existió un tiempo).
- **Mock ampliado**: rutas para guía, frentes, foto de perfil, admin, cerebro, consultas, equipo, tools, carpetas
  del equipo y mensajería/seguimiento. Para probar en el celular de la misma red: `npm run dev:mock -- --host`.
- **Importante**: el "cerebro" de la app (backend / repo `cerebro-productos-digitales`) **no se toca** desde este
  trabajo. En la otra PC Claude intentó subir el contexto ahí por error; el contexto del chat va en este archivo.

### 2.9 Feedback del superior (noviembre 2026), en tandas — **reemplaza partes de 2.7**
Se trabajó "de a poco y muy preciso": cada pedido se verificó en el navegador (PC, celular, claro y oscuro,
miembro y admin).
- **Perfil arriba a la derecha, en todas las pantallas (también celular)** — `components/AppHeader.jsx`:
  - A la izquierda del avatar, el **modo de color como dos íconos** (☀ claro / 🌙 oscuro), `ModoIconos`.
  - El avatar abre su menú **al pasar el mouse** (PC) **o al tocarlo** (celular): nombre, plan y días, Mi cuenta,
    Mensajes directos (equipo) y **Cerrar sesión**. Se sacó del menú la fila "Modo".
  - **La barra lateral ya no tiene pie** (cuenta, modo y salir se fueron arriba). En celular el cajón ya no reserva
    lugar abajo: la bandeja de "Tu espacio" llega hasta el final.
- **"Tu material" adentro de la bandeja de "Tu espacio"** (solo miembro): la bandeja blanca llega hasta abajo de la
  barra y la carpeta (o el árbol) va adentro. El equipo lo sigue teniendo debajo de sus grupos.
  - **Barra plegada (riel)**: "Tu material" es un ícono de carpeta; al tocarlo se despliega la barra con el árbol
    abierto (`sb-material-riel`).
- **Sección activa**: se sacó la rayita roja de afuera; ahora hay una **línea roja pegada al borde izquierdo, por
  dentro de la píldora, con una luz roja** que se difumina (`.sb-pildora::before/::after`).
- **Buscador propio de la barra** — `components/BuscadorBarra.jsx` (nuevo): ya **no lleva al Inicio**. Al tocarlo (o
  Ctrl K / ⌘K) abre un panel con sugerencias (SOPs, "Seguí con <módulo a medias>", secciones) y **filtra mientras
  escribís** secciones, módulos, SOPs y (equipo) carpetas; con "S" aparece primero "SOPs". Sinónimos ("procesos" →
  SOPs, "perfil" → Mi cuenta). Flechas, Enter y Esc. Resultados agrupados por tipo.
- **Migas funcionales** — `AppHeader.jsx` (`armarMigas`, `Migas`) + `utils/migas.js` (nuevo): cada nivel es un
  link ("ATV" → Inicio; al equipo → Mensajes). Niveles que salen de la URL (Mensajes directos, Menciones,
  Seguimiento, SOPs, Admin › Tools, Roadmap del cliente, Frentes) y niveles que informa la página con
  `ponerMigas()`: **MensajesPage** el chat abierto y **ProgramaDetailPage** el módulo y la clase. Cada página
  borra sus niveles al irse (limpieza del efecto) y el encabezado los relee al montarse.
- **Textura de papel** (modo claro, `styles/marca.css`): opacidad de 0.09 a **0.025**, casi imperceptible.
- **Banda roja del Inicio**: se sacó el sello de ATV detrás del "1/5"; el **badge del coach está animado** (el
  avatar late con un anillo y un brillo cruza la píldora), respeta "reducir movimiento".
- **"Tu chat con ATV"** (Inicio): muestra los **últimos 2 mensajes reales que mandó el equipo** (pide los mensajes
  del canal y suma los nuevos en vivo; los del propio cliente no cuentan). En celular, solo el último.
- **Progreso de los módulos**: el % sale de las clases marcadas como **implementadas** (se guarda en el servidor).
  Ahora **tildar todas las claves de "Aplicalo en tu negocio" marca la clase como implementada** sola
  (`MesaClase.jsx`); destildar una no la desmarca (eso se hace con el botón). Verificado: al volver a "Todo el
  material" el % sube o baja.
- **La clase: que se note cómo avanzar** (`BarraModulo.jsx`, `MesaClase.jsx`, `classroom-rediseno.css`):
  - Arriba, selector **‹ Clase X/Y ›** (la flecha siguiente en rojo) y el segmento de la clase actual **late**.
  - Debajo del botón de implementar, una guía: "Vas por la clase X de Y…" y, al implementarla, una tarjeta verde
    **"Clase lista · N de M implementadas · Seguí con la X: …"** que lleva a la siguiente. En la última clase dice si
    completaste el módulo o cuántas faltan.
  - "Siguiente clase" sola (sin "Anterior") queda alineada a la izquierda.
- **Mensajes**: "En vivo" va **debajo del título "Mensajes"**, con el punto verde que late.
- **Credencial de la barra**: el plan es un **sello ★ BOOST con borde de gradiente que gira** (rojo ATV, ámbar,
  crema) y los días al lado; para el equipo dice Administrador/Coach.
- **Cierre de mes** (`components/CierreMes.jsx`): el campo "Nombre del creador" **decide el creador recién al
  terminar de escribir** (salir del campo, Enter o elegirlo de la lista); antes cambiaba con cada letra ("a" ya era
  un creador nuevo y se iban las opciones de "Tu negocio"). Además **no borra la oferta/avatar que ya escribiste**
  (solo reemplaza lo que el formulario había completado del creador anterior). Cada creador tiene su propia oferta
  y su avatar: un nombre nuevo pide los dos.

### 2.10 Feedback del cliente + pedidos de Laureano (noviembre 2026, sobre `2fc67b4`)

El cliente dijo: le gustó la tipografía y lo "clean", siente el salto de calidad; pidió **otra propuesta de login**
(las fotos no tenían que ver con el classroom) y **otra vista de módulos** (no generaba curiosidad).

- **Login nuevo** (`pages/LoginPage.jsx`, `styles/login.css`):
  - Fondo a pantalla completa con **Lightfall** (React Bits, `components/efectos/Lightfall.jsx` + `.css`, copiado
    a mano porque el proyecto no usa shadcn). Claro: `lightMode` con colores `#c0392b/#571306` (los props que pasó
    el usuario); oscuro: rojos sobre carbón. Mantener apretado acelera la luz (`holdToWarp`). En celular `dpr=1`.
  - Sin fotos. Arriba isotipo + "ATV Classroom", "Acceso de socios · año" y un **botón claro/oscuro** (`.lg-modo`,
    usa `elegirModo` de `utils/modo.js`, queda guardado). En celular se oculta "Acceso de socios".
  - Titular "Tu programa, clase por clase." a la izquierda y la ficha de ingreso (papel con filo rojo) a la
    derecha; en tablet/celular la ficha baja. El wordmark **ΛUMENTA® TU >ALOR** pasó al pie, enorme y cortado.
  - Contraste: un velo del color del fondo detrás del encabezado y del titular (`.lg-top::before`,
    `.lg-texto::before`) y textos más oscuros/gruesos.
- **Módulos como carpetas de archivo** (`components/clase/ArchivoModulos.jsx`, `styles/archivo.css`; reemplaza
  el índice editorial `IndiceModulos` en `ProgramasGridPage.jsx`):
  - Cada módulo es una carpeta de cartón (mismo kraft que `carpetas.css`): pestaña con el número (roja en el que
    estás haciendo), portada y una hoja escrita asomando, y en el frente nombre, clases, estado y barra de avance.
  - Hover: el frente se abre (`rotateX`) y las hojas suben (variable `--abrir`); táctil: ya asoman de entrada.
  - Completo = sello verde; bloqueado = banda elástica roja; sin clases = carpeta punteada. Solo el estado en
    avance va en rojo. Celular: 2 columnas.
  - **Módulo abierto** (`BarraModulo.jsx` con `.ar-abierta`, estilos al final de `archivo.css`): la barra es la
    carpeta abierta con el nombre del módulo en la pestaña (`data-modulo`); cada sección es un **separador**
    clickeable (lleva a su primera clase, muestra hechas/total); el de la sección actual es del color de la hoja y
    se une a la clase (`.ms-mesa` como hoja). En tablet/celular los separadores se deslizan de costado.
- **Carpetas del admin** (Llamadas, Clientes, etc., `components/mac/*`): se arrastran desde **todo el borde de
  cartón** (índice, márgenes y pestaña), no solo desde la barra blanca; la hoja de adentro sigue arrastrando solo
  desde su barra. Abrían "esquinadas" porque cada una tenía un corrimiento inicial del viejo escritorio macOS
  (`pos = useRef({x: 84, y: 52})`…): ahora todas abren centradas (`{x: 0, y: 0}`).
- **Mi cuenta** (`components/cuenta/Credencial.jsx`): se sacó el talón (rol/área o pase perforado y fechas), el
  sello, el pie con estado y "Cerrar sesión", y el **tachito para quitar la foto** (confundía; la foto se cambia
  con la cámara). Aplica a todos los roles: los días de acceso siguen en "Tu plan" y en la barra lateral, y el
  logout en el menú del avatar.

### 2.11 Ajustes finales previos al lanzamiento (28/11/2026, **sin commitear**)
Feedback del Loom "Cambios para lanzamiento final" (`loom.com/share/d9d2bd39f64044508e390a18327e98a3`). Estilos
nuevos concentrados en `styles/lanzamiento.css` (se importa en `main.jsx`). **Reemplaza partes de 2.6–2.10.**
- **Contador de Mensajes**: ahora es siempre el **número de mensajes sin leer** (ya no punto / solo menciones).
  `utils/contador.js`, `components/Contador.jsx`. En celular hay un **acceso a Mensajes arriba** (`.app-chat`).
- **Navegación**: Mensajes separado y destacado en la barra lateral (`.sb-item--mensajes`); la sección activa suma
  el ícono en un cuadrado rojo.
- **Canales**: íconos en fichas, número de sin leer por canal (con `@` si te mencionaron). **Wings = canales `wins`**
  (`esCanalWins`): amarillos, con texto propio en el canal vacío y en el campo de escribir.
- **Material**: las carpetas muestran la **portada original** y una línea de descripción (si el módulo no tiene,
  sale de `MODULE_SUMMARIES` en `utils/modules.js`, **texto provisorio a validar por ATV**). Ya no asoman hojas.
- **SOPs**: cada hoja es miniatura + título + sección + íconos de plataforma (sin pestañas ni renglones).
- **Clase**: panel único "Aplicalo en tu negocio": recursos, "Paso a paso" plegado, botón y "Lo revisás con X".
  Se sacaron los rótulos Implementar/Revisar y la caja "Vas por la clase X de Y".
- **Íconos de recursos**: `components/IconoRecurso.jsx` (Docs, Sheets, Slides, Forms, Drive, Miro, Loom, YouTube,
  WhatsApp, Notion, PDF y link genérico), dibujados a mano en SVG. La plataforma sale de `tipoRecurso`.
- **Miniaturas**: `components/clase/Miniatura.jsx` usa `miniatura_url` (campo que **el backend todavía no manda**) o
  el cuadro de YouTube; si no, una provisoria con el título y el dibujo del módulo.
- **Haz del Inicio**: la entrada ahora avanza con el reloj real (antes se estiraba con pocos cuadros por segundo) y
  se subió un poco la intensidad. No se pudo reproducir en la máquina del que grabó.
- **Humo en modo claro** (pedido de Laureano): se ve el mismo humo que en oscuro, pero como **velo oscuro** sobre el
  papel (`LaserFlow.jsx`, `shade` / `smokeAlpha`; intensidad en la constante `0.44`). El modo oscuro no cambia.
- Probado en mock: PC 1440, tablet y celular, claro y oscuro (no todas las combinaciones), miembro y admin; sin
  errores de consola, `vite build` pasa. **Coach y backend real sin probar.**
- **Pedido en el Loom y NO hecho** (no estaba en la lista escrita): "más onda" en **Tools** y forzar a los clientes a
  **poner foto de perfil**.
- **Regla (28/11): no se sube ni se mergea nada a `master`; se trabaja en ramas aparte.**
- Dato informativo: `origin/master` tiene 5 commits del chat que no están en `prueba-v1`; quien integre las ramas va a
  encontrar conflictos en `Conversacion.jsx`, `MensajesPage.jsx` y `mensajes.css`.

#### 2.11.b Más énfasis en **Mensajes** (28/11, sin commitear) — lo que más le importa al cliente

Solo cambia la vista del **cliente**; la del equipo queda igual (revisada en admin).
- **"Mi canal" primero**: en la lista va arriba de todo, bajo "Tu equipo de ATV", como tarjeta (borde, sombra suave,
  borde rojo si hay sin leer) con las **caras apiladas del equipo** en lugar del `#`. Componente nuevo
  `components/mensajes/EquipoApilado.jsx`; el orden sale de `utils/equipo.js` (`ordenarEquipo`: el último que escribió,
  después coaches, después el resto), con `fetchEquipoChat` (cacheado).
- **Cabecera de Mi canal**: antes decía el nombre del propio cliente ("Alan Klein"); ahora "Mi canal" + "Con Alejandro,
  Lucho y Lucas del equipo de ATV" (los del equipo que escribieron en los mensajes cargados, los 3 más recientes) y sus caras.
- **Divisor "Nuevos"** (todos los canales, cliente y equipo): antes del primer mensaje que estaba sin leer al abrir
  (sale de `item.no_leidos` al montar `Conversacion`, contando hacia atrás los mensajes ajenos). Si no entra en pantalla,
  el canal abre en el divisor en vez de abajo.
- **Entrada suave** (260 ms, sube 6 px) solo de los mensajes ajenos que llegan con el canal abierto (`is-entra`: id mayor
  al último de la primera carga). Con movimiento reducido, solo fundido.
- Se probaron **atajos para escribir** sobre la caja ("Tengo una duda", etc.) y **se sacaron** a pedido de Laureano:
  no los vuelvas a poner.
- El aviso flotante del **cierre de mes** (`.cm-aviso`) ya no aparece en Mensajes: tapaba el último mensaje. Ahí lo lleva
  la campana de arriba de la lista.
- Estilos al final de `styles/lanzamiento.css`. Build pasa; oxlint sigue en 20 avisos (ninguno nuevo).

---

## 3. Preferencias y forma de trabajar del dueño del proyecto

- Habla en español rioplatense; los textos de la app van en voseo ("Scrolleá", "Contá", "Tocá").
- Quiere diseño **llamativo e innovador, que no parezca hecho con IA**; le gusta tomar referencias de sitios y
  sistemas **brasileños** y usar el lenguaje de **Material** como base.
- Cuida mucho el **UX/UI básico**: aire arriba del contenido, nada "tirado a un costado", tamaños proporcionados
  en monitores grandes (prueba en 1920×993), que nada salte de lugar al interactuar.
- Pide los cambios en **PC, tablet y celular**, y en **modo claro y oscuro**.
- Revisa con capturas marcadas; cuando dice que algo "está bien" no hay que moverlo.
- Hacer commit/push solo cuando lo pide, y **antes de pushear actualizar este CONTEXTO.md**.
- **Nunca subir ni mergear nada a `master`**: todo va en ramas aparte (el Classroom, en `prueba-v1`).
- Le gusta ir "de a poco y muy preciso": varios pedidos por mensaje, cada uno verificado.
- En esa PC hay skills instaladas solo localmente (`.claude/skills/`, emilkowalski/skills y taste-skill), excluidas
  de git con `.git/info/exclude`; no están en el repo.

---

## 4. Pendientes e ideas que quedaron abiertas

- **Anillo "87 días"**: guardado para otra sección (por ejemplo Cuenta o Roadmap).
- **Título del Inicio**: hoy arranca más a la izquierda que el campo (pedido así). Si se quiere alinear con el
  campo o centrarlo, es un cambio de una línea en `inicio.css`.
- **Celular al buscar**: hoy el título queda fijo; si se quiere otro comportamiento, está en `InicioPage.jsx`
  (`setArriba`) e `inicio.css` (`--in-arriba`).
- **Tools/Roadmap en el menú del equipo**: no están; se podrían sumar al grupo "General".
- **Barra lateral**: la vista del **coach** y la del **cliente** con las bandejas no se revisaron en pantalla
  (usan el mismo código que el admin, que sí se revisó). En el mock las carpetas abren vacías (sin datos).
- **Chat ("lo del Discord")**: el superior pidió ajustes al chat; todavía no se tocó.
- Se puede borrar `Escritorio.jsx` / `EscritorioContext.jsx` si se confirma que no se vuelve al escritorio macOS
  (ojo: `AppHeader`, `MensajesPage` y `App.jsx` todavía leen `useEscritorio()`, que hoy siempre da `null`).
- **Modo claro del haz**: por cómo funciona el efecto, en fondos claros se ve como un brillo cálido (lo blanco
  se vuelve transparente); en oscuro se ve como láser.
- `npm ci` avisa 6 vulnerabilidades "high" en dependencias; no se tocaron.
- Warning de lint existente: `Hoy.jsx` exporta el hook `useHoy` junto a componentes (`only-export-components`).

---

## 5. Notas técnicas útiles

- Estilos por página con selectores `html .xx-root ...` para ganarles a `frentes.css` y `tema-*.css` sin
  `!important` (`.cr-root` Material, `.tl-root` Tools, `.in-root` Inicio).
- Modo oscuro: `<html data-modo="azul">` (lo cambia el botón de modo de la barra lateral o el menú del avatar en
  celular).
- Eventos de ventana usados entre componentes: `atv:menu` (abrir el cajón en celular), `atv:carpeta` (abrir una
  carpeta del equipo), `atv:ficha` (abrir la ficha de un cliente), `atv:progreso` (refrescar el avance de los
  módulos en la barra), `atv:migas` (niveles extra de las migas).
- Ojo al editar con scripts de `node -e` dentro de bash: los template literals (`` `...${x}` ``) se los come el
  shell; mejor editar con el editor.
- Verificación hecha en cada cambio: `npx oxlint` sobre los archivos tocados y `npx vite build` (pasan).
- La vista previa del navegador de Claude, si el panel está oculto, corre a ~1 cuadro por segundo: las
  animaciones (como la entrada del haz) tardan mucho ahí; no es un bug de la app.
