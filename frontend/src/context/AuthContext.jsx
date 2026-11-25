import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  getStoredToken,
  loginGoogleRequest,
  loginRequest,
  logoutRequest,
  setStoredToken,
} from '../api/client'
import { EVENTO_CAMBIO, cambiarModoMiembro, modoMiembroActivo } from '../utils/modoMiembro'

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
  const [modoMiembroGuardado, setModoMiembroGuardado] = useState(() => modoMiembroActivo())

  // Modo Miembro (utils/modoMiembro.js): lo prende y lo apaga el admin; se sigue entre componentes por un evento.
  useEffect(() => {
    const alCambiar = () => setModoMiembroGuardado(modoMiembroActivo())
    window.addEventListener(EVENTO_CAMBIO, alCambiar)
    return () => window.removeEventListener(EVENTO_CAMBIO, alCambiar)
  }, [])

  const guardarSesion = useCallback((data) => {
    const sessionUser = {
      usuario_id: data.usuario_id,
      nombre: data.nombre,
      email: data.email,
      rol: data.rol,
      dias_restantes: data.dias_restantes ?? null,
      foto_url: data.foto_url ?? null,
      miembro: data.miembro ?? null,
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

  // Cambios del propio perfil (foto, días) sin volver a loguearse.
  const actualizarUsuario = useCallback((cambios) => {
    setUser((u) => {
      if (!u) return u
      const nuevo = { ...u, ...cambios }
      localStorage.setItem('atv_classroom_user', JSON.stringify(nuevo))
      return nuevo
    })
  }, [])

  const logout = useCallback(() => {
    // Se avisa al backend con el token todavía guardado; no se espera la respuesta.
    if (getStoredToken()) logoutRequest()
    setStoredToken(null)
    cambiarModoMiembro(false)
    localStorage.removeItem('atv_classroom_user')
    setToken(null)
    setUser(null)
  }, [])

  // Solo un admin puede usarlo. Con el modo prendido, el resto de la app ve a un miembro: rol de plan
  // ("boost"), sin admin ni equipo. `rolReal` y `modoMiembro` sirven para mostrar la salida.
  const modoMiembro = modoMiembroGuardado && user?.rol === 'admin'
  const usuarioVisible = useMemo(
    () => (modoMiembro ? { ...user, rol: 'boost', dias_restantes: null, miembro: null, permisos: undefined } : user),
    [modoMiembro, user],
  )

  const value = useMemo(
    () => ({
      token,
      user: usuarioVisible,
      isAuthenticated: Boolean(token),
      isAdmin: usuarioVisible?.rol === 'admin',
      isEquipo: ROLES_EQUIPO.includes(usuarioVisible?.rol),
      rolReal: user?.rol ?? null,
      modoMiembro,
      cambiarModoMiembro,
      login,
      loginGoogle,
      logout,
      actualizarUsuario,
    }),
    [token, usuarioVisible, user, modoMiembro, login, loginGoogle, logout, actualizarUsuario],
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
