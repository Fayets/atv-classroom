import { request } from './client'

export function fetchAcciones() {
  return request('/api/acciones')
}

export function crearAccion(nombre, texto) {
  return request('/api/acciones', { method: 'POST', body: JSON.stringify({ nombre, texto }) })
}

export function editarAccion(id, nombre, texto) {
  return request(`/api/acciones/${id}`, { method: 'PATCH', body: JSON.stringify({ nombre, texto }) })
}

export function borrarAccion(id) {
  return request(`/api/acciones/${id}`, { method: 'DELETE' })
}

// Las clases que se le pueden mandar a un cliente desde el chat (con su módulo y el link directo).
export function fetchClasesParaEnviar() {
  return request('/api/acciones/clases')
}

// Le desbloquea la clase al cliente del chat (a él y a su equipo) antes de mandarle el link.
export function compartirClase(claseId, canalId) {
  return request(`/api/acciones/clases/${claseId}/compartir`, { method: 'POST', body: JSON.stringify({ canal_id: canalId }) })
}
