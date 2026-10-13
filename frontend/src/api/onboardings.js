import { request } from './client'

export const fetchOnboardings = () => request('/api/onboardings')
export const fetchOnboarding = (id) => request(`/api/onboardings/${id}`)
