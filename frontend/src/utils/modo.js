// Modo de color del classroom: "claro" (el de siempre) o "azul" (azul pizarra). Lo elige cada persona en
// el menú de su avatar y queda guardado en ese dispositivo. index.html lo aplica antes de pintar.
const CLAVE = 'atv_modo'
const COLOR_BARRA = { claro: '#f3f0e9', azul: '#202b41' }

export function modoActual() {
  try {
    return localStorage.getItem(CLAVE) === 'azul' ? 'azul' : 'claro'
  } catch {
    return 'claro'
  }
}

export function aplicarModo(modo) {
  const html = document.documentElement
  if (modo === 'azul') html.dataset.modo = 'azul'
  else delete html.dataset.modo
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', COLOR_BARRA[modo] || COLOR_BARRA.claro)
}

export function elegirModo(modo) {
  try {
    localStorage.setItem(CLAVE, modo)
  } catch {
    /* sin almacenamiento: dura lo que la pestaña */
  }
  aplicarModo(modo)
  window.dispatchEvent(new CustomEvent('atv-modo', { detail: modo }))
}
