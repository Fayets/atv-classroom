import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useMensajeria } from '../context/MensajeriaContext'
import '../styles/mensajes.css'
import { getUserInitials } from '../utils/user'

export default function AppHeader() {
  const { user, logout, isAdmin, isEquipo } = useAuth()
  const { resumen, habilitada } = useMensajeria()
  // Al equipo le importa a cuántos clientes les debe respuesta; al cliente, cuántos mensajes no leyó.
  const contador = isEquipo ? resumen.esperando : resumen.no_leidos
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const initials = getUserInitials(user?.nombre)

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
      </div>

      <div className="app-header__right">
      {habilitada ? (
        <NavLink to="/mensajes" className={({ isActive }) => `app-header__mensajes${isActive ? ' is-on' : ''}`}>
          Mensajes
          {contador ? (
            <span className="msj-cuenta" aria-label={isEquipo ? `${contador} esperan respuesta` : `${contador} sin leer`}>
              {contador > 99 ? '99+' : contador}
            </span>
          ) : null}
        </NavLink>
      ) : null}
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
          {user?.foto_url ? (
            <img className="app-header__avatar-img" src={user.foto_url} alt="" referrerPolicy="no-referrer" />
          ) : (
            initials
          )}
        </button>

        {menuOpen ? (
          <div className="app-header__menu" role="menu">
            {user?.nombre ? (
              <p className="app-header__menu-name">{user.nombre}</p>
            ) : null}
            {user?.email ? (
              <p className="app-header__menu-email">{user.email}</p>
            ) : null}
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
            {isAdmin ? (
              <Link
                to="/admin/equipo"
                className="app-header__menu-link"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                Equipo
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
      </div>
    </header>
  )
}
