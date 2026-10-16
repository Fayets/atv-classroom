import { request } from './client'

export const fetchOnboardings = () => request('/api/onboardings')
export const fetchOnboarding = (id) => request(`/api/onboardings/${id}`)
export const fetchFormularios = () => request('/api/onboardings/formularios')
// La pizarra a lápiz del formulario: la primera vez la dibuja la IA (unos segundos) y después queda guardada.
export const fetchPizarra = (id) => request(`/api/onboardings/${id}/pizarra`)
export const rearmarPizarra = (id) => request(`/api/onboardings/${id}/pizarra`, { method: 'POST' })
