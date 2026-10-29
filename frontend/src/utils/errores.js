import { getStoredToken } from '../api/client'

// Lo que falla en el navegador va al servidor (errores_front): ruta, pantalla anterior, versión y el error.
// Sin esto una pantalla en blanco no deja rastro (Trabado recarga sola y nadie ve qué pasó).
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev'
let anterior = null
let enviados = 0

export function marcarRuta(ruta) {
  anterior = ruta
}

export function reportarError(tipo, error, extra = {}) {
  if (VERSION === 'dev' || enviados >= 15) return // en local no; y nunca un bucle de avisos
  enviados += 1
  const token = getStoredToken()
  const cuerpo = {
    tipo,
    mensaje: String(error?.message || error || '').slice(0, 1000),
    pila: [error?.stack, extra.componentes].filter(Boolean).join('\n---\n').slice(0, 6000) || null,
    ruta: window.location.pathname + window.location.search,
    desde: anterior,
    version: VERSION,
  }
  try {
    fetch('/api/errores-front', {
      method: 'POST',
      keepalive: true, // llega aunque la página se esté recargando
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(cuerpo),
    }).catch(() => {})
  } catch {
    // nada: reportar nunca rompe la app
  }
}

export function escucharErrores() {
  window.addEventListener('error', (e) => {
    // Un recurso que no cargó (script, css) también deja la pantalla en blanco.
    const recurso = e.target && e.target !== window && (e.target.src || e.target.href)
    reportarError(recurso ? 'recurso' : 'error', recurso ? `No cargó ${recurso}` : e.error || e.message)
  }, true)
  window.addEventListener('unhandledrejection', (e) => reportarError('promesa', e.reason))
}
