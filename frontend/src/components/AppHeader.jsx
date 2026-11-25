import { createPortal } from 'react-dom'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEscritorio } from '../context/EscritorioContext'
import { useMensajeria } from '../context/MensajeriaContext'
import '../styles/mensajes.css'
import '../styles/barra-safari.css'
import { getUserInitials } from '../utils/user'
import Isotipo from './marca/Isotipo'
import { elegirModo, modoActual } from '../utils/modo'


// Íconos de la barra de abajo del equipo en el celular (mismo trazo que los del cliente).
const ICONOS_EQUIPO = {
  '/mensajes': <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14v10H9l-4 3z" /></svg>,
  '/classroom': <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M10 9.5v5l4-2.5z" /></svg>,
  '/consultas': <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></svg>,
  '/admin/cerebro': <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2.2" /><circle cx="5.5" cy="6.5" r="1.6" /><circle cx="18.5" cy="6.5" r="1.6" /><circle cx="6" cy="18" r="1.6" /><circle cx="18" cy="17.5" r="1.6" /><path d="M10.4 10.6 6.7 7.6M13.6 10.6l3.7-3M10.5 13.5 7.2 16.9M13.6 13.4l3.2 3.1" /></svg>,
  '/admin/equipo': <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="9" r="3" /><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" /><circle cx="16.5" cy="8" r="2.4" /><path d="M16 13.2c2.3 0 4 1.2 4.5 3.8" /></svg>,
  '/admin': <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>,
}

const PLANES = { advantage: 'High Level', high: 'High Level', boost: 'Boost', mid: 'Mid level', entry: 'Entry level', mentoria: 'Mentoria', '2k': '2K' }

export default function AppHeader() {
  const { user, logout, isAdmin, isEquipo } = useAuth()
  // Lo que su plan tiene apagado en Permisos (admin) no aparece en el menú.
  // Tools aparece cuando un admin prende la sección (Admin → Tools).
  const conTools = !isEquipo && user?.permisos?.tools === 'si'
  const conRoadmap = isEquipo || (user?.permisos?.roadmaps ?? (user?.rol === '2k' ? 'no' : 'si')) !== 'no'
  const { resumen, habilitada, directosSinLeer } = useMensajeria()
  const escritorio = useEscritorio()
  // Como en Discord, el número baja al leer: mensajes sin leer, para todos (antes el coach veía los chats
  // esperando respuesta de cualquier cliente y no tenía cómo hacerlo bajar).
  const contador = resumen.no_leidos
  const navigate = useNavigate()
  // Como la flecha de Finder: vuelve a la pantalla anterior sin cerrar la ventana. Solo si hay a dónde volver.
  // React Router guarda en history.state.idx cuántas pantallas recorriste en la app: con 0 no hay a dónde volver.
  const location = useLocation()
  const tipoNavegacion = useNavigationType()
  const idx = window.history.state?.idx ?? 0
  const hayAtras = idx > 0
  // Adelante, como en Safari: solo si volviste y todavía hay pantallas adelante. Una navegación nueva
  // borra lo que había adelante, así que ahí el tope vuelve a ser la pantalla actual.
  const topeRef = useRef(idx)
  if (tipoNavegacion === 'PUSH' || tipoNavegacion === 'REPLACE') topeRef.current = idx
  else topeRef.current = Math.max(topeRef.current, idx)
  const hayAdelante = topeRef.current > idx
  const [copiado, setCopiado] = useState(false)
  function copiarDireccion() {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1400)
    }, () => {})
  }
  const [menuOpen, setMenuOpen] = useState(false)
  const [modo, setModo] = useState(modoActual)
  const cambiarModo = (m) => {
    elegirModo(m)
    setModo(m)
  }
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
  // Dos grupos, como en el Dock: lo común (lo que también ven los clientes) y, después de la línea, lo del
  // equipo (Consultas) y, para el admin, la administración. El quinto valor marca dónde empieza el segundo grupo.
  const secciones = isEquipo && !escritorio
    ? [
        ['/mensajes', 'Mensajes', contador],
        ['/classroom', 'Classroom'],
        ['/consultas', 'Consultas', null, false, true],
        ...(isAdmin
          ? [
              ['/admin/cerebro', 'Cerebro'],
              ['/admin/equipo', 'Equipo'],
              ['/admin', 'Módulos', null, true],
            ]
          : []),
      ]
    : null
  const seccionActual = secciones?.find(([to, , , exacta]) =>
    exacta ? location.pathname === to : location.pathname === to || location.pathname.startsWith(`${to}/`),
  )

  return (
    <header
      className={`app-header${isEquipo ? ' app-header--mac is-safari' : ' app-header--cliente'}`}
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
            <Isotipo className="app-header__logo-img" />
          </Link>
        )}
        {isEquipo ? (
          <span className="safari-flechas">
            <button type="button" onClick={() => navigate(-1)} disabled={!hayAtras} aria-label="Volver a la pantalla anterior" title="Atrás">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button type="button" onClick={() => navigate(1)} disabled={!hayAdelante} aria-label="Ir a la pantalla siguiente" title="Adelante">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </span>
        ) : null}
      </div>

      {secciones ? (
        // Celular: arriba solo el isotipo y la sección en la que está; las secciones bajan a la barra de abajo.
        <span className="mac-titulo-movil">
          <Isotipo className="mac-titulo-movil__iso" />
          <b>{seccionActual?.[1] || 'ATV'}</b>
        </span>
      ) : null}
      {secciones ? (
        <nav className="mac-nav" aria-label="Secciones">
          {secciones.map(([to, label, cuenta, exacta, grupo]) => (
            <Fragment key={to}>
              {grupo ? <i className="mac-nav__separador" aria-hidden="true" /> : null}
              <NavLink to={to} end={Boolean(exacta)} className={({ isActive }) => (isActive ? 'is-on' : '')}>
                {label}
                {cuenta ? <span className="mac-nav__cuenta">{cuenta > 99 ? '99+' : cuenta}</span> : null}
              </NavLink>
            </Fragment>
          ))}
        </nav>
      ) : isEquipo ? (
        // La barra de direcciones de Safari: el dominio real con el candado. Un clic copia el link de
        // la pantalla (sirve para pasarle a alguien del equipo el chat exacto).
        <button
          type="button"
          className={`safari-url${copiado ? ' is-copiado' : ''}`}
          onClick={copiarDireccion}
          title="Copiar el link de esta pantalla"
          aria-label={`Copiar el link: ${window.location.host}${location.pathname}`}
        >
          <svg className="safari-url__candado" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
            <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
          </svg>
          <span className="safari-url__texto">{copiado ? 'Link copiado' : window.location.host}</span>
        </button>
      ) : (
        // Cliente: el menú al centro, en píldoras (Brand System, maqueta A).
        <nav className="cliente-nav" aria-label="Secciones">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-on' : '')}>Inicio</NavLink>
          <NavLink to="/classroom" className={({ isActive }) => (isActive ? 'is-on' : '')}>Material</NavLink>
          {conRoadmap ? <NavLink to="/roadmap" className={({ isActive }) => (isActive ? 'is-on' : '')}>Roadmap</NavLink> : null}
          {conTools ? <NavLink to="/tools" className={({ isActive }) => (isActive ? 'is-on' : '')}>Tools</NavLink> : null}
          {habilitada ? (
            <NavLink to="/mensajes" className={({ isActive }) => (isActive ? 'is-on' : '')}>
              Mensajes
              {contador ? (
                <span className="msj-cuenta" aria-label={`${contador} sin leer`}>
                  {contador > 99 ? '99+' : contador}
                </span>
              ) : null}
            </NavLink>
          ) : null}
        </nav>
      )}

      {secciones ? createPortal(
        // El equipo sin escritorio (celular): las mismas secciones de arriba, abajo y con ícono, como el cliente.
        <nav className="cliente-tabs cliente-tabs--equipo" aria-label="Secciones">
          {secciones.map(([to, label, cuenta, exacta, grupo]) => (
            <NavLink key={to} to={to} end={Boolean(exacta)} className={({ isActive }) => `${isActive ? 'is-on' : ''}${grupo ? ' is-grupo' : ''}`}>
              {cuenta ? <span className="cliente-tabs__cuenta">{cuenta > 99 ? '99+' : cuenta}</span> : null}
              {ICONOS_EQUIPO[to]}
              {label}
            </NavLink>
          ))}
        </nav>,
        document.body,
      ) : null}

      {!isEquipo && !secciones ? createPortal(
        // En el celular el menú del cliente va abajo, al alcance del pulgar (como una app). Va directo en
        // <body>: adentro de Mensajes (que recorta lo que sobresale) el iPhone no la mostraba.
        <nav className="cliente-tabs" aria-label="Secciones">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-on' : '')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></svg>
            Inicio
          </NavLink>
          <NavLink to="/classroom" className={({ isActive }) => (isActive ? 'is-on' : '')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M10 9.5v5l4-2.5z" /></svg>
            Material
          </NavLink>
          {conRoadmap ? (
            <NavLink to="/roadmap" className={({ isActive }) => (isActive ? 'is-on' : '')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c3-1 3-6 7-7s4-6 7-7" /><circle cx="5" cy="19" r="1.6" /><circle cx="19" cy="5" r="1.6" /></svg>
              Roadmap
            </NavLink>
          ) : null}
          {conTools ? (
            <NavLink to="/tools" className={({ isActive }) => (isActive ? 'is-on' : '')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-3-1-1-3z" /></svg>
              Tools
            </NavLink>
          ) : null}
          {habilitada ? (
            <NavLink to="/mensajes" className={({ isActive }) => (isActive ? 'is-on' : '')}>
              {contador ? <span className="cliente-tabs__cuenta">{contador > 99 ? '99+' : contador}</span> : null}
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14v10H9l-4 3z" /></svg>
              Mensajes
            </NavLink>
          ) : null}
        </nav>,
        document.body,
      ) : null}

      <div className="app-header__right">
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
          {isEquipo && directosSinLeer ? (
            <span className="app-header__punto" aria-label={`${directosSinLeer} ${directosSinLeer === 1 ? 'chat directo' : 'chats directos'} sin leer`}>
              {directosSinLeer > 9 ? '9+' : directosSinLeer}
            </span>
          ) : null}
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
                {!user?.miembro && PLANES[user?.rol] ? <span className="app-header__menu-chip">{PLANES[user.rol]}</span> : null}
                {user?.dias_restantes != null ? (
                  <span className={user.dias_restantes <= 15 ? 'is-poco' : ''}>
                    {user.dias_restantes < 0 ? 'Acceso vencido' : `${user.dias_restantes} ${user.dias_restantes === 1 ? 'día' : 'días'} de acceso`}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="app-header__menu-sep" />
            <div className="app-header__modo" role="group" aria-label="Modo de color">
              <span>Modo</span>
              <div>
                {[['claro', 'Claro'], ['oscuro', 'Oscuro'], ['auto', 'Auto']].map(([m, nombre]) => (
                  <button
                    key={m}
                    type="button"
                    className={modo === m ? 'is-on' : ''}
                    aria-pressed={modo === m}
                    title={m === 'auto' ? 'Oscuro de 20 a 7 h' : undefined}
                    onClick={() => cambiarModo(m)}
                  >
                    {nombre}
                  </button>
                ))}
              </div>
            </div>
            {isEquipo && habilitada ? (
              <Link to="/mensajes?v=directos" className="app-header__menu-link app-header__menu-link--directos" role="menuitem" onClick={() => setMenuOpen(false)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22 2 11 13" />
                  <path d="M22 2 15 22l-4-9-9-4z" />
                </svg>
                <span>Mensajes directos</span>
                {directosSinLeer ? <b className="app-header__menu-cuenta">{directosSinLeer > 99 ? '99+' : directosSinLeer}</b> : null}
              </Link>
            ) : null}
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
