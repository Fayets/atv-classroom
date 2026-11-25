import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { fetchProgramas } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useMensajeria } from '../context/MensajeriaContext'
import { elegirModo, modoActual } from '../utils/modo'
import { getUserInitials } from '../utils/user'
import Isotipo from './marca/Isotipo'
import { abrirCarpeta } from './mac/HerramientasEquipo'
import '../styles/sidebar.css'

// La barra lateral de la app (rediseño 2026-11, styles/sidebar.css), para el cliente y el equipo.
//   - PC: fija a la izquierda. Arriba la "credencial" (ATV, tu programa y los días que quedan), el buscador
//     (le pregunta a la guía), las secciones con una píldora roja que se desliza a la activa, "Tu material" como
//     un árbol de módulos con su avance, y abajo tu cuenta: Mi cuenta, el modo de color y cerrar sesión.
//   - Se pliega a un riel de íconos (botón de arriba, queda guardado); en tablet arranca plegada.
//   - Celular: es un cajón que se abre desde el botón de menú de la barra de arriba (la barra de abajo sigue).
// Referencias: la "credencial" de cuenta de Cora, el riel de íconos + panel de Pipefy y el árbol de carpetas de
// las bases de conocimiento, en los colores y la letra de ATV.

const PLANES = { advantage: 'High Level', high: 'High Level', boost: 'Boost', mid: 'Mid level', entry: 'Entry level', mentoria: 'Mentoria', '2k': '2K' }
const CLAVE_RIEL = 'atv_sb_riel'

const I = {
  inicio: <path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  material: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M10 9.5v5l4-2.5z" /></>,
  roadmap: <><path d="M5 19c3-1 3-6 7-7s4-6 7-7" /><circle cx="5" cy="19" r="1.6" /><circle cx="19" cy="5" r="1.6" /></>,
  tools: <path d="M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-3-1-1-3z" />,
  mensajes: <path d="M5 6h14v10H9l-4 3z" />,
  consultas: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
  cerebro: <><circle cx="12" cy="12" r="2.2" /><circle cx="5.5" cy="6.5" r="1.6" /><circle cx="18.5" cy="6.5" r="1.6" /><circle cx="6" cy="18" r="1.6" /><circle cx="18" cy="17.5" r="1.6" /><path d="M10.4 10.6 6.7 7.6M13.6 10.6l3.7-3M10.5 13.5 7.2 16.9M13.6 13.4l3.2 3.1" /></>,
  equipo: <><circle cx="9" cy="9" r="3" /><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" /><circle cx="16.5" cy="8" r="2.4" /><path d="M16 13.2c2.3 0 4 1.2 4.5 3.8" /></>,
  modulos: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  cuenta: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></>,
  directos: <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></>,
  salir: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l5-5-5-5M15 12H4" /></>,
  sol: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  luna: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  auto: <><circle cx="12" cy="12" r="8" /><path d="M12 4v16a8 8 0 0 0 0-16z" fill="currentColor" stroke="none" /></>,
  buscar: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></>,
  plegar: <><rect x="3.5" y="4" width="17" height="16" rx="3" /><path d="M9.5 4v16" /></>,
  candado: <><rect x="6" y="11" width="12" height="9" rx="2" /><path d="M9 11V8a3 3 0 0 1 6 0v3" /></>,
  chevron: <path d="M9 6l6 6-6 6" />,
  carpeta: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  libro: <><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" /></>,
  mas: <path d="M12 5v14M5 12h14" />,
}
const Icono = ({ n }) => <svg viewBox="0 0 24 24" aria-hidden="true">{I[n]}</svg>

// Los módulos se piden una vez por sesión de la página (la barra se vuelve a montar en cada pantalla).
let modulosCache = null
function useModulos(activo) {
  const [modulos, setModulos] = useState(() => (Array.isArray(modulosCache) ? modulosCache : null))
  useEffect(() => {
    if (!activo) return
    if (Array.isArray(modulosCache)) return
    if (!modulosCache) modulosCache = fetchProgramas().then((d) => (modulosCache = Array.isArray(d) ? d : []))
    let vivo = true
    Promise.resolve(modulosCache).then((d) => vivo && Array.isArray(d) && setModulos(d)).catch(() => (modulosCache = null))
    return () => {
      vivo = false
    }
  }, [activo])
  return modulos
}

function useRiel() {
  const [preferido, setPreferido] = useState(() => {
    const v = localStorage.getItem(CLAVE_RIEL)
    return v === '1' ? true : v === '0' ? false : null
  })
  const [angosto, setAngosto] = useState(() => window.matchMedia('(max-width: 1099px)').matches)
  const [movil, setMovil] = useState(() => window.matchMedia('(max-width: 720px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1099px)')
    const mm = window.matchMedia('(max-width: 720px)')
    const cambiar = () => {
      setAngosto(mq.matches)
      setMovil(mm.matches)
    }
    mq.addEventListener('change', cambiar)
    mm.addEventListener('change', cambiar)
    return () => {
      mq.removeEventListener('change', cambiar)
      mm.removeEventListener('change', cambiar)
    }
  }, [])
  // En el celular es un cajón: siempre desplegado.
  const riel = !movil && (preferido ?? angosto)
  const alternar = () => {
    localStorage.setItem(CLAVE_RIEL, riel ? '0' : '1')
    setPreferido(!riel)
  }
  return [riel, alternar]
}

// Un anillo chico con el avance del módulo (o un candado si está cerrado).
function MiniAnillo({ pct, cerrado }) {
  if (cerrado) return <span className="sb-mod__ico is-cerrado"><Icono n="candado" /></span>
  const R = 7
  const largo = 2 * Math.PI * R
  return (
    <svg className={`sb-mod__ico${pct >= 100 ? ' is-completo' : ''}`} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r={R} className="sb-mod__pista" />
      <circle cx="10" cy="10" r={R} className="sb-mod__arco" strokeDasharray={`${(largo * pct) / 100} ${largo}`} transform="rotate(-90 10 10)" />
    </svg>
  )
}

export default function Sidebar() {
  const { user, logout, isAdmin, isEquipo } = useAuth()
  const { resumen, habilitada, directosSinLeer } = useMensajeria()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [riel, alternarRiel] = useRiel()
  const [modo, setModo] = useState(modoActual)
  // "Tu material" abierto o cerrado (como carpeta); queda guardado en este dispositivo.
  const [arbol, setArbolEstado] = useState(() => localStorage.getItem('atv_sb_material') !== '0')
  const setArbol = (abierto) => {
    localStorage.setItem('atv_sb_material', abierto ? '1' : '0')
    setArbolEstado(abierto)
  }
  // Celular: el cajón se abre con el botón de menú de la barra de arriba (AppHeader manda "atv:menu").
  const [cajonAbierto, setCajon] = useState(false)
  const onCerrarCajon = () => setCajon(false)
  useEffect(() => {
    const alternar = () => setCajon((v) => !v)
    window.addEventListener('atv:menu', alternar)
    return () => window.removeEventListener('atv:menu', alternar)
  }, [])
  const modulos = useModulos(true)
  const lista = useRef(null)
  const pildora = useRef(null)

  const conTools = !isEquipo && user?.permisos?.tools === 'si'
  const conRoadmap = !isEquipo && (user?.permisos?.roadmaps ?? (user?.rol === '2k' ? 'no' : 'si')) !== 'no'
  const conGuia = !isEquipo && (user?.permisos?.ia ?? (user?.rol === '2k' ? 'no' : 'si')) !== 'no'
  const contador = resumen.no_leidos

  // Las secciones en grupos: lo de todos y, para el equipo, sus herramientas (y las del admin).
  const grupos = isEquipo
    ? [
        ['General', [['/mensajes', 'Mensajes', 'mensajes', contador], ['/classroom', 'Classroom', 'material']]],
        [
          isAdmin ? 'Equipo y admin' : 'Equipo',
          [
            ['/consultas', 'Consultas', 'consultas'],
            ...(isAdmin
              ? [['/admin/cerebro', 'Cerebro', 'cerebro'], ['/admin/equipo', 'Equipo', 'equipo'], ['/admin', 'Módulos', 'modulos', null, true]]
              : []),
          ],
        ],
      ]
    : [
        [
          'Tu espacio',
          [
            ['/', 'Inicio', 'inicio', null, true],
            ['/classroom', 'Material', 'material'],
            ...(conRoadmap ? [['/roadmap', 'Roadmap', 'roadmap']] : []),
            ...(conTools ? [['/tools', 'Tools', 'tools']] : []),
            ...(habilitada ? [['/mensajes', 'Mensajes', 'mensajes', contador]] : []),
          ],
        ],
      ]

  // La píldora se desliza hasta la sección activa: se mide la fila activa en cada cambio de pantalla y cuando la
  // lista cambia de tamaño (al cargar la letra, al plegar la barra).
  const medirPildora = () => {
    const activa = lista.current?.querySelector('.sb-item.is-on')
    const p = pildora.current
    if (!p) return
    if (!activa) {
      p.style.opacity = '0'
      return
    }
    p.style.opacity = '1'
    // Medida contra la lista (las filas van dentro de las bandejas de cada grupo).
    const caja = lista.current.getBoundingClientRect()
    const fila = activa.getBoundingClientRect()
    p.style.transform = `translate(${fila.left - caja.left}px, ${fila.top - caja.top}px)`
    p.style.width = `${fila.width}px`
    p.style.height = `${fila.height}px`
  }
  useLayoutEffect(medirPildora)
  useEffect(() => {
    if (!lista.current) return undefined
    const ro = new ResizeObserver(() => medirPildora())
    ro.observe(lista.current)
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ⌘K / Ctrl+K: al buscador de la guía del inicio.
  useEffect(() => {
    if (!conGuia) return undefined
    const tecla = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        irAlBuscador()
      }
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  })

  // Cerrar el cajón (celular) al cambiar de pantalla.
  useEffect(() => {
    setCajon(false)
  }, [pathname])

  function irAlBuscador() {
    if (pathname !== '/') navigate('/')
    setTimeout(() => document.getElementById('im-q')?.focus(), pathname === '/' ? 0 : 250)
    onCerrarCajon?.()
  }

  function cambiarModo() {
    const siguiente = modo === 'claro' ? 'oscuro' : modo === 'oscuro' ? 'auto' : 'claro'
    elegirModo(siguiente)
    setModo(siguiente)
  }

  function salir() {
    logout()
    navigate('/login', { replace: true })
  }

  const plan = isEquipo ? (isAdmin ? 'Administrador' : 'Coach') : PLANES[user?.rol] || 'Tu programa'
  const dias = !isEquipo && user?.dias_restantes != null ? user.dias_restantes : null
  const abiertos = (modulos || []).filter((m) => m.total_clases)
  // El avance de todo el material (módulos no bloqueados), para el frente de la carpeta cerrada.
  const disponibles = abiertos.filter((m) => !m.bloqueado)
  const totalClases = disponibles.reduce((n, m) => n + m.total_clases, 0)
  const avanceTotal = totalClases
    ? Math.round((100 * disponibles.reduce((n, m) => n + (m.total_clases * (m.porcentaje_progreso || 0)) / 100, 0)) / totalClases)
    : null

  return createPortal(
    <>
      <div className={`sb-fondo${cajonAbierto ? ' is-abierto' : ''}`} onClick={onCerrarCajon} aria-hidden="true" />
      <aside className={`sb${riel ? ' is-riel' : ''}${cajonAbierto ? ' is-cajon' : ''}${isEquipo ? ' is-equipo' : ''}`} aria-label="Navegación principal">
        <div className="sb-cab">
          <div className="sb-cred" title={plan}>
            <span className="sb-cred__logo" aria-hidden="true"><Isotipo className="sb-cred__iso" /></span>
            <span className="sb-cred__txt">
              <b>ATV Classroom</b>
              <small>
                {plan}
                {dias != null ? <> · <span className={dias <= 15 ? 'is-poco' : ''}>{dias < 0 ? 'vencido' : `${dias} ${dias === 1 ? 'día' : 'días'}`}</span></> : null}
              </small>
            </span>
          </div>
          <button type="button" className="sb-plegar" onClick={cajonAbierto ? onCerrarCajon : alternarRiel} aria-label={cajonAbierto ? 'Cerrar el menú' : riel ? 'Desplegar la barra lateral' : 'Plegar la barra lateral'} title={riel ? 'Desplegar' : 'Plegar'}>
            <Icono n="plegar" />
          </button>
        </div>

        {conGuia ? (
          <button type="button" className="sb-buscar" onClick={irAlBuscador} title="Buscar un SOP o preguntarle a la guía">
            <Icono n="buscar" />
            <span>Buscar o preguntar</span>
            <kbd>⌘K</kbd>
          </button>
        ) : null}

        <nav className="sb-nav" ref={lista}>
          <span className="sb-pildora" ref={pildora} aria-hidden="true" />
          {grupos.map(([titulo, items]) => (
            <div key={titulo} className="sb-grupo">
              <p className="sb-etq">{titulo}</p>
              {items.map(([to, label, icono, cuenta, exacta]) => (
                <NavLink key={to} to={to} end={Boolean(exacta)} className={({ isActive }) => `sb-item${isActive ? ' is-on' : ''}`} title={riel ? label : undefined}>
                  <Icono n={icono} />
                  <span className="sb-item__txt">{label}</span>
                  {cuenta ? <b className="sb-cuenta num">{cuenta > 99 ? '99+' : cuenta}</b> : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Equipo: las carpetas y apps que antes estaban en el escritorio de macOS. Se abren como ventanas. */}
        {isEquipo ? (
          <div className="sb-grupo sb-grupo--carpetas">
            <p className="sb-etq">Carpetas</p>
            {[
              ...(isAdmin ? [['clientes', 'Clientes'], ['contratos', 'Contratos'], ['cierres', 'Cierres de mes']] : []),
              ['onboardings', 'Onboardings'],
              ['llamadas', 'Llamadas'],
              ['cuellos', 'Cuellos de botella'],
              ['sops', 'SOPs solicitados'],
              ['biblioteca', 'Biblioteca', 'libro'],
              ['alta', 'Nuevo onboarding', 'mas'],
              ...(isAdmin ? [['clase', 'Nueva clase', 'mas']] : []),
            ].map(([id, label, icono = 'carpeta']) => (
              <button key={id} type="button" className={`sb-item sb-item--carpeta${icono === 'mas' ? ' is-crear' : ''}`} onClick={() => abrirCarpeta(id)} title={riel ? label : undefined}>
                <span className="sb-carpeta"><Icono n={icono} /></span>
                <span className="sb-item__txt">{label}</span>
              </button>
            ))}
          </div>
        ) : null}

        {/* "Tu material": abierto, los módulos como un árbol con su avance; cerrado, una carpeta entera con el
            nombre y el resumen escritos en el frente (al pasar el mouse asoman las hojas). */}
        {abiertos.length && !arbol ? (
          <button type="button" className="sb-folder" onClick={() => setArbol(true)} aria-expanded="false" title="Abrir">
            <span className="sb-folder__atras" aria-hidden="true" />
            <span className="sb-folder__hojas" aria-hidden="true">
              <i />
              <i />
            </span>
            <span className="sb-folder__frente">
              <b>{isEquipo ? 'Módulos del classroom' : 'Tu material'}</b>
              <small>
                <span className="num">{abiertos.length}</span> módulos
                {!isEquipo && avanceTotal != null ? <> · <span className="num">{avanceTotal}%</span> hecho</> : null}
              </small>
            </span>
          </button>
        ) : null}
        {abiertos.length && arbol ? (
          <section className="sb-arbol">
            <button type="button" className="sb-etq sb-arbol__cab" onClick={() => setArbol(false)} aria-expanded="true">
              <span className={`sb-arbol__flecha${arbol ? ' is-abierto' : ''}`}><Icono n="chevron" /></span>
              {isEquipo ? 'Módulos del classroom' : 'Tu material'}
            </button>
            {arbol ? (
              <ul>
                {abiertos.map((m) => {
                  const pct = Math.min(100, Math.max(0, m.porcentaje_progreso ?? 0))
                  const hechas = Math.round((m.total_clases * pct) / 100)
                  return (
                    <li key={m.id}>
                      {m.bloqueado ? (
                        <span className="sb-mod is-cerrado" title={`${m.titulo}: bloqueado`}>
                          <MiniAnillo cerrado />
                          <span className="sb-mod__txt">{m.titulo}</span>
                        </span>
                      ) : (
                        <NavLink to={`/classroom/${m.id}`} className={({ isActive }) => `sb-mod${isActive ? ' is-on' : ''}`} title={`${m.titulo}: ${hechas} de ${m.total_clases} clases`}>
                          <MiniAnillo pct={pct} />
                          <span className="sb-mod__txt">{m.titulo}</span>
                          {isEquipo ? <span className="sb-mod__n num">{m.total_clases}</span> : <span className="sb-mod__n num">{hechas}/{m.total_clases}</span>}
                        </NavLink>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </section>
        ) : null}

        <div className="sb-pie">
          <NavLink to="/cuenta" className={({ isActive }) => `sb-yo${isActive ? ' is-on' : ''}`} title="Mi cuenta">
            <span className="sb-yo__av" aria-hidden="true">
              {user?.foto_url ? <img src={user.foto_url} alt="" referrerPolicy="no-referrer" /> : getUserInitials(user?.nombre)}
            </span>
            <span className="sb-yo__txt">
              <b>{user?.nombre || 'Mi cuenta'}</b>
              <small>Mi cuenta y configuración</small>
            </span>
          </NavLink>
          <div className="sb-acciones">
            {isEquipo && habilitada ? (
              <NavLink to="/mensajes?v=directos" className="sb-accion" title="Mensajes directos" aria-label="Mensajes directos">
                <Icono n="directos" />
                {directosSinLeer ? <i className="sb-accion__punto" /> : null}
              </NavLink>
            ) : null}
            <button type="button" className="sb-accion" onClick={cambiarModo} title={`Modo: ${modo} (tocá para cambiar)`} aria-label={`Modo de color: ${modo}. Cambiar`}>
              <Icono n={modo === 'oscuro' ? 'luna' : modo === 'auto' ? 'auto' : 'sol'} />
            </button>
            <button type="button" className="sb-accion" onClick={salir} title="Cerrar sesión" aria-label="Cerrar sesión">
              <Icono n="salir" />
            </button>
          </div>
        </div>
      </aside>
    </>,
    document.body,
  )
}
