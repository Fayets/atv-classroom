import { request } from './client'

// Live sessions: el equipo sube la grabación de una clase en vivo al módulo del plan.
export function fetchModulosLive() {
  return request('/api/live-sessions/modulos')
}

export function subirLiveSession(datos) {
  return request('/api/live-sessions', { method: 'POST', body: JSON.stringify(datos) })
}

export function borrarLiveSession(claseId) {
  return request(`/api/live-sessions/${claseId}`, { method: 'DELETE' })
}
