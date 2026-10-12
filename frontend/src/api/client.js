const TOKEN_KEY = 'atv_classroom_token'

let unauthorizedHandler = null

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

function buildHeaders(includeAuth = true) {
  const headers = {
    'Content-Type': 'application/json',
  }

  if (includeAuth) {
    const token = getStoredToken()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }

  return headers
}

// Un 401 en estas rutas es un login fallido, no una sesión vencida.
const RUTAS_SIN_SESION = ['/api/auth/login', '/api/auth/google', '/api/auth/logout']

function cortaSesion(res, url) {
  return res.status === 401 && !RUTAS_SIN_SESION.some((ruta) => url.includes(ruta))
}

async function parseResponse(res, url) {
  if (cortaSesion(res, url)) {
    unauthorizedHandler?.()
  }

  if (res.status === 204) {
    if (!res.ok) {
      throw new ApiError('Error inesperado', res.status)
    }
    return null
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const detail = data.detail
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail[0]?.msg
          : 'Error inesperado'
    throw new ApiError(message, res.status)
  }

  return data
}

export async function request(url, options = {}, includeAuth = true) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...buildHeaders(includeAuth),
      ...options.headers,
    },
  })

  return parseResponse(res, url)
}

/** Multipart (FormData): no envía Content-Type JSON. */
export async function requestForm(url, options = {}, includeAuth = true) {
  const headers = {}
  if (includeAuth) {
    const token = getStoredToken()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  })

  return parseResponse(res, url)
}

export async function loginRequest(email, contrasena) {
  return request(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, contrasena }),
    },
    false,
  )
}

export async function fetchAuthConfig() {
  return request('/api/auth/config', {}, false)
}

export async function loginGoogleRequest(credencial) {
  return request(
    '/api/auth/google',
    {
      method: 'POST',
      body: JSON.stringify({ credencial }),
    },
    false,
  )
}

export async function logoutRequest() {
  return request('/api/auth/logout', { method: 'POST' }).catch(() => null)
}

export async function fetchProgramas() {
  return request('/api/programas')
}

export async function fetchPrograma(programaId) {
  return request(`/api/programas/${programaId}`)
}

export async function fetchSessionProfile() {
  return request('/api/auth/me')
}

export async function fetchClase(claseId) {
  return request(`/api/clases/${claseId}`)
}

export async function updateProgreso(claseId, completado) {
  return request(`/api/clases/${claseId}/progreso`, {
    method: 'PUT',
    body: JSON.stringify({ completado }),
  })
}
