// Piezas comunes del mock (handler.js y los archivos de rutas/*.js).
// Cada archivo de rutas exporta `rutas`: una lista de [método, patrón, (coincidencia, opciones, url) => Response],
// igual que RUTAS en handler.js. handler.js las junta todas.

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

export const sinContenido = () => new Response(null, { status: 204 })

/** El body JSON del pedido ({} si no hay o no es JSON; los FormData quedan en opciones.body). */
export const cuerpo = (opciones) => {
  try {
    return opciones?.body && typeof opciones.body === 'string' ? JSON.parse(opciones.body) : {}
  } catch {
    return {}
  }
}

// Quién pide: el login mock elige el token según el mail (ver handler.js → login).
export const TOKENS = { admin: 'mock-token', coach: 'mock-token-coach', cliente: 'mock-token-cliente' }
export const quien = (opciones) => {
  const token = String(opciones?.headers?.Authorization || '').replace(/^Bearer /, '')
  return Object.keys(TOKENS).find((k) => TOKENS[k] === token) || 'admin'
}

/** Los query params de la URL del pedido. */
export const params = (url) => new URL(url, window.location.origin).searchParams

let proximo = 20000
/** Un id nuevo para lo que se crea en el mock (no choca con los de datos.js). */
export const nuevoId = () => (proximo += 1)

/** Fecha ISO como la manda el backend (sin milisegundos). `haceMin` minutos atrás. */
export const iso = (haceMin = 0) => new Date(Date.now() - haceMin * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z')
/** Fecha YYYY-MM-DD, `dias` días desde hoy (negativo = atrás). */
export const dia = (dias = 0) => new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10)

export const noEncontrado = (detalle = 'No encontrado') => json({ detail: detalle }, 404)
export const prohibido = (detalle = 'No tenés permiso para esto.') => json({ detail: detalle }, 403)
