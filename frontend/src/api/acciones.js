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
