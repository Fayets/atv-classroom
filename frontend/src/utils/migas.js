// Migas del encabezado (components/AppHeader.jsx): "ATV › Sección › …". La sección y lo que se lee de la URL los
// arma el encabezado; lo que solo sabe la página (el nombre del chat abierto, la clase que estás viendo) lo
// informa la página con ponerMigas(), y la misma página las borra al irse (ponerMigas([]) en la limpieza del efecto).

let extras = []
const EVENTO = 'atv:migas'

/** Los niveles extra que informó la página: [{ label, to? }] (el último va sin link). */
export function migasExtra() {
  return extras
}

export function ponerMigas(lista) {
  extras = (lista || []).filter((m) => m && m.label)
  window.dispatchEvent(new Event(EVENTO))
}

export function escucharMigas(fn) {
  window.addEventListener(EVENTO, fn)
  return () => window.removeEventListener(EVENTO, fn)
}
