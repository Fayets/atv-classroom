import { request } from './client'

export const fetchMiRoadmap = () => request('/api/roadmap')
export const fetchRoadmap = (clienteId) => request(`/api/roadmap/clientes/${clienteId}`)
export const crearDoc = (clienteId, datos) => request(`/api/roadmap/clientes/${clienteId}`, { method: 'POST', body: JSON.stringify(datos) })
export const editarDoc = (docId, datos) => request(`/api/roadmap/docs/${docId}`, { method: 'PATCH', body: JSON.stringify(datos) })
export const borrarDoc = (docId) => request(`/api/roadmap/docs/${docId}`, { method: 'DELETE' })
// Borrador con IA desde la transcripción de la llamada (no guarda nada).
// diagnosticoId: un diagnóstico de cuello de botella aprobado; el roadmap lo resuelve (alcanza sin llamada).
export const generarRoadmap = (clienteId, transcripcion, fathomUrl, diagnosticoId = null) =>
  request(`/api/roadmap/clientes/${clienteId}/generar`, { method: 'POST', body: JSON.stringify({ transcripcion, fathom_url: fathomUrl, diagnostico_id: diagnosticoId }) })
export const marcarPaso = (docId, pasoId, hecho) =>
  request(`/api/roadmap/docs/${docId}/pasos/${pasoId}`, { method: 'PUT', body: JSON.stringify({ hecho }) })
