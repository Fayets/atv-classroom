import { request } from './client'

export const fetchMiRoadmap = () => request('/api/roadmap')
export const fetchRoadmap = (clienteId) => request(`/api/roadmap/clientes/${clienteId}`)
export const crearDoc = (clienteId, datos) => request(`/api/roadmap/clientes/${clienteId}`, { method: 'POST', body: JSON.stringify(datos) })
export const editarDoc = (docId, datos) => request(`/api/roadmap/docs/${docId}`, { method: 'PATCH', body: JSON.stringify(datos) })
export const borrarDoc = (docId) => request(`/api/roadmap/docs/${docId}`, { method: 'DELETE' })
// Borrador con IA desde la transcripción de la llamada (no guarda nada).
export const generarRoadmap = (clienteId, transcripcion, fathomUrl) =>
  request(`/api/roadmap/clientes/${clienteId}/generar`, { method: 'POST', body: JSON.stringify({ transcripcion, fathom_url: fathomUrl }) })
export const marcarPaso = (docId, pasoId, hecho) =>
  request(`/api/roadmap/docs/${docId}/pasos/${pasoId}`, { method: 'PUT', body: JSON.stringify({ hecho }) })
