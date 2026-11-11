import { request } from './client'

// Piloto: respuestas en la voz de cada persona del equipo (borrador para aprobar o automático).
export const fetchModoPiloto = () => request('/api/piloto/modo')

export const guardarModoPiloto = (modo, bloqueados) =>
  request('/api/piloto/modo', { method: 'PUT', body: JSON.stringify({ modo, bloqueados }) })

export const fetchPilotoCanal = (canalId) => request(`/api/piloto/canales/${canalId}`)

export const enviarBorrador = (id, texto = null) =>
  request(`/api/piloto/borradores/${id}/enviar`, { method: 'POST', body: JSON.stringify({ texto }) })

export const descartarBorrador = (id) => request(`/api/piloto/borradores/${id}/descartar`, { method: 'POST' })
