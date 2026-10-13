import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useMensajeria } from '../context/MensajeriaContext'
import '../styles/mensajes.css'
import { getUserInitials } from '../utils/user'

export default function AppHeader() {
  const { user, logout, isAdmin, isEquipo } = useAuth()
  const { resumen, habilitada } = useMensajeria()
  // Como en Discord, el número baja al leer: mensajes sin leer. El coach ve sus alertas sin responder.
  const contador = isEquipo && !isAdmin ? resumen.esperando : resumen.no_leidos
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

  // Para el equipo, la barra es la de una app de macOS: semáforos, secciones al centro y el avatar.
  const secciones = isEquipo
    ? [
        ['/mensajes', 'Mensajes', contador],
        ['/classroom', 'Classroom'],
        ...(isAdmin
          ? [
              ['/admin/equipo', 'Equipo'],
              ['/admin', 'Módulos', null, true],
            ]
          : []),
      ]
    : null

  return (
    <header className={`app-header${isEquipo ? ' app-header--mac' : ''}`}>
      <div className="app-header__left">
        {isEquipo ? (
          <span className="mac-semaforo" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        ) : null}
        <Link to="/" className="app-header__logo" aria-label="Inicio ATV">
          <img src="/atv-logo.png" alt="" className="app-header__logo-img" />
        </Link>
      </div>

      {secciones ? (
        <nav className="mac-nav" aria-label="Secciones">
          {secciones.map(([to, label, cuenta, exacta]) => (
            <NavLink key={to} to={to} end={Boolean(exacta)} className={({ isActive }) => (isActive ? 'is-on' : '')}>
              {label}
              {cuenta ? <span className="mac-nav__cuenta">{cuenta > 99 ? '99+' : cuenta}</span> : null}
            </NavLink>
          ))}
        </nav>
      ) : null}

      <div className="app-header__right">
      {habilitada && !isEquipo ? (
        <NavLink to="/mensajes" className={({ isActive }) => `app-header__mensajes${isActive ? ' is-on' : ''}`}>
          Mensajes
          {contador ? (
            <span className="msj-cuenta" aria-label={isEquipo && !isAdmin ? `${contador} alertas sin responder` : `${contador} sin leer`}>
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
            {isAdmin && !secciones ? (
              <Link
                to="/admin"
                className="app-header__menu-link"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                Configuración de módulos
              </Link>
            ) : null}
            {isAdmin && !secciones ? (
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
