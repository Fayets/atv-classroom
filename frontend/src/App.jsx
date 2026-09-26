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
import AdminPage from './pages/AdminPage'
import FrentePage from './pages/FrentePage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
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

function AppRoutes() {
  return (
    <>
      <UnauthorizedSync />
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
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
