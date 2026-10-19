import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { pedirCartelPausa } from './Pausa'

// Un cliente en pausa ve todo el classroom, pero no puede ENTRAR: abrir un módulo, un frente, su roadmap
// o la IA. Ahí le sale el cartel de hablar con Lucas y se queda donde estaba.
const CERRADO_EN_PAUSA = [/^\/classroom\/[^/]+/, /^\/frentes\//, /^\/roadmap/, /^\/chat/]

function Bloqueado() {
  useEffect(() => {
    pedirCartelPausa()
  }, [])
  return <Navigate to="/classroom" replace />
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
