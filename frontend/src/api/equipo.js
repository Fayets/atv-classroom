import { request } from './client'

// Equipo del cliente (desde Mi cuenta)
export const fetchEquipo = () => request('/api/cuenta/equipo')
export const agregarMiembro = (datos) => request('/api/cuenta/equipo', { method: 'POST', body: JSON.stringify(datos) })
export const editarMiembro = (id, datos) => request(`/api/cuenta/equipo/${id}`, { method: 'PATCH', body: JSON.stringify(datos) })
export const quitarMiembro = (id) => request(`/api/cuenta/equipo/${id}`, { method: 'DELETE' })

// Cupo por plan (solo admins)
export const fetchCupos = () => request('/api/admin/equipos-clientes')
export const guardarCupos = (planes) => request('/api/admin/equipos-clientes', { method: 'PUT', body: JSON.stringify({ planes }) })
