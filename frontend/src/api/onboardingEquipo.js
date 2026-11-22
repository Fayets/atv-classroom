import { request } from './client'

export const fetchOnboardingPendiente = () => request('/api/onboarding-equipo/pendiente')
export const responderOnboarding = (respuestas) => request('/api/onboarding-equipo', { method: 'POST', body: JSON.stringify(respuestas) })

export const fetchOnboardingEquipo = (clienteId) => request(`/api/onboarding-equipo/cliente/${clienteId}`)
export const pedirOnboarding = (miembroId) => request(`/api/onboarding-equipo/miembro/${miembroId}`, { method: 'POST' })
export const cancelarOnboarding = (miembroId) => request(`/api/onboarding-equipo/miembro/${miembroId}`, { method: 'DELETE' })
