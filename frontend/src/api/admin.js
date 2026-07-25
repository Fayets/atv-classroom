import { request, requestForm } from './client'

async function adminRequest(url, options = {}) {
  return request(url, options)
}

export function fetchAdminProgramas() {
  return adminRequest('/api/admin/programas')
}

export function fetchAdminPrograma(programaId) {
  return adminRequest(`/api/admin/programas/${programaId}`)
}

export function createAdminPrograma(data) {
  return adminRequest('/api/admin/programas', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateAdminPrograma(programaId, data) {
  return adminRequest(`/api/admin/programas/${programaId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteAdminPrograma(programaId) {
  return adminRequest(`/api/admin/programas/${programaId}`, {
    method: 'DELETE',
  })
}

export function createAdminSeccion(programaId, data) {
  return adminRequest(`/api/admin/programas/${programaId}/secciones`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateAdminSeccion(seccionId, data) {
  return adminRequest(`/api/admin/secciones/${seccionId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteAdminSeccion(seccionId) {
  return adminRequest(`/api/admin/secciones/${seccionId}`, {
    method: 'DELETE',
  })
}

export function createAdminClase(seccionId, data) {
  return adminRequest(`/api/admin/secciones/${seccionId}/clases`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateAdminClase(claseId, data) {
  return adminRequest(`/api/admin/clases/${claseId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteAdminClase(claseId) {
  return adminRequest(`/api/admin/clases/${claseId}`, {
    method: 'DELETE',
  })
}

export function uploadRecursoPdf(claseId, file, titulo) {
  const form = new FormData()
  form.append('archivo', file)
  if (titulo?.trim()) {
    form.append('titulo', titulo.trim())
  }
  return requestForm(`/api/admin/clases/${claseId}/recursos/upload`, {
    method: 'POST',
    body: form,
  })
}

export function deleteAdminRecurso(recursoId) {
  return adminRequest(`/api/admin/recursos/${recursoId}`, {
    method: 'DELETE',
  })
}
