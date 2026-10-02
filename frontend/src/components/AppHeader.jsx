import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getUserInitials } from '../utils/user'
import '../styles/plataforma.css'

// Vista previa de la ATV Platform: navegación del cliente y del coach.
const NAV_CLIENTE = [
  ['/', 'Inicio', true],
  ['/classroom', 'Classroom'],
  ['/mensajes', 'Mensajes', false, 2],
  ['/roadmaps', 'Roadmaps'],
]
const NAV_COACH = [
  ['/coach', 'Bandeja', true, 3],
  ['/coach/clientes', 'Clientes'],
]

export default function AppHeader() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const initials = getUserInitials(user?.nombre)
  const { pathname } = useLocation()
  const esCoach = pathname.startsWith('/coach')
  const nav = esCoach ? NAV_COACH : NAV_CLIENTE

  useEffect(() => {
    if (!menuOpen) return

    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

  function handleLogout() {
    setMenuOpen(false)
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="app-header">
      <div className="app-header__left">
        <Link to="/" className="app-header__logo" aria-label="Inicio ATV">
          <img src="/atv-logo.png" alt="" className="app-header__logo-img" />
        </Link>
        <nav className="app-header__nav" aria-label="Secciones">
          {nav.map(([to, label, end, badge]) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `app-header__navlink${isActive ? ' is-active' : ''}`}>
              {label}
              {badge && !pathname.startsWith(to === '/' ? '/__' : to) ? <span className="app-header__badge">{badge}</span> : null}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="app-header__user" ref={menuRef}>
        <button
          type="button"
          className="app-header__avatar"
          title={user?.nombre || 'Usuario'}
          aria-label="Menú de usuario"
          aria-expanded={menuOpen}
          aria-haspopup="true"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {initials}
        </button>

        {menuOpen ? (
          <div className="app-header__menu" role="menu">
            {user?.nombre ? (
              <p className="app-header__menu-name">{user.nombre}</p>
            ) : null}
            {user?.email ? (
              <p className="app-header__menu-email">{user.email}</p>
            ) : null}
            <Link
              to={esCoach ? '/mensajes' : '/coach'}
              className="app-header__menu-link"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
            >
              {esCoach ? 'Ver como cliente (demo)' : 'Ver como coach (demo)'}
            </Link>
            {isAdmin ? (
              <Link
                to="/admin"
                className="app-header__menu-link"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                Configuración de módulos
              </Link>
            ) : null}
            <button
              type="button"
              className="app-header__menu-logout"
              role="menuitem"
              onClick={handleLogout}
            >
              Cerrar sesión
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
