import { getStoredToken, request } from './client'

export const fetchContratos = () => request('/api/admin/contratos')

// El PDF firmado viene de la base (lo guarda atv-onboarding cuando ZapSign avisa la firma).
export async function fetchContratoPdf(id) {
  const token = getStoredToken()
  const res = await fetch(`/api/admin/contratos/${id}/pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error(res.status === 404 ? 'Ese contrato todavía no está firmado.' : 'No se pudo abrir el contrato.')
  return res.blob()
}
