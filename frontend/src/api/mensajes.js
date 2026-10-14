import { getStoredToken, request } from './client'

export function fetchHabilitada() {
  return request('/api/mensajes/habilitada')
}

export function fetchCanales() {
  return request('/api/mensajes/canales')
}

export function fetchNoLeidos() {
  return request('/api/mensajes/no-leidos')
}

export function fetchMensajes(canalId, { antesDe, despuesDe } = {}) {
  const q = new URLSearchParams()
  if (antesDe != null) q.set('antes_de', antesDe)
  if (despuesDe != null) q.set('despues_de', despuesDe)
  const sufijo = q.toString() ? `?${q}` : ''
  return request(`/api/mensajes/canales/${canalId}/mensajes${sufijo}`)
}

export function enviarMensaje(canalId, texto, respuestaA = null, menciones = [], adjuntos = []) {
  return request(`/api/mensajes/canales/${canalId}/mensajes`, {
    method: 'POST',
    body: JSON.stringify({ texto, respuesta_a: respuestaA, menciones, adjuntos }),
  })
}

/** Sube un archivo con progreso (fetch no informa el avance de subida; XMLHttpRequest sí). */
export function subirAdjunto(canalId, archivo, alAvanzar) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/mensajes/canales/${canalId}/adjuntos`)
    const token = getStoredToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (e) => e.lengthComputable && alAvanzar?.(Math.round((e.loaded / e.total) * 100))
    xhr.onload = () => {
      let data = {}
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        // respuesta sin JSON (por ejemplo, un 413 del proxy)
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else if (xhr.status === 413) reject(new Error('El archivo pesa más de 25 MB.'))
      else reject(new Error(typeof data.detail === 'string' ? data.detail : 'No se pudo subir el archivo.'))
    }
    xhr.onerror = () => reject(new Error('Se cortó la conexión al subir el archivo.'))
    const form = new FormData()
    form.append('archivo', archivo)
    xhr.send(form)
  })
}

let equipoCache = null
export function crearCanal(nombre, descripcion, roles) {
  return request('/api/mensajes/canales', { method: 'POST', body: JSON.stringify({ nombre, descripcion, roles }) })
}

export function editarCanal(canalId, cambios) {
  return request(`/api/mensajes/canales/${canalId}`, { method: 'PATCH', body: JSON.stringify(cambios) })
}

// Mueve el chat de un cliente a "Inactivos" o lo devuelve a su grupo (lo ve todo el equipo).
export function marcarInactivo(canalId, inactivo) {
  return request(`/api/mensajes/canales/${canalId}/inactivo`, { method: 'PUT', body: JSON.stringify({ inactivo }) })
}

export function borrarCanal(canalId) {
  return request(`/api/mensajes/canales/${canalId}`, { method: 'DELETE' })
}

export function fetchEquipoChat() {
  if (!equipoCache) equipoCache = request('/api/mensajes/equipo').catch((e) => {
    equipoCache = null
    throw e
  })
  return equipoCache
}

export function fetchMenciones() {
  return request('/api/mensajes/menciones')
}

export function resolverMencion(mencionId) {
  return request(`/api/mensajes/menciones/${mencionId}/resolver`, { method: 'POST' })
}

export function editarMensaje(mensajeId, texto) {
  return request(`/api/mensajes/${mensajeId}`, { method: 'PATCH', body: JSON.stringify({ texto }) })
}

export function borrarMensaje(mensajeId) {
  return request(`/api/mensajes/${mensajeId}`, { method: 'DELETE' })
}

export function marcarLeido(canalId, ultimoId) {
  return request(`/api/mensajes/canales/${canalId}/leido`, {
    method: 'POST',
    body: JSON.stringify({ ultimo_id: ultimoId }),
  })
}

/**
 * Sugerencia de la IA para seguir el mensaje (o la respuesta entera si el borrador está vacío).
 * Llega de a pedazos: alPedazo recibe el texto acumulado a medida que la IA lo escribe.
 * Devuelve { id, texto } al terminar. Se corta con signal (cuando la persona sigue escribiendo).
 */
export async function pedirSugerencia(canalId, borrador, { signal, alPedazo } = {}) {
  const token = getStoredToken()
  const res = await fetch(`/api/mensajes/canales/${canalId}/sugerir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ borrador }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`sugerencia ${res.status}`)
  const id = Number(res.headers.get('X-Sugerencia-Id')) || null
  const lector = res.body.getReader()
  const deco = new TextDecoder()
  let texto = ''
  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    texto += deco.decode(value, { stream: true })
    alPedazo?.(texto)
  }
  return { id, texto }
}

export function marcarSugerenciaUsada(id) {
  return request(`/api/mensajes/sugerencias/${id}/usada`, { method: 'POST' }).catch(() => {})
}

export function fetchParticipantes(canalId) {
  return request(`/api/mensajes/canales/${canalId}/participantes`)
}
