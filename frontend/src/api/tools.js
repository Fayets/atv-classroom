import { request } from './client'

export const fetchTools = () => request('/api/tools')
export const fetchToolsAdmin = () => request('/api/tools/admin')
export const guardarToolsAdmin = (body) => request('/api/tools/admin', { method: 'PUT', body: JSON.stringify(body) })
