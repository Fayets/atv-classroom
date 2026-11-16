import { request } from './client'

// #seguimiento: la pantalla de Mauri para recordar las clases a nombre de otra cuenta.
export const fetchAccesoSeguimiento = () => request('/api/seguimiento/acceso')
export const fetchOpcionesSeguimiento = () => request('/api/seguimiento/opciones')
export const buscarClientesSeguimiento = (q) => request(`/api/seguimiento/clientes?q=${encodeURIComponent(q)}`)
export const fetchEnviosSeguimiento = () => request('/api/seguimiento/envios')
export const crearEnvioSeguimiento = (datos) => request('/api/seguimiento/envios', { method: 'POST', body: JSON.stringify(datos) })
export const cancelarEnvioSeguimiento = (id) => request(`/api/seguimiento/envios/${id}`, { method: 'DELETE' })
