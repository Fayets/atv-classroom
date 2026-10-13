import { useEffect, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  useLocation,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { setUnauthorizedHandler } from './api/client'
import Escritorio from './components/mac/Escritorio'
import AdminRoute from './components/AdminRoute'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider, useAuth } from './context/AuthContext'
import { EscritorioProvider, useEscritorio } from './context/EscritorioContext'
import { MensajeriaProvider } from './context/MensajeriaContext'
import AdminPage from './pages/AdminPage'
import CerebroPage from './pages/CerebroPage'
import EquipoPage from './pages/EquipoPage'
import FrentePage from './pages/FrentePage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import MensajesPage from './pages/MensajesPage'
import PlaceholderPage from './pages/PlaceholderPage'
import ProgramaDetailPage from './pages/ProgramaDetailPage'
import ProgramasGridPage from './pages/ProgramasGridPage'

function UnauthorizedSync() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout()
      navigate('/login', { replace: true })
    })

    return () => setUnauthorizedHandler(null)
  }, [logout, navigate])

  return null
}

function LegacyProgramaRedirect() {
  const { programaId } = useParams()
  return <Navigate to={`/classroom/${programaId}`} replace />
}

// En el escritorio, Mensajes vive en su propia ventana permanente (ver Escritorio).
function RutaMensajes() {
  return useEscritorio() ? null : <MensajesPage />
}

// El equipo trabaja dentro de un escritorio de macOS (en pantallas chicas, sin escritorio).
function MarcoEquipo({ children }) {
  const { isEquipo, isAuthenticated } = useAuth()
  const { pathname } = useLocation()
  const [ancho, setAncho] = useState(() => window.matchMedia('(min-width: 900px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)')
    const cambiar = () => setAncho(mq.matches)
    mq.addEventListener('change', cambiar)
    return () => mq.removeEventListener('change', cambiar)
  }, [])
  if (!isAuthenticated || !isEquipo || !ancho || pathname.startsWith('/login')) return children
  return (
    <EscritorioProvider>
      <Escritorio>{children}</Escritorio>
    </EscritorioProvider>
  )
}

function AppRoutes() {
  return (
    <>
      <UnauthorizedSync />
      <MarcoEquipo>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminPage />
            </AdminRoute>
          }
        />
        <Route
          path="/mensajes"
          element={
            <ProtectedRoute>
              <RutaMensajes />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/cerebro"
          element={
            <AdminRoute>
              <CerebroPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/equipo"
          element={
            <AdminRoute>
              <EquipoPage />
            </AdminRoute>
          }
        />
        <Route
          path="/classroom"
          element={
            <ProtectedRoute>
              <ProgramasGridPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/classroom/:programaId"
          element={
            <ProtectedRoute>
              <ProgramaDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/frentes/:slug"
          element={
            <ProtectedRoute>
              <FrentePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/recursos"
          element={
            <ProtectedRoute>
              <PlaceholderPage title="Recursos" activeTab="recursos" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/comunidad"
          element={
            <ProtectedRoute>
              <PlaceholderPage title="Comunidad" activeTab="comunidad" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <PlaceholderPage title="Conversación" />
            </ProtectedRoute>
          }
        />
        <Route path="/programas" element={<Navigate to="/classroom" replace />} />
        <Route path="/programas/:programaId" element={<LegacyProgramaRedirect />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </MarcoEquipo>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <MensajeriaProvider>
          <AppRoutes />
        </MensajeriaProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
