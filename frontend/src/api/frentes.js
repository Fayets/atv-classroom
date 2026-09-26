import { request } from './client'

export function fetchFrentes() {
  return request('/api/frentes')
}

export function fetchFrente(slug) {
  return request(`/api/frentes/${encodeURIComponent(slug)}`)
}

export function actualizarFrente(slug, cambios) {
  return request(`/api/frentes/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    body: JSON.stringify(cambios),
  })
}

export function preguntarGuia(texto) {
  return request('/api/guia', { method: 'POST', body: JSON.stringify({ texto }) })
}

export function enviarConsultaCoach(texto, slug = null) {
  return request('/api/consultas', { method: 'POST', body: JSON.stringify({ texto, slug }) })
}
