import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { pedirCartelPausa } from './Pausa'

// Un cliente en pausa ve el inicio, recursos, comunidad y su cuenta, pero no puede ENTRAR: al material
// (la grilla o un módulo), un frente, su roadmap o la IA. Ahí le sale el cartel y vuelve al inicio.
const CERRADO_EN_PAUSA = [/^\/classroom(\/|$)/, /^\/frentes\//, /^\/roadmap/, /^\/chat/]

function Bloqueado() {
  useEffect(() => {
    pedirCartelPausa()
  }, [])
  return <Navigate to="/" replace />
}

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isEquipo, user } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (user?.pausa && !isEquipo && CERRADO_EN_PAUSA.some((r) => r.test(location.pathname))) {
    return <Bloqueado />
  }

  return children
}
