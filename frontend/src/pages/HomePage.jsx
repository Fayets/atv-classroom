import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import InicioPage from './InicioPage'

export default function HomePage() {
  const { isAdmin } = useAuth()

  if (isAdmin) {
    return <Navigate to="/admin" replace />
  }

  return <InicioPage />
}
