import { request } from './client'

export const fetchCierrePendiente = () => request('/api/cierre/pendiente')
export const fetchOtroCreador = (periodo) => request(`/api/cierre/${periodo}/otro`)
export const responderCierre = (periodo, datos) => request(`/api/cierre/${periodo}`, { method: 'POST', body: JSON.stringify(datos) })

export const fetchCierres = () => request('/api/admin/cierres')
export const fetchCierreMes = (periodo) => request(`/api/admin/cierres/${periodo}`)
export const enviarCierre = (periodo) => request(`/api/admin/cierres/${periodo}/enviar`, { method: 'POST' })

// Las tasas del embudo, igual que en el servidor: se calculan con los números, no se preguntan.
export function tasasDe(r) {
  const pct = (a, b) => {
    const x = Number(r[a])
    const y = Number(r[b])
    return r[a] !== '' && r[b] !== '' && Number.isFinite(x) && Number.isFinite(y) && y > 0 ? Math.round((1000 * x) / y) / 10 : null
  }
  return { agendamiento: pct('agendas', 'conversaciones'), asistencia: pct('llamadas', 'agendas'), cierre: pct('ventas', 'llamadas') }
}

// Algo que hizo el cliente (mandar un mensaje, cambiar de pantalla): con el cierre vencido, cada pocas
// acciones le vuelve a aparecer el cartel.
export const ACCION = 'atv:accion'
export const contarAccion = () => window.dispatchEvent(new Event(ACCION))
