import { request } from './client'

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

export function enviarMensaje(canalId, texto, respuestaA = null, menciones = []) {
  return request(`/api/mensajes/canales/${canalId}/mensajes`, {
    method: 'POST',
    body: JSON.stringify({ texto, respuesta_a: respuestaA, menciones }),
  })
}

let equipoCache = null
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
