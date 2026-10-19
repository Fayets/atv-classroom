import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PantallaPausa } from './Pausa'

// Lo único que ve un cliente en pausa: su canal y su cuenta.
const ABIERTO_EN_PAUSA = ['/mensajes', '/cuenta']

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isEquipo, user } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (user?.pausa && !isEquipo && !ABIERTO_EN_PAUSA.some((r) => location.pathname.startsWith(r))) {
    return <PantallaPausa />
  }

  return children
}
