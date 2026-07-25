import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import HubPage from './HubPage'

export default function HomePage() {
  const { isAdmin } = useAuth()

  if (isAdmin) {
    return <Navigate to="/admin" replace />
  }

  return <HubPage />
}
