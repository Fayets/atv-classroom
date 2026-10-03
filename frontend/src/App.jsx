import { useEffect } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { setUnauthorizedHandler } from './api/client'
import AdminRoute from './components/AdminRoute'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PlataformaDemoProvider, usePlataforma } from './context/PlataformaDemo'
import './styles/mac.css'
import './styles/tema-mac.css'
import './styles/tema-claro.css'
import CoachBandejaPage from './pages/CoachBandejaPage'
import CoachClientesPage from './pages/CoachClientesPage'
import MensajesPage from './pages/MensajesPage'
import RoadmapsPage from './pages/RoadmapsPage'
import AdminPage from './pages/AdminPage'
import FrentePage from './pages/FrentePage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import PlaceholderPage from './pages/PlaceholderPage'
import ProgramaDetailPage from './pages/ProgramaDetailPage'
import ProgramasGridPage from './pages/ProgramasGridPage'

// Vista previa: el estilo elegido (ATV o Mac) se aplica a toda la app desde <html>.
function EstiloSync() {
  const { estilo } = usePlataforma()
  useEffect(() => {
    document.documentElement.dataset.estilo = estilo
  }, [estilo])
  return null
}

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

function AppRoutes() {
  return (
    <>
      <UnauthorizedSync />
      <EstiloSync />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {[
          ['/mensajes', <MensajesPage key="m" />],
          ['/roadmaps', <RoadmapsPage key="r" />],
          ['/coach', <CoachBandejaPage key="b" />],
          ['/coach/clientes', <CoachClientesPage key="c" />],
        ].map(([path, el]) => (
          <Route key={path} path={path} element={<ProtectedRoute>{el}</ProtectedRoute>} />
        ))}
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
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PlataformaDemoProvider>
          <AppRoutes />
        </PlataformaDemoProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
