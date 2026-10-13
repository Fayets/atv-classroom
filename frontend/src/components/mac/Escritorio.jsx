import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useEscritorio } from '../../context/EscritorioContext'
import { useMensajeria } from '../../context/MensajeriaContext'
import '../../styles/escritorio.css'

const ICONOS = {
  mensajes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z" />
    </svg>
  ),
  classroom: (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="13" rx="2.5" />
      <path d="M10.5 8.5v5l4-2.5z" fill="#fff" stroke="none" />
      <path d="M8 20.5h8" />
    </svg>
  ),
  equipo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <circle cx="16.5" cy="9.5" r="2.5" />
      <path d="M15.5 14.2A4.5 4.5 0 0 1 20.5 19" />
    </svg>
  ),
  modulos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  ),
}

function seccionDe(ruta) {
  if (ruta.startsWith('/mensajes')) return 'mensajes'
  if (ruta.startsWith('/admin/equipo')) return 'equipo'
  if (ruta.startsWith('/admin')) return 'modulos'
  return 'classroom'
}

// El panel del equipo como un escritorio de macOS: barra de menú, una ventana con la sección y el Dock.
export default function Escritorio({ children }) {
  const { isAdmin } = useAuth()
  const { resumen } = useMensajeria()
  const { tamano, visible, abrir } = useEscritorio()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const actual = seccionDe(pathname)

  const apps = [
    { id: 'mensajes', nombre: 'Mensajes', ruta: '/mensajes', cuenta: resumen.esperando && !isAdmin ? resumen.esperando : resumen.no_leidos },
    { id: 'classroom', nombre: 'Classroom', ruta: '/classroom' },
    ...(isAdmin
      ? [
          { id: 'equipo', nombre: 'Equipo', ruta: '/admin/equipo' },
          { id: 'modulos', nombre: 'Módulos', ruta: '/admin' },
        ]
      : []),
  ]

  // Como en macOS con "ocultar Dock": aparece al acercar el mouse al borde de abajo y se va al salir.
  // Con la ventana minimizada o cerrada queda siempre a la vista (no hay otra forma de volver).
  const [dockVisible, setDockVisible] = useState(false)
  const ocultar = useRef(null)
  const iconos = useRef([])
  const fijo = visible !== 'abierta'

  function mostrarDock() {
    clearTimeout(ocultar.current)
    setDockVisible(true)
  }
  function esconderDock() {
    clearTimeout(ocultar.current)
    ocultar.current = setTimeout(() => setDockVisible(false), 350)
    lupa(null)
  }
  useEffect(() => () => clearTimeout(ocultar.current), [])

  // Lupa del Dock: cada ícono crece según qué tan cerca está el mouse.
  function lupa(x) {
    iconos.current.forEach((el) => {
      if (!el) return
      if (x == null) {
        el.style.setProperty('--zoom', 1)
        return
      }
      const r = el.getBoundingClientRect()
      const distancia = Math.abs(x - (r.left + r.width / 2))
      el.style.setProperty('--zoom', 1 + 0.55 * Math.max(0, 1 - distancia / 150))
    })
  }

  function abrirApp(app) {
    if (app.id !== actual) navigate(app.ruta)
    abrir()
  }

  return (
    <div className="esc">
      <div className={`esc-ventana is-${tamano} is-${visible}`} aria-hidden={visible !== 'abierta'}>
        {children}
      </div>

      {visible === 'cerrada' ? (
        <p className="esc-vacio">La ventana está cerrada. Abrila desde el Dock.</p>
      ) : null}

      <div className="esc-borde" onMouseEnter={mostrarDock} aria-hidden="true" />
      <nav
        className={`esc-dock${dockVisible || fijo ? ' is-visible' : ''}`}
        aria-label="Dock"
        onMouseEnter={mostrarDock}
        onMouseLeave={esconderDock}
        onMouseMove={(e) => lupa(e.clientX)}
        onFocus={mostrarDock}
        onBlur={esconderDock}
      >
        {apps.map((app, i) => {
          const abierta = app.id === actual && visible !== 'cerrada'
          return (
            <button
              key={app.id}
              ref={(el) => {
                iconos.current[i] = el
              }}
              type="button"
              className={`esc-dock__app is-${app.id}`}
              onClick={() => abrirApp(app)}
              aria-label={app.nombre}
            >
              <span className="esc-dock__icono">{ICONOS[app.id]}</span>
              {app.cuenta ? <span className="esc-dock__cuenta">{app.cuenta > 99 ? '99+' : app.cuenta}</span> : null}
              <span className="esc-dock__nombre">{app.nombre}</span>
              {abierta ? <i className="esc-dock__punto" aria-label="Abierta" /> : null}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
