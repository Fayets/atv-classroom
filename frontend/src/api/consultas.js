import { request } from './client'

export const empezarConsulta = (pregunta, historial) =>
  request('/api/consultas', { method: 'POST', body: JSON.stringify({ pregunta, historial }) })
export const estadoConsulta = (id) => request(`/api/consultas/${id}`)
