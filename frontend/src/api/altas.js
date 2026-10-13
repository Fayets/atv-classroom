import { request } from './client'

export const fetchAltas = () => request('/api/altas')
export const crearAlta = (datos) => request('/api/altas', { method: 'POST', body: JSON.stringify(datos) })
export const enviarOnboarding = (id) => request(`/api/altas/${id}/enviar-onboarding`, { method: 'POST' })
export const anularAlta = (id) => request(`/api/altas/${id}`, { method: 'DELETE' })
export const fetchFichasSinCanal = () => request('/api/altas/fichas-sin-canal')
