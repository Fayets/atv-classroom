import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Solo el equipo de ATV (coaches y admins).
export default function EquipoRoute({ children }) {
  const { isAuthenticated, isEquipo } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!isEquipo) return <Navigate to="/" replace />
  return children
}
