import { request } from './client'

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

export function enviarMensaje(canalId, texto, respuestaA = null) {
  return request(`/api/mensajes/canales/${canalId}/mensajes`, {
    method: 'POST',
    body: JSON.stringify({ texto, respuesta_a: respuestaA }),
  })
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
