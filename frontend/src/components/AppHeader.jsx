import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEscritorio } from '../context/EscritorioContext'
import { useMensajeria } from '../context/MensajeriaContext'
import '../styles/mensajes.css'
import { getUserInitials } from '../utils/user'

const PLANES = { advantage: 'High Level', high: 'High Level', boost: 'Boost', mid: 'Mid level', entry: 'Entry level', mentoria: 'Mentoria' }

export default function AppHeader() {
  const { user, logout, isAdmin, isEquipo } = useAuth()
  const { resumen, habilitada } = useMensajeria()
  const escritorio = useEscritorio()
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
  // En el escritorio se navega con el Dock; sin escritorio (pantallas chicas) quedan las secciones.
  const secciones = isEquipo && !escritorio
    ? [
        ['/mensajes', 'Mensajes', contador],
        ['/classroom', 'Classroom'],
        ...(isAdmin
          ? [
              ['/admin/cerebro', 'Cerebro'],
              ['/admin/equipo', 'Equipo'],
              ['/admin', 'Módulos', null, true],
            ]
          : []),
      ]
    : null

  return (
    <header
      className={`app-header${isEquipo ? ' app-header--mac' : ''}`}
      onDoubleClick={(e) => {
        // Como en macOS: doble clic en la barra de título agranda o achica la ventana.
        if (escritorio && e.target === e.currentTarget) escritorio.alternarTamano()
      }}
    >
      <div className="app-header__left">
        {isEquipo && escritorio ? (
          <span className="mac-semaforo">
            <button type="button" onClick={escritorio.cerrar} aria-label="Cerrar ventana" title="Cerrar">
              <svg viewBox="0 0 8 8" aria-hidden="true">
                <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
            <button type="button" onClick={escritorio.minimizar} aria-label="Minimizar ventana" title="Minimizar">
              <svg viewBox="0 0 8 8" aria-hidden="true">
                <path d="M1.2 4h5.6" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
            <button
              type="button"
              onClick={escritorio.alternarTamano}
              aria-label={escritorio.tamano === 'max' ? 'Achicar ventana' : 'Agrandar ventana'}
              title={escritorio.tamano === 'max' ? 'Achicar' : 'Agrandar'}
            >
              <svg viewBox="0 0 8 8" aria-hidden="true">
                <path d="M2 1.5h4.5V6zM6 6.5H1.5V2z" fill="currentColor" />
              </svg>
            </button>
          </span>
        ) : isEquipo ? (
          <span className="mac-semaforo" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        ) : (
          <Link to="/" className="app-header__logo" aria-label="Inicio ATV">
            <img src="/atv-logo.png" alt="" className="app-header__logo-img" />
          </Link>
        )}
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
      ) : isEquipo ? (
        <span aria-hidden="true" />
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
            <div className="app-header__menu-perfil">
              <span className="app-header__menu-foto" aria-hidden="true">
                {user?.foto_url ? <img src={user.foto_url} alt="" referrerPolicy="no-referrer" /> : initials}
              </span>
              <div className="app-header__menu-quien">
                {user?.nombre ? <p className="app-header__menu-name">{user.nombre}</p> : null}
                {user?.email ? (
                  <p className="app-header__menu-email" title={user.email}>
                    {user.email}
                  </p>
                ) : null}
              </div>
            </div>
            {!isEquipo && (PLANES[user?.rol] || user?.dias_restantes != null) ? (
              <div className="app-header__menu-plan">
                {PLANES[user?.rol] ? <span className="app-header__menu-chip">{PLANES[user.rol]}</span> : null}
                {user?.dias_restantes != null ? (
                  <span className={user.dias_restantes <= 15 ? 'is-poco' : ''}>
                    {user.dias_restantes < 0 ? 'Acceso vencido' : `${user.dias_restantes} ${user.dias_restantes === 1 ? 'día' : 'días'} de acceso`}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="app-header__menu-sep" />
            <Link to="/cuenta" className="app-header__menu-link" role="menuitem" onClick={() => setMenuOpen(false)}>
              Mi cuenta
            </Link>
            {isAdmin && !secciones && !escritorio ? (
              <Link
                to="/admin"
                className="app-header__menu-link"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                Configuración de módulos
              </Link>
            ) : null}
            {isAdmin && !secciones && !escritorio ? (
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
