# CONTEXTO.md — Traspaso del proyecto ATV (Classroom + Leverage)

> Documento de traspaso consolidado. Escrito el **2026-11-27** para seguir el trabajo desde otra cuenta de Claude
> sin perder contexto. Reemplaza como punto de entrada a los dos CONTEXTO anteriores, que **siguen en su lugar**
> (`ATV-CLASSROOM/.claude/CONTEXTO.md` y `ATV-LEVERAGE/CONTEXTO.md`) y están copiados literalmente en
> `CONTEXTO.backup.md` (esta misma carpeta). Si algo de acá choca con esos archivos, manda el código; si algo no se
> pudo verificar, está marcado con **⚠ sin verificar**.
>
> Este documento no contiene contraseñas, tokens ni claves: solo nombres de variables de entorno.

---

## A. Contexto general

- **Cliente / marca**: ATV ("Aumenta tu valor"), un programa de mentoría para dueños de negocios digitales. Wordmark
  `ΛUMENTA® TU >ALOR`, isotipo propio, rojo ATV.
- **Quién pide el trabajo**: el dueño del proyecto (habla rioplatense, revisa con capturas marcadas). Arriba de él hay
  un "superior" y el cliente final (ATV), que dan feedback. Laureano Sierra es el nombre del admin en los datos de prueba
  y aparece como alguien que pide cambios.
- **Qué se hace**: **rediseño visual** de dos productos con la misma identidad:
  1. **ATV Classroom**: la plataforma web de los miembros (material, roadmap, tools, mensajes) y del equipo (consultas,
     carpetas, admin). Tenemos el repo completo (frontend + backend), pero **solo trabajamos el frontend**.
  2. **ATV Leverage**: app de escritorio (Electron) donde el dueño de un negocio maneja un **equipo de agentes de IA**.
     **Solo tenemos la interfaz** (`ui/`); el servidor, el método y los datos no están.
- **Brief de diseño** (constante): innovador, **"que no parezca hecho con IA"**, referencias **brasileñas** (Stone,
  Nubank, Cora, RD Station, Rocketseat, Hotmart, Pipefy), simple y útil antes que cargado.
- **Estado al cierre**: el Classroom está entregado y pusheado (rama `prueba-v1`, commit `b6e7fc6`), y quedó **quieto**.
  Leverage está **rediseñado completo en el mock** (commit local `1402881`), **sin entregar todavía** y **sin probar en
  la app real**.

---

## B. Arquitectura

### Carpeta raíz: `D:\Landings - Copy\ATV\`

| Ruta | Qué es |
|---|---|
| `ATV-CLASSROOM/` | Repo git `https://github.com/Fayets/atv-classroom`, rama `prueba-v1` |
| `ATV-LEVERAGE/` | Interfaz de Leverage + nuestro mock. Git **solo local** (no es de ATV) |
| `ui-original-leverage-backup/` | Copia de la `ui/` original de Leverage, antes de tocar nada |
| `.claude/launch.json` | Previews `leverage-mock` (5180) y `classroom-mock` (5173) para Claude Code |
| `resumen.md` | Resumen general de mensajes y trabajo (escrito antes de este documento) |
| `CONTEXTO.md` | Este documento |
| `CONTEXTO.backup.md` | Copia literal de los dos CONTEXTO anteriores |

### B.1 ATV Classroom

- **Frontend**: `ATV-CLASSROOM/frontend/`, React 19 + Vite 8 + react-router-dom 7. **Sin TypeScript, sin Tailwind,
  sin shadcn.** Dependencias destacadas: `motion`, `@hugeicons/react`, `marked`, `pdfmake`, `roughjs`, `jszip`.
  Lint con `oxlint`.
  - Scripts (`frontend/package.json`): `dev`, `dev:mock` (`node scripts/dev-mock.mjs`), `build`, `lint`, `preview`.
  - Mock: `frontend/src/api/mock/` (`handler.js`, `classroom.js`, `extras.js`…), activado con `VITE_MOCK_API`.
  - Estilos: `frontend/src/index.css` + `frontend/src/styles/*.css` (por pantalla: `classroom-rediseno.css`,
    `tools.css`, `inicio.css`, `sidebar.css`, `marca.css`, `login.css`, `archivo.css`, `carpetas.css`, `mensajes.css`,
    `permisos.css`, `finder.css`…).
  - Componentes clave: `components/Sidebar.jsx`, `components/AppHeader.jsx`, `components/BuscadorBarra.jsx`,
    `components/mac/HerramientasEquipo.jsx` (+ carpetas `*Carpeta.jsx`, `Finder.jsx`, `BibliotecaApp.jsx`,
    `NuevaClase.jsx`), `components/clase/ArchivoModulos.jsx`, `BarraModulo.jsx`, `MesaClase.jsx`,
    `components/inicio/Hoy.jsx`, `HazGuia.jsx`, `components/efectos/LaserFlow.jsx`, `Lightfall.jsx`,
    `components/cuenta/Credencial.jsx`, `components/CierreMes.jsx`.
  - Páginas: `pages/LoginPage.jsx`, `InicioPage.jsx`, `ProgramasGridPage.jsx`, `ProgramaDetailPage.jsx`,
    `ToolsPage.jsx`, `MensajesPage.jsx`, `LeveragePage.jsx`…
  - Utils: `utils/canales.js` (`nombreVisible`), `utils/migas.js`, `utils/contador.js`, `utils/alertasApp.js`,
    `utils/modo.js` (`elegirModo`).
- **Backend**: `ATV-CLASSROOM/backend/` (Python: `main.py`, `requirements.txt`, `seed.py`, `src/`, `tests/`).
  **No se toca.** Variables de entorno (nombres, de `backend/.env.template`):
  `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SCHEMA`, `CORS_ORIGINS`, `TOKEN_SECRET`, `TOP_K`,
  `TOP_K_CONSULTORIA`, `TRUNCADO_CONSULTORIA`, `CHAT_HISTORIAL_MAX`, `CHAT_SESION_HORAS`, `ANTHROPIC_API_KEY`,
  `ONBOARDING_API_URL`, `ONBOARDING_ADMIN_KEY`, `FATHOM_SYNC`, `FATHOM_CADA_MIN`, `CLAVE_CIFRADO`, `AVISOS_MAIL`,
  `AVISO_DESPUES_MIN`, `AVISO_HORAS_ENTRE`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`,
  `AGENTES_KEYS`, `GOOGLE_DOCS_URL`. Frontend: `VITE_MOCK_API`.
- Otros: `ATV-CLASSROOM/docs/agentes-api.md` (incluye "Claves personales de ATV Leverage"), `deploy/`
  (mantenimiento nginx).
- El "cerebro" (repo `cerebro-productos-digitales`) es otro repo y **no se toca nunca** desde este trabajo.

### B.2 ATV Leverage

- `ATV-LEVERAGE/ui/`: HTML + CSS + JS **sin frameworks** (ver `ATV-LEVERAGE/LEEME.md`).
  - `ui/index.html` carga `app.css`, después **`atv.css`** (nuestro) y `/ui/app.js`.
  - `/ui/app.js` **no existe como archivo**: el servidor (real o mock) concatena `ui/app/*.js` en **orden alfabético**.
    Todos comparten ámbito global: `state`, `view`, `extra`, `api()`, `go()`, `renderBody()`, `renderSide()`, `setHtml()`.
  - Archivos: `00-base.js`, `01-paneles-y-tablero.js`, `02-chats-juan-roadmap.js`, `03-bandeja.js`,
    `04-onboarding-carpeta-equipo.js`, `05-ajustes.js`, `06-biblioteca-y-actividad.js`, `07-automatizaciones.js`,
    `08-dms-y-contactos.js`, `08-z-contenido.js`, `09-classroom.js`, `10-navegador.js` (`VIEWS`), `11-pintar.js`
    (`renderShell`, `renderHead`, `renderBody`), `12-estado-y-envio.js`, `12-voz.js`, `13-acciones-y-avisos.js`,
    `14-arranque.js`.
  - `renderBody` **repinta todo con `innerHTML`** (guarda scroll y foco). Polling: `/state` cada 2,5 s, mensajes cada
    2 s, extras cada 20 s → **no usar animaciones de entrada** por CSS.
  - Tema: `localStorage.tema` (`light` / `dark` / `system`) → `html[data-theme]`. Electron: `IN_APP`; en Mac la clase
    `.desktop` (la barra deja 40 px arriba para los botones de ventana).
- `ATV-LEVERAGE/mock/` (**nuestro, no se entrega**): `server.mjs` (puerto 5180; sirve `ui/`, arma `app.js`, reemplaza
  `__TOKEN__`, avatares `/avatar/:id.svg`, miniaturas `/media/historias/*`, `/file`, `/embudos`, rutas GET/POST),
  `datos.mjs` (Franco Ruiz · Escala Digital, 12 agentes, pedidos, KPIs, #ceo, comms, rutinas, tickets, uso, Instagram,
  2 clientes, `juanChats`), `ventas.mjs` (rutas `/ig/*`, `/contenido`, `/ig/vista`), `biblioteca.mjs` (`/library`,
  `/swipes`, `state.roadmap`), `classroom.mjs` (consultas, clientes, chat, armar/tomar/soltar/mandar/descartar, piloto
  con la constante `PILOTO`). `package.json` → `dev:mock`. Variable que lee el mock: `PORT`.
  **Los datos viven en memoria: si se cambia el mock, hay que reiniciar el server.**
- **No tenemos**: el servidor real de Leverage, Electron, el método, los datos ni claves.

### B.3 Cómo levantar

```powershell
cd "D:\Landings - Copy\ATV\ATV-CLASSROOM\frontend"; npm ci; npm run dev:mock
```
→ `http://localhost:5173`. Usuarios mock (cualquier contraseña; el rol sale del email, `api/mock/handler.js` `login`):
email con `cliente` → Alan Klein (miembro, plan Boost); con `coach` → Lucho Vicente (coach); otro → Laureano Sierra
(admin). Para probar desde el celular en la misma red: `npm run dev:mock -- --host`.

```powershell
cd "D:\Landings - Copy\ATV\ATV-LEVERAGE"; npm run dev:mock
```
→ `http://localhost:5180`. Desde Claude Code: preview `leverage-mock` / `classroom-mock` (`ATV/.claude/launch.json`).

---

## C. Identidad visual

### C.1 Aprobado (vigente en los dos productos)

- **Tipografía**: Helvetica Now Display (toda la app). En Classroom además **Hoosegow JNL** (números) y **Biro Script
  Plus** (firma del coach, pizarra). En Leverage se copió Helvetica Now (`ui/fonts/…Regular/Medium.otf`, desde
  `ATV-CLASSROOM/frontend/public/fonts`); General Sans/Satoshi del original quedaron como respaldo.
- **Colores**: papel cálido `#f6f4f0` (fondo), hoja `#fffefb`, tinta/carbón `#242321`, hueso `#F3F0E9`, **rojo ATV
  `#c0392b`** (texto rojo `--rojo-texto` `#a32a1e`). Oscuro = carbón. Sombras cálidas, bordes suaves.
  - Tokens Leverage (`ui/atv.css`): `--acento`/`--acento-rgb` (tinta en claro, hueso en oscuro), `--rojo`,
    `--rojo-texto`, `--bg`, `--sheet`, `--suave`, `--borde`, `--sombra`.
  - Classroom: modo oscuro con `<html data-modo="azul">`; estilos por página con `html .xx-root …`.
- **Patrones recurrentes** (usarlos, no inventar otros):
  - **Cápsula** de pestañas (pastilla con fondo suave y la elegida en tinta).
  - **Activo en tinta** + **filo rojo** (la píldora de la barra lateral que se desliza, con línea roja interna y luz).
  - **Rótulos en mono** mayúsculas con tracking (y una rayita roja delante en las cabeceras).
  - **Bandejas con pestaña de carpeta** para agrupar (barra lateral, estantes).
  - **Carpetas de cartón / kraft** con hojas que asoman (módulos del Classroom, Historias/Reels de Leverage).
  - **Hoja de cuaderno de Juan** (margen rojo + renglones + firma en pastilla roja).
  - **Marcador** de cifras (tira de 4 / 2×2), con la cifra que importa en rojo.
  - Credencial (lámina carbón lisa).
- Textos en **voseo** ("Tocá", "Scrolleá", "Contá").

### C.2 Descartado y por qué

| Descartado | Por qué / reemplazo |
|---|---|
| Azul `#1351C2` de Leverage original | No es de la marca ATV → tinta (`--acento`) |
| Rojos `#FF2518` / `#F65046` | Se unificó al rojo del Classroom `#c0392b` |
| Escritorio "macOS" del equipo (Dock, ventanas) en Classroom | Pedido del superior: sidebar → barra lateral para todos (2.7). `Escritorio.jsx` / `EscritorioContext.jsx` quedaron sin usar |
| Menú del equipo en dos grupos arriba | Reemplazado por la barra lateral |
| Barra de abajo y avatar en el celular (Classroom) | Reemplazado por menú hamburguesa → cajón; después el perfil volvió arriba a la derecha (2.9) |
| Pie de la barra lateral (cuenta, modo, salir) | Se movió al avatar de arriba + íconos ☀/🌙 (2.9) |
| Login con 22 fotos del brandbook | El cliente dijo que "no tenían que ver con el classroom" → Lightfall a pantalla completa (2.10) |
| Índice editorial de módulos (`IndiceModulos`) | "No generaba curiosidad" → carpetas de archivo (`ArchivoModulos.jsx`) |
| Credencial holográfica / pase perforado en Mi cuenta | Reemplazada por carbón liso; después se sacaron talón, sello, pie y tachito |
| Efecto TechText, "Modo Miembro" del admin | Se sacaron |
| Fecha y anillo "87 días" en el Inicio | Se sacaron; `AnilloPrograma` quedó guardado |
| Rayita roja por fuera de la píldora activa | Reemplazada por la línea roja interna con luz |
| Textura de papel a 0.09 | Bajada a 0.025 |
| Organigrama viejo de Leverage (`fitOrg`, `#org-talks`) | Reemplazado por la "constelación" |
| Barra de arriba / menú del engranaje de Leverage | Reemplazados por la barra lateral |
| Globos de chat comunes en Juan IA | Reemplazados por el "cuaderno" |

---

## D. Secciones y estado

Leyenda: ✅ rediseñado y verificado en el mock · 🟡 parcial / revisar · ⬜ sin rediseñar.
"Verificado" = PC 1440 (o 1920×993), tablet, celular, claro y oscuro, sin errores de consola, en **modo mock**.

### D.1 Classroom (detalle completo en `CONTEXTO.backup.md`, sección [1], 2.1–2.10)

| Sección | Estado | Archivos / notas |
|---|---|---|
| Login | ✅ | `LoginPage.jsx`, `login.css`, `efectos/Lightfall.jsx`; botón claro/oscuro `.lg-modo` |
| Barra lateral (miembro/coach/admin) | ✅ admin · 🟡 coach y cliente con bandejas no revisados en pantalla | `Sidebar.jsx`, `sidebar.css`; PC 264 px, tablet riel 76 px, celular cajón (`atv:menu`) |
| Encabezado: migas + perfil + modo | ✅ | `AppHeader.jsx` (`armarMigas`, `Migas`, `ModoIconos`), `utils/migas.js` |
| Buscador de la barra | ✅ | `BuscadorBarra.jsx` |
| Inicio del miembro | ✅ | `InicioPage.jsx`, `Hoy.jsx`, `HazGuia.jsx`, `inicio.css`, `LaserFlow` |
| Material: módulos como carpetas | ✅ | `ArchivoModulos.jsx`, `archivo.css`, `ProgramasGridPage.jsx` |
| Módulo abierto / clase | ✅ | `BarraModulo.jsx` (`.ar-abierta`), `MesaClase.jsx`, `classroom-rediseno.css` |
| Tools | ✅ | `ToolsPage.jsx`, `tools.css`, `DibujosTools.jsx` |
| Roadmap | ✅ (ajustes menores) | punto abierto se pliega |
| SOPs | ✅ | filtros en desplegable en celular/tablet |
| Mensajes / chat | 🟡 | canales sin emoji, "sin leer" arreglado, "En vivo", contador; **ajustes "lo del Discord" pedidos y no hechos** |
| Notificaciones | ✅ | campanita en Mensajes, `utils/alertasApp.js` |
| Cierre de mes | ✅ | `CierreMes.jsx` |
| Mi cuenta | ✅ | `Credencial.jsx` |
| Carpetas del equipo (admin) | ✅ | `components/mac/*`, arrastre desde el borde, abren centradas; en el mock abren vacías |
| Admin (Permisos, Tools, Contenido), Cerebro, Equipo | 🟡 | adaptadas a celular (2.2); el mock cubre parte desde 2.8. ⚠ sin verificar rediseño propio |

### D.2 Leverage (detalle en `CONTEXTO.backup.md`, sección [2], "Bitácora")

| Vista (`view.type`) | Estado | Archivo JS tocado | Notas |
|---|---|---|---|
| Base + barra lateral | ✅ | 01 (`renderSide`), `index.html` | Bandejas: Tu equipo, Ventas, Herramientas, Gestión; riel (`localStorage.sbRiel`); celular ≤760 cajón. **Desde el 28/11 solo navega** |
| Arriba a la derecha (migas, piloto, modo, perfil) | ✅ | 01 (`renderArriba`, `perfilHtml`, `migasHtml`), `index.html` (`#lv-top`) | 28/11. Menú: Mi cuenta, Configuración, Tu navegador, sesión de Claude. ⚠ `POST /claude/salir` no existe en el server real |
| `tablero` | ✅ | 01 (`tableroHtml`, `.tb2-*`) | 28/11: estado sin aros, caja "Asistente, …" con selector de agente (va a la Bandeja), métricas propuestas aparte, cápsula Hoy · Programados · Historial |
| `historial` (Programados / Historial) | ✅ | 01 (`programadosHtml`, `historialListaHtml`) | 28/11: pestañas aparte; Programados pausa/reanuda rutinas; Historial con Hoy, Ayer, 7 y 30 días y Todo |
| `bandeja` + `agent` (chat) + `ceo` | ✅ | 01 (`renderPanel`), 03, 12-estado | 28/11: sin panel fijo; Archivos / Actividad / Ficha en un panel al costado sin cerrar el chat; ficha editable ahí |
| `equipo` | ✅ | 04 (`equipoHtml`, `.eq2`) | 28/11: organigrama por áreas (sin constelación), credencial del mismo alto, "Lo último que se dijeron" abajo; filtros por estado |
| `dms` (Ventas: Bandeja/Reporte/Contactos/Automatizaciones) | ✅ | 08 (`ventasModos`, `.vt-cab`) | el celular de vista previa queda azul Instagram a propósito |
| `auto` (lista de automatizaciones) | ✅ | solo CSS | |
| Editor de flujos de automatización (`.aeditor`) | ⬜ | — | sin estilos en `atv.css` (verificado) |
| `contenido` | ✅ | 08-z (`contenidoHtml`) | |
| `biblioteca` | ✅ | solo CSS | Historias/Reels como carpetas de cartón |
| Swipes (`swipesHtml` en 06) | ⬜ | — | sin estilos en `atv.css` (verificado) |
| `roadmap` | ✅ | 02 (`roadmapHtml` = lista, `proyectoHtml` = un proyecto) | 28/11: **varios proyectos** (pantalla "Tus proyectos" + terminados + nuevo proyecto); dentro, riel de hitos + hito entero; cierre cuando se aprueba el último hito. ⚠ El server real tiene un solo `roadmap` |
| `carpeta` (Embudos/Negocio) | ✅ | solo CSS | |
| Visor de archivos (`.filepanel`) | ✅ | solo CSS | |
| Ficha del agente (modal `.ocard`) | ✅ | solo CSS | |
| `tickets`, `rutinas`, `uso`, `decisiones`, `actividad` | ✅ | 11 (`data-vista`) | |
| `ajustes` (8 secciones) | ✅ | solo CSS | Conexiones: ⚠ datos del mock limitados |
| `juan` (Juan IA) | ✅ | 02 (`preguntasDeJuan`, `.jpregs`) | "Juan habla primero" + charla como cuaderno |
| `classroom` (escritorio del equipo) | ✅ | 09 (`.cls-cab`) | Consultas / Responder / Piloto |
| `onboarding` (primeros pasos) | ⬜ | — | `atv.css` solo oculta la barra lateral ahí (líneas 65–66); la pantalla sigue con el diseño viejo |
| Navegador lateral (`#dock`, Electron) | ⚠ sin verificar | — | solo existe en la app real |

---

## E. Trabajo realizado

### E.1 Implementado (en código)

- **Classroom** — todo commiteado y pusheado en `prueba-v1`. Últimos commits:
  `b6e7fc6` login Lightfall + modo oscuro, módulos como carpetas, carpetas del equipo centradas y arrastrables, Mi cuenta
  más limpia · `2fc67b4` carpetas del equipo rediseñadas y en mobile · `cee4212` feedback del superior (perfil arriba,
  buscador, migas, avance de clases) · `62c43cb` progreso en vivo, cajón mobile · `bbc34da` branding 2026.
  Lista detallada por tanda: `CONTEXTO.backup.md` [1] §2.1–2.10.
- **Leverage** — git local, árbol limpio:
  `c718430` estado original + mock → `39d3c4b` base y barra lateral → `159950c` Tablero → `4afed3d` nota →
  `19506e7` Bandeja y chat → `41b8fed` Equipo → `5e60f74` Ventas y Contenido → `1584f42` Biblioteca y Roadmap →
  `8bd1c5a` Gestión y Configuración → `b2ce3e2` Juan IA y Classroom → `1402881` Repaso general →
  `fbf673a` **Tu equipo, segunda vuelta** (28/11; detalle en `ATV-LEVERAGE/CONTEXTO.md`, bitácora).
  - **Archivos de entrega** (`git diff --name-only c718430 -- ui`, verificado el 28/11): `ui/atv.css` (nuevo),
    `ui/fonts/HelveticaNowDisplay-Medium.otf` y `-Regular.otf` (nuevos), `ui/index.html`, `ui/app.css`,
    `ui/app/01-paneles-y-tablero.js`, `02-chats-juan-roadmap.js`, `03-bandeja.js`, `04-onboarding-carpeta-equipo.js`,
    `08-dms-y-contactos.js`, **`08-y-oportunidades.js` (nuevo)**, `08-z-contenido.js`, `09-classroom.js`, `11-pintar.js`, `12-estado-y-envio.js`, `12-voz.js`.
  - **Datos que la interfaz lee y el server real puede no mandar** (⚠ sin verificar; si faltan, la pantalla se arma igual):
    `requests[].decididoAt`, `requests[].porPiloto`, `requests[].tareaRoadmap`, `state.corridas` (rutinas que corrieron),
    `roadmap.meta` y en cada paso `inicio`, `resultado`, `notas`. Ruta nueva: `POST /claude/salir`.
  - **Mock de "Tu equipo"** (`mock/equipo.mjs`, no se entrega): simula al equipo y guarda en `mock/.guardado.json`
    (borrarlo o `POST /mock/reiniciar` para volver a cero).
  - Cambios de `app.css`: colores a variables (`#1351C2` → `var(--acento)`, `rgba(19,81,194,x)` →
    `rgba(var(--acento-rgb),x)`, `#FF2518`/`#F65046` → `var(--rojo)`, `#B40210` → `var(--rojo-texto)`).
  - `index.html`: link a `atv.css`, `<aside class="side sb" id="side">`, `<header class="sb-movil" id="sb-movil">`,
    `<div class="sb-fondo" id="sb-fondo">`.
- `resumen.md`, `CONTEXTO.backup.md` y este `CONTEXTO.md` en la raíz.

### E.2 Solo conversado / no implementado

- Estrategia para trabajar con datos reales sin tocar el cerebro: **prototipo con mock + contrato de datos por
  pantalla**, una **clave de staging de solo lectura**, y una "**cáscara**" de Juan IA (UI que se conecta después).
  Nada de esto existe en código.
- Versión en lista del Roadmap para el celular (se evaluó; hoy se arrastra).
- Sumar Tools/Roadmap al menú del equipo del Classroom.
- Reubicar el anillo "87 días" (Cuenta o Roadmap).

---

## F. Pendientes (con prioridad)

| Prio | Pendiente | Depende de | Archivos |
|---|---|---|---|
| 1 | **Armar el paquete de entrega de Leverage** (copiar los archivos de E.1 con la misma estructura de carpetas, sin `mock/`, `package.json`, `CONTEXTO.md`, `.claude/`, `.gitignore`) | OK del usuario | lista de `git diff --name-only c718430 -- ui` |
| 1 | **Probar Leverage en la app real** (Electron + servidor local): botones de ventana en Mac (`.desktop`), navegador del costado (`#dock`), datos reales | ATV (no tenemos la app) | — ⚠ sin verificar |
| 1 | Confirmar con ATV la ruta para **cerrar la sesión de Claude** (hoy `POST /claude/salir`, inventada) y si el server manda `decididoAt`, `porPiloto`, `tareaRoadmap` y `corridas` | ATV | `ui/app/01-paneles-y-tablero.js` |
| 1 | **Roadmap con varios proyectos**: el server real tiene que mandar `state.roadmaps` (con `id` por proyecto), aceptar `roadmap: <id>` en las acciones `/roadmap/*` y sumar `POST /roadmap/nuevo` | ATV | `ui/app/02-chats-juan-roadmap.js` |
| 2 | Rediseñar **onboarding / primeros pasos** de Leverage | — | `ui/app/04-onboarding-carpeta-equipo.js`, `ui/atv.css` |
| 2 | Rediseñar **editor de flujos de automatización** (`.aeditor`) | — | `ui/app/07-automatizaciones.js`, `ui/atv.css` |
| 2 | Rediseñar **Swipes** | — | `ui/app/06-biblioteca-y-actividad.js`, `ui/atv.css` |
| 2 | Esperar y aplicar **feedback** de ATV / superior sobre Leverage | entrega | — |
| 2 | Classroom: **ajustes del chat "lo del Discord"** (pedido del superior, sin detalle escrito) | detalle del pedido ⚠ | `MensajesPage.jsx`, `Conversacion.jsx`, `styles/mensajes.css` |
| 3 | Classroom: revisar en pantalla la barra lateral del **coach** y del **cliente** con bandejas | — | `Sidebar.jsx`, `sidebar.css` |
| 3 | Classroom: decidir si se borran `Escritorio.jsx` / `EscritorioContext.jsx` (todavía los leen `App.jsx`, `AppHeader.jsx`, `MensajesPage.jsx` vía `useEscritorio()`, que da `null` — verificado) | decisión | `components/mac/Escritorio.jsx`, `context/EscritorioContext.jsx` |
| 3 | Classroom: Tools/Roadmap en el menú del equipo (grupo "General") | decisión | `Sidebar.jsx` |
| 3 | Classroom: reubicar `AnilloPrograma` ("87 días") — sigue en `Hoy.jsx` (verificado) | decisión | `components/inicio/Hoy.jsx`, `inicio.css` (`.in-anillo`) |
| 3 | Leverage: limpiar el código muerto del roadmap viejo (arrastre y zoom de `#rmap`, `rmAltos`) y del pie de la barra (`.sb-pie` en `atv.css`) | — | `02-chats-juan-roadmap.js`, `11-pintar.js`, `atv.css` |
| 4 | Classroom: 6 vulnerabilidades "high" de `npm ci`; warning lint `only-export-components` en `Hoy.jsx` (`useHoy`, línea 38 — verificado) | — | `frontend/package.json`, `Hoy.jsx` |
| 4 | Ideas menores: alinear título del Inicio con el campo (una línea en `inicio.css`); comportamiento del título al buscar en celular (`setArriba`, `--in-arriba`) | decisión | `InicioPage.jsx`, `inicio.css` |
| — | Estrategia de datos reales (mock + contrato, clave de staging, cáscara de Juan IA) | ATV | — |

---

## G.0 TRABAJO EN CURSO (pedido del 28/11 · "5. Ventas / 5.2 Contenido / 6. Funcionalidad integral")

> Se actualiza después de **cada** cambio (la cuenta se queda sin cupo). Si retomás, seguí desde el primer ⬜.
> El pedido completo (texto del usuario) está resumido acá; las reglas de siempre (H, I) siguen valiendo.

- **5.1 Ventas** (vista `dms`, `ui/app/08-dms-y-contactos.js`, mock `mock/ventas.mjs`): convertirla en un "centro de
  operaciones comerciales" que no parezca la Bandeja: (1) resumen con oportunidades activas, pendientes de seguimiento,
  llamadas agendadas, asistencias, ventas y conversión, que filtran al tocarlos; (2) oportunidades como **pipeline por
  etapa** (y vista de lista compacta) con nombre/foto, canal, estado, última interacción, próxima acción, estado de llamada
  y aviso de atención; (3) **detalle** al elegir una: "Abrir en Instagram", "Revisar este seteo", estados de llamada
  (Agendó / Asistió / No asistió / Sin llamada…), historial, la charla como algo secundario, cambiar estado. Filtros
  (Todos, Calificados, Sin leer, Solicitudes…) dentro de **un botón de filtros** con indicador de activos y "Limpiar".
  Todo funcional y persistente en el mock; los indicadores y el pipeline se actualizan al cambiar estados.
- **5.2 Contenido** (vista `contenido`, `ui/app/08-z-contenido.js`, mock `/ig/vista`): misma información, mejor jerarquía:
  resumen estratégico → **embudo TOFU (Atracción y descubrimiento) / MOFU (Consideración y confianza) / BOFU (Conversión y
  venta)** interactivo, con explicación corta y desequilibrios → **secuencias** (nombre, objetivo, estado, progreso, pasos,
  próxima acción; se expanden; estados de cada contenido). Todo funcional.
- **6. Global**: toda la app 100 % funcional en el mock (botones, filtros, formularios, modales), con persistencia, estados
  vacíos, confirmaciones y errores; distinguir lo simulado de lo real.

Estado:
- ✅ 5.1 Ventas (28/11) — pestaña **Oportunidades** (antes "Bandeja") en `ui/app/08-y-oportunidades.js` (**archivo nuevo, va en la entrega**) + estilos `.op-*` al final de `atv.css`. Resumen de 6 cifras (5 filtran al tocarlas), pipeline por etapa (Nuevos, Conversando, Propuesta, Llamada, Clientes, Descartados) o lista compacta, detalle con siguiente paso, etapa, llamada (Sin llamada/Agendó/Asistió/No asistió/Cerró), canal, calificación, historial + notas, "Abrir en Instagram", "Revisar este seteo" y la charla plegada (con respuesta por DM). Filtros en un solo botón (Mostrar + Canal) con chips y Limpiar. En `08-dms-y-contactos.js`: el modo bandeja pinta `oportunidadesHtml()` (la vieja `dmsBandejaHtml` quedó sin usar) y `abrirDms` carga contactos. Mock: `mock/comercial.mjs` (st.ventas; rutas /ig/*; `POST /ig/etapa` **no existe en el server real ⚠**). Probado PC y celular, claro, sin errores.
- ✅ 5.2 Contenido (28/11) — en `ui/app/08-z-contenido.js` (al final: `ctnEmbudoEstrategia`, `ctnSecuencias2`, `ctnProximo`) + estilos `.ctn-n`, `.ctn-et2`, `.ctn-sq`, `.ctn-pasos` al final de `atv.css`. Tres niveles: **Resumen** (los números de ventas del contenido, lo que falta leer y "Lo que se ve"), **Tu embudo de contenido** (barra de reparto TOFU/MOFU/BOFU + tres etapas encastradas con nombre claro — Atracción y descubrimiento / Consideración y confianza / Conversión y venta —, explicación, piezas, %, vistas, chats y calificados; tocar una la elige, muestra sus piezas y filtra; avisos de desequilibrio; el cuadro por dolor quedó en "Ver el contenido por dolor y etapa") y **Secuencias** (fila corta con objetivo, estado, progreso publicadas/total y próximo paso; se abre y muestra los pasos en orden con su estado y acciones: Pedírsela al Guionista, Programar, Publicar ahora, Volver a pendiente). Reels y el detalle de cada pieza siguen igual. La vieja `ctnSecuencias` quedó sin usar. Probado en PC, sin errores.
- 🟡 6. Global (28/11) — **hecho**: `mock/general.mjs` (persistente, `VERSION_DATOS` = 5) para Tickets (crear: el responsable lo toma y deja nota; cambiar estado), Configuración (dueño, horario libre, no contactar, agentes simultáneos, objetivo, cupo de gasto, claves, software, Píxel, Importar), Lo aprendido y skills, Biblioteca (material y guías), Automatizaciones (crear, prender/apagar, disparo, editar cajas, borrar, pedir al Setter, números por caja y contactos que entraron — antes el editor se rompía al abrir una), Juan IA (frenar y borrar), descartar pedidos; soporte, teléfono y sync de Instagram simulados. **Recorrido automático**: las 18 vistas, las 16 secciones de Configuración y los 3 modos de Ventas abren sin errores de consola. Probado a mano: crear ticket, guardar empresa, no contactar, horario libre, prender/apagar automatización, contactos de la automatización. **Falta (⬜)**: probar a mano onboarding y carpetas de clientes (`/clientes/*`), Conexiones (Composio, MCP, Instagram), navegador y Chrome de los agentes, teléfono, licencia y Jeremy; marcar acción por acción qué es simulado. **Ya hecho**: el server del mock inyecta en `index.html` un aviso fijo arriba al centro "Demo · datos de prueba · las acciones hacia afuera se simulan" (solo en el mock, no está en `ui/`, no llega a la app real).


## G. Dónde quedamos exactamente

- **Classroom**: `prueba-v1` @ `b6e7fc6`, árbol limpio, al día con `origin` (verificado con `git fetch`). Quieto.
- **Leverage**: git local @ el último commit (`git log -1`; 28/11: "Roadmap con varios proyectos"), árbol limpio. Todas las vistas principales rediseñadas y
  recorridas sin errores de consola ni desborde horizontal en el celular. **No se entregó** y **no se probó en la app real**.
- Pedido en curso (28/11): "5. Ventas / 5.2 Contenido / 6. Funcionalidad integral" — ver **G.0** (Ventas y Contenido ✅; global 🟡 con lo que falta).
- Pedido anterior cumplido (28/11): "Modificaciones del sistema — Tu equipo" (perfil arriba a la derecha, Tablero,
  Programados/Historial, panel del agente en la Bandeja, Equipo, Roadmap y todo funcionando con el mock persistente).
- **Primera acción al retomar**:
  1. Leer este archivo completo (y `CONTEXTO.backup.md` si hace falta el detalle fino).
  2. `cd ATV-LEVERAGE; git status; git log --oneline -3` para confirmar el último commit limpio.
  3. Levantar `npm run dev:mock` en `ATV-LEVERAGE` (5180) y mirar el Tablero.
  4. Preguntarle al usuario si arma el **paquete de entrega** (prio 1) o sigue con onboarding / editor de flujos / Swipes.

---

## H. Decisiones y restricciones

- **El cerebro de la app no se toca**: ni el backend del Classroom (`backend/`), ni el repo `cerebro-productos-digitales`,
  ni el servidor de Leverage (que además no tenemos). En la otra PC Claude intentó subir contexto al cerebro por error:
  no repetirlo.
- **Classroom queda quieto** en `prueba-v1`; el trabajo nuevo es en Leverage salvo pedido explícito.
- **Leverage: solo interfaz.** La entrega es **devolver los archivos tocados de `ui/` con la misma estructura**. ATV los prueba.
- El rediseño de Leverage va **concentrado en `ui/atv.css`** (cargado después de `app.css`); los cambios de JS son mínimos y
  solo de presentación. Para ganar a reglas `html[data-theme="dark"] …` de `app.css`, usar `html .app …` / `html .bw …`.
- Se unificó Leverage con el Classroom **pero conservando su ritmo más denso de "consola"**.
- Sin animaciones de entrada en Leverage (repintado constante); las continuas se atan al reloj (`startTime = 0`).
- Nombres que no deben chocar: la raíz del Equipo es **`.eqm`** (no `.eq`, choca con `.cls-msg.eq`); la sección del
  Tablero es `vivo` (no `tb2-curso`).
- Classroom: estilos por página con `html .xx-root`; sin `!important`; los efectos de React Bits se copian a mano (sin shadcn).
- Commit/push **solo cuando el usuario lo pide**, y antes **actualizar el CONTEXTO**.
- Las skills de diseño (`ATV-CLASSROOM/.claude/skills/`: emilkowalski/skills, taste-skill) están **solo en la PC
  original**, excluidas de git con `.git/info/exclude`. En otra PC/cuenta no van a estar.
- Privacidad: no compartir el email ni datos personales del usuario en servicios externos.

---

## I. Preferencias del usuario

- Español rioplatense; textos de la app en voseo.
- Diseño **llamativo e innovador, que no parezca hecho con IA**; referencias **brasileñas**; "simple y útil, no cargado".
- UX/UI básico impecable: aire arriba, nada tirado a un costado, tamaños proporcionados en monitores grandes
  (prueba en 1920×993), nada que salte al interactuar.
- **Siempre verificar en PC, tablet y celular, en claro y oscuro**, y mostrar prueba (capturas).
- Revisa con capturas marcadas; si dice que algo "está bien", **no se toca**.
- Trabaja "de a poco y muy preciso": varios pedidos por mensaje, cada uno verificado; avanza sección por sección.
- Le gusta que se investigue en internet para innovar (ej. Equipo, Classroom de Leverage).
- Prefiere recomendaciones concretas antes que listas de opciones.

---

## J. Roadmap

1. **Entrega de Leverage** → paquete de `ui/` → ATV prueba en la app real → feedback.
2. **Completar Leverage**: onboarding, editor de flujos, Swipes; ajustes que vengan del feedback (incluido lo que falle en Electron).
3. **Classroom (cuando se retome)**: chat "lo del Discord", revisión de barras de coach/cliente, limpieza de
   `Escritorio*`, menú del equipo, anillo "87 días", dependencias y lint.
4. **Datos reales** (si ATV lo habilita): contrato de datos por pantalla, clave de staging de solo lectura, cáscara de Juan IA.

---

## K. Instrucciones para el próximo Claude

1. **Leé este archivo entero antes de tocar nada.** Para el detalle fino de cada tanda: `CONTEXTO.backup.md`.
2. Trabajá en `D:\Landings - Copy\ATV\ATV-LEVERAGE` salvo que el usuario pida el Classroom.
3. No toques backend, cerebro ni servidor. En Leverage, poné el diseño en `ui/atv.css` y tocá JS solo para presentación.
4. Al terminar cada cambio: recorrer la vista en el mock en 1440, tablet (768) y celular (375), claro y oscuro; revisar
   consola y desborde horizontal; mostrar captura. Si cambiaste `mock/`, reiniciá el server.
5. Leverage: commit local por tanda (estilo de mensaje en español, como los anteriores). Classroom: commit/push solo si el
   usuario lo pide, después de actualizar el CONTEXTO, con `npx oxlint` y `npx vite build` pasando.
6. Mantené este `CONTEXTO.md` al día (estado en D, pendientes en F, dónde quedamos en G).
7. Trampas conocidas:
   - El panel de vista previa de Claude, si está oculto, anima a ~1 cuadro por segundo: la píldora o el haz pueden salir a mitad de camino en las capturas. No es un bug.
   - En Bash, los heredocs con comillas o template literals fallan y `node -e` rompe `\n` en las regex: editá con las herramientas de edición o con un archivo temporal.
   - En el mock del Classroom los datos viven en memoria: al recargar vuelven los "sin leer".
8. No inventes: lo marcado ⚠ no se pudo verificar desde acá (app real de Leverage, backend real, detalle de "lo del Discord").
