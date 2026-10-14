import { request } from './client'

// Carpeta Llamadas y el Fathom de cada coach (Mi cuenta).
export const fetchLlamadas = () => request('/api/llamadas')
export const fetchLlamada = (id) => request(`/api/llamadas/${id}`)
export const asignarCliente = (id, clienteId) => request(`/api/llamadas/${id}/cliente`, { method: 'PUT', body: JSON.stringify({ cliente_id: clienteId }) })
export const fetchFathom = () => request('/api/cuenta/fathom')
export const conectarFathom = (clave) => request('/api/cuenta/fathom', { method: 'PUT', body: JSON.stringify({ clave }) })
export const desconectarFathom = () => request('/api/cuenta/fathom', { method: 'DELETE' })
export const sincronizarFathom = () => request('/api/cuenta/fathom/sincronizar', { method: 'POST' })
export const llamadaPorLink = (url) => request('/api/llamadas/por-link', { method: 'POST', body: JSON.stringify({ url }) })
