import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import {
  getStoredToken,
  loginGoogleRequest,
  loginRequest,
  logoutRequest,
  setStoredToken,
} from '../api/client'

const AuthContext = createContext(null)
const ROLES_EQUIPO = ['admin', 'coach']

function readStoredUser() {
  const raw = localStorage.getItem('atv_classroom_user')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken())
  const [user, setUser] = useState(() => readStoredUser())

  const guardarSesion = useCallback((data) => {
    const sessionUser = {
      usuario_id: data.usuario_id,
      nombre: data.nombre,
      email: data.email,
      rol: data.rol,
      dias_restantes: data.dias_restantes ?? null,
      foto_url: data.foto_url ?? null,
    }

    setStoredToken(data.token)
    localStorage.setItem('atv_classroom_user', JSON.stringify(sessionUser))
    setToken(data.token)
    setUser(sessionUser)
    return sessionUser
  }, [])

  const login = useCallback(
    async (email, contrasena) => guardarSesion(await loginRequest(email, contrasena)),
    [guardarSesion],
  )

  const loginGoogle = useCallback(
    async (credencial) => guardarSesion(await loginGoogleRequest(credencial)),
    [guardarSesion],
  )

  const logout = useCallback(() => {
    // Se avisa al backend con el token todavía guardado; no se espera la respuesta.
    if (getStoredToken()) logoutRequest()
    setStoredToken(null)
    localStorage.removeItem('atv_classroom_user')
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      isAdmin: user?.rol === 'admin',
      isEquipo: ROLES_EQUIPO.includes(user?.rol),
      login,
      loginGoogle,
      logout,
    }),
    [token, user, login, loginGoogle, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return context
}
