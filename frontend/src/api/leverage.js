import { request } from './client'

// Conectar ATV Leverage con la cuenta del classroom (ver backend/src/services/leverage_service.py).
export const autorizarLeverage = (vuelta, estado) => request('/api/leverage/autorizar', { method: 'POST', body: JSON.stringify({ vuelta, estado }) })
