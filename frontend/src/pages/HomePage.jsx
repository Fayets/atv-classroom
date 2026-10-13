import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import InicioPage from './InicioPage'

export default function HomePage() {
  const { isEquipo } = useAuth()

  // El equipo trabaja en Mensajes; el editor de módulos queda en el menú del avatar.
  if (isEquipo) {
    return <Navigate to="/mensajes" replace />
  }

  return <InicioPage />
}
