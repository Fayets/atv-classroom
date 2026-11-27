# ATV Leverage · Frontend

Solo la interfaz de la app (HTML, CSS y JavaScript sin frameworks). No trae el servidor, ni el método, ni datos, ni claves.

## Qué hay
- `ui/index.html`: la página. Carga las tipografías (General Sans y Satoshi, de Fontshare), `app.css` y los scripts de `ui/app/` en orden.
- `ui/app.css`: todos los estilos. Los colores y medidas base están como variables al principio.
- `ui/app/`: una pantalla o parte por archivo, en el orden en que se cargan:
  - `00-base.js`: lo común (íconos, textos, llamadas).
  - `01-paneles-y-tablero.js`: Tablero.
  - `02-chats-juan-roadmap.js`: chats con el equipo, Juan IA y Roadmap.
  - `03-bandeja.js`: Bandeja.
  - `04-onboarding-carpeta-equipo.js`: primeros pasos, carpetas y Equipo.
  - `05-ajustes.js`: Ajustes y Conexiones.
  - `06-biblioteca-y-actividad.js`: Biblioteca y actividad.
  - `07-automatizaciones.js`: automatizaciones de Instagram.
  - `08-dms-y-contactos.js`: Ventas (DMs de Instagram y contactos).
  - `08-z-contenido.js`: Contenido.
  - `09-classroom.js`, `10-navegador.js`: Classroom y navegador interno.
  - `11-pintar.js`, `12-estado-y-envio.js`, `12-voz.js`, `13-acciones-y-avisos.js`, `14-arranque.js`: cómo se dibuja, notas de voz, avisos y arranque.
- `ui/apps/`: logos de las apps que se conectan. `ui/vendor/`: librerías de terceros.

## Importante
- La interfaz pide los datos a un servidor local (`/state` y otras rutas). Abriendo `index.html` solo se ve vacía: los cambios de diseño se trabajan sobre estos archivos y ATV los prueba con la app real.
- Tipografía y colores de marca: seguir el sistema de ATV.
- Devolvé los archivos tocados con la misma estructura de carpetas.
