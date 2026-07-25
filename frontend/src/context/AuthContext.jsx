import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import {
  getStoredToken,
  loginRequest,
  setStoredToken,
} from '../api/client'

const AuthContext = createContext(null)

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

  const login = useCallback(async (email, contrasena) => {
    const data = await loginRequest(email, contrasena)
    const sessionUser = {
      usuario_id: data.usuario_id,
      nombre: data.nombre,
      email: data.email,
      rol: data.rol,
      dias_restantes: data.dias_restantes ?? null,
    }

    setStoredToken(data.token)
    localStorage.setItem('atv_classroom_user', JSON.stringify(sessionUser))
    setToken(data.token)
    setUser(sessionUser)
    return sessionUser
  }, [])

  const logout = useCallback(() => {
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
      login,
      logout,
    }),
    [token, user, login, logout],
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
