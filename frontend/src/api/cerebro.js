import { request } from './client'

export function fetchCerebro() {
  return request('/api/admin/cerebro')
}

// Lo de cada neurona se guarda medio minuto: volver a tocarla (o haberla rozado con el mouse) la abre al instante.
const cache = new Map()
const VIDA_MS = 30_000

export function fetchNeurona(id) {
  const hit = cache.get(id)
  if (hit && Date.now() - hit.t < VIDA_MS) return hit.p
  const p = request(`/api/admin/cerebro/nodo?id=${encodeURIComponent(id)}`)
  cache.set(id, { t: Date.now(), p })
  p.catch(() => cache.delete(id))
  return p
}

export function precargarNeurona(id) {
  fetchNeurona(id).catch(() => {})
}

export function olvidarNeuronas() {
  cache.clear()
}
