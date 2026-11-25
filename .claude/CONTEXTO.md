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

Para cambiar de usuario: avatar → Cerrar sesión.

### Cosas a saber del mock

- Los datos viven en memoria: **al recargar la página vuelven los "sin leer"** y todo lo que se cambió.
- Admin (Permisos, Tools, Contenido), Cerebro y Equipo muestran "Sin datos de prueba para esta ruta":
  esas rutas no están simuladas.
- La **guía con IA** del Inicio no está simulada: al preguntarle algo muestra "Sin datos de prueba para esta ruta".
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

---

## 3. Preferencias y forma de trabajar del dueño del proyecto

- Habla en español rioplatense; los textos de la app van en voseo ("Scrolleá", "Contá", "Tocá").
- Quiere diseño **llamativo e innovador, que no parezca hecho con IA**; le gusta tomar referencias de sitios y
  sistemas **brasileños** y usar el lenguaje de **Material** como base.
- Cuida mucho el **UX/UI básico**: aire arriba del contenido, nada "tirado a un costado", tamaños proporcionados
  en monitores grandes (prueba en 1920×993), que nada salte de lugar al interactuar.
- Pide los cambios en **PC, tablet y celular**, y en **modo claro y oscuro**.
- Revisa con capturas marcadas; cuando dice que algo "está bien" no hay que moverlo.
- Hacer commit/push solo cuando lo pide.

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
  carpeta del equipo), `atv:ficha` (abrir la ficha de un cliente).
- Verificación hecha en cada cambio: `npx oxlint` sobre los archivos tocados y `npx vite build` (pasan).
- La vista previa del navegador de Claude, si el panel está oculto, corre a ~1 cuadro por segundo: las
  animaciones (como la entrada del haz) tardan mucho ahí; no es un bug de la app.
