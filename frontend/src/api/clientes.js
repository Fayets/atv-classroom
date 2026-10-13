import { request } from './client'

export function fetchCarpetaClientes() {
  return request('/api/admin/clientes')
}

// La ficha se pide al seleccionar la carpeta: cuando hacés doble clic ya está.
const fichas = new Map()
const VIDA_MS = 60_000

export function fetchFicha(id) {
  const hit = fichas.get(id)
  if (hit && Date.now() - hit.t < VIDA_MS) return hit.p
  const p = request(`/api/admin/clientes/${id}`)
  fichas.set(id, { t: Date.now(), p })
  p.catch(() => fichas.delete(id))
  return p
}
