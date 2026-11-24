// Modo de color del classroom: "claro", "oscuro" o "auto" (oscuro de 20 a 7 h, hora local). Lo elige cada
// persona en el menú de su avatar y queda guardado en ese dispositivo. index.html lo aplica antes de pintar.
// El oscuro se marca con <html data-modo="azul">: el nombre quedó del modo azul anterior, por compatibilidad
// (las preferencias guardadas como "azul" siguen valiendo y pasan a ser "oscuro").
const CLAVE = 'atv_modo'
const COLOR_BARRA = { claro: '#f6f6f8', oscuro: '#201f1e' }
const MODOS = ['claro', 'oscuro', 'auto']

export function modoActual() {
  try {
    const guardado = localStorage.getItem(CLAVE)
    if (guardado === 'azul') return 'oscuro'
    return MODOS.includes(guardado) ? guardado : 'claro'
  } catch {
    return 'claro'
  }
}

/** En "auto", el modo que corresponde a esta hora. */
export function modoEfectivo(modo = modoActual()) {
  if (modo !== 'auto') return modo
  const hora = new Date().getHours()
  return hora >= 20 || hora < 7 ? 'oscuro' : 'claro'
}

export function aplicarModo(modo) {
  const efectivo = modoEfectivo(modo)
  const html = document.documentElement
  if (efectivo === 'oscuro') html.dataset.modo = 'azul'
  else delete html.dataset.modo
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', COLOR_BARRA[efectivo])
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

// En "auto" se revisa cada minuto, así el cambio de las 20 h o las 7 h llega sin recargar.
setInterval(() => {
  if (modoActual() === 'auto') aplicarModo('auto')
}, 60_000)
