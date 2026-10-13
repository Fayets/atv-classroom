import { request } from './client'

export const fetchMiRoadmap = () => request('/api/roadmap')
export const fetchRoadmap = (clienteId) => request(`/api/roadmap/clientes/${clienteId}`)
export const fetchSugeridos = (clienteId) => request(`/api/roadmap/clientes/${clienteId}/sugeridos`)
export const crearDoc = (clienteId, datos) => request(`/api/roadmap/clientes/${clienteId}`, { method: 'POST', body: JSON.stringify(datos) })
export const editarDoc = (docId, datos) => request(`/api/roadmap/docs/${docId}`, { method: 'PATCH', body: JSON.stringify(datos) })
export const borrarDoc = (docId) => request(`/api/roadmap/docs/${docId}`, { method: 'DELETE' })
