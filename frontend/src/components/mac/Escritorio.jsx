import { cloneElement, isValidElement, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useEscritorio } from '../../context/EscritorioContext'
import { useMensajeria } from '../../context/MensajeriaContext'
import MensajesPage from '../../pages/MensajesPage'
import Finder, { IconoCarpeta } from './Finder'
import ContratosCarpeta from './ContratosCarpeta'
import OnboardingsCarpeta from './OnboardingsCarpeta'
import NuevoCliente from '../mensajes/NuevoCliente'
import '../../styles/escritorio.css'
import '../../styles/finder.css'

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
  cerebro: (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="6" cy="7" r="2" fill="#fff" />
      <circle cx="17" cy="5.5" r="1.6" fill="#fff" />
      <circle cx="12" cy="12" r="2.4" fill="#fff" />
      <circle cx="5.5" cy="17.5" r="1.6" fill="#fff" />
      <circle cx="18" cy="17" r="2" fill="#fff" />
      <path d="M7.7 8.2l2.6 2.4M15.6 6.6l-2.4 3.6M7 16.4l3.2-3M16.3 15.8l-2.6-2.4" />
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
  if (ruta.startsWith('/admin/cerebro')) return 'cerebro'
  if (ruta.startsWith('/admin/equipo')) return 'equipo'
  if (ruta.startsWith('/admin')) return 'modulos'
  return 'classroom'
}

// El panel del equipo como un escritorio de macOS: barra de menú, una ventana con la sección y el Dock.
export default function Escritorio({ children }) {
  const { isAdmin } = useAuth()
  const { resumen } = useMensajeria()
  const { tamano, visible, abrir } = useEscritorio()
  const location = useLocation()
  const { pathname, search } = location
  const navigate = useNavigate()
  const actual = seccionDe(pathname)
  const enMensajes = actual === 'mensajes'

  // La otra ventana también queda armada: mientras estás en Mensajes sigue mostrando la última app
  // que abriste (sus rutas con la ubicación congelada), así al volver no se rearma nada.
  const ultimaOtra = useRef(enMensajes ? null : location)
  if (!enMensajes) ultimaOtra.current = location
  // Siempre con location explícita: si se pone y se saca, React Router cambia la forma del árbol y
  // desarma la página (Classroom volvía a cargar en cada cambio de app).
  const contenidoOtra = isValidElement(children)
    ? cloneElement(children, { location: enMensajes ? ultimaOtra.current || location : location })
    : children

  // Cada app recuerda dónde quedó (canal abierto, vista), como una ventana de Mac.
  const ultimaRuta = useRef({})
  useEffect(() => {
    ultimaRuta.current[actual] = pathname + search
  }, [actual, pathname, search])

  const apps = [
    { id: 'mensajes', nombre: 'Mensajes', ruta: '/mensajes', cuenta: resumen.esperando && !isAdmin ? resumen.esperando : resumen.no_leidos },
    { id: 'classroom', nombre: 'Classroom', ruta: '/classroom' },
    ...(isAdmin
      ? [
          { id: 'cerebro', nombre: 'Cerebro', ruta: '/admin/cerebro' },
          { id: 'equipo', nombre: 'Equipo', ruta: '/admin/equipo' },
          { id: 'modulos', nombre: 'Módulos', ruta: '/admin' },
        ]
      : []),
  ]

  // Agrandar / achicar con FLIP: se mide dónde termina la ventana y se anima solo con transform
  // desde donde estaba (nada de animar bordes, que obliga a recalcular toda la página en cada cuadro).
  const ventanaMensajes = useRef(null)
  const ventanaOtra = useRef(null)
  const ultimoRect = useRef(null)
  const tamanoPrevio = useRef(tamano)
  useLayoutEffect(() => {
    const el = (enMensajes ? ventanaMensajes : ventanaOtra).current
    if (!el) return
    const antes = ultimoRect.current
    const despues = el.getBoundingClientRect()
    ultimoRect.current = despues
    if (tamanoPrevio.current === tamano || !antes || visible !== 'abierta') {
      tamanoPrevio.current = tamano
      return
    }
    tamanoPrevio.current = tamano
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const dx = antes.left - despues.left
    const dy = antes.top - despues.top
    const sx = antes.width / despues.width
    const sy = antes.height / despues.height
    el.style.transition = 'none'
    el.style.transformOrigin = '0 0'
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
    // Forzar el cálculo acá hace que la animación arranque en el acto, sin esperar un cuadro
    // (en una pestaña en segundo plano los cuadros se pausan y la ventana quedaría a mitad de camino).
    void el.offsetWidth
    el.style.transition = 'transform 340ms cubic-bezier(0.22, 1, 0.36, 1)'
    el.style.transform = ''
    let terminado = false
    const fin = () => {
      if (terminado) return
      terminado = true
      el.style.transition = ''
      el.style.transformOrigin = ''
      el.removeEventListener('transitionend', fin)
    }
    el.addEventListener('transitionend', fin)
    setTimeout(fin, 500) // por si el navegador no avisa el final
  }, [tamano, visible, enMensajes])

  // Como en macOS con "ocultar Dock": aparece al acercar el mouse al borde de abajo y se va al salir.
  // Con la ventana minimizada o cerrada queda siempre a la vista (no hay otra forma de volver).
  const [dockVisible, setDockVisible] = useState(false)
  const ocultar = useRef(null)
  const iconos = useRef([])
  const [finder, setFinder] = useState(false)
  // Fijo solo si no queda ninguna ventana a la vista (sin el Dock no habría cómo volver).
  // Con la carpeta Clientes abierta hay una ventana: el Dock se esconde como siempre.
  const [onboardings, setOnboardings] = useState(false)
  const [contratos, setContratos] = useState(false)
  const [dandoAlta, setDandoAlta] = useState(false)
  const fijo = visible !== 'abierta' && !finder && !onboardings && !contratos

  // Solo el teclado (Tab) deja el Dock fijo: un clic no tiene que dejarlo trabado arriba.
  function mostrarDock() {
    clearTimeout(ocultar.current)
    setDockVisible(true)
  }
  function esconderDock() {
    clearTimeout(ocultar.current)
    ocultar.current = setTimeout(() => setDockVisible(false), 120)
    lupa(null)
  }
  useEffect(() => () => clearTimeout(ocultar.current), [])

  // Lupa del Dock: cada ícono crece según qué tan cerca está el mouse (una vez por cuadro).
  const cuadro = useRef(null)
  function lupa(x) {
    cancelAnimationFrame(cuadro.current)
    cuadro.current = requestAnimationFrame(() => aplicarLupa(x))
  }
  function aplicarLupa(x) {
    iconos.current.forEach((el) => {
      if (!el) return
      if (x == null) {
        el.style.setProperty('--zoom', 1)
        return
      }
      const r = el.getBoundingClientRect()
      const distancia = Math.abs(x - (r.left + r.width / 2))
      el.style.setProperty('--zoom', (1 + 0.5 * Math.max(0, 1 - distancia / 140)).toFixed(3))
    })
  }

  function abrirApp(app) {
    if (app.id !== actual) navigate(ultimaRuta.current[app.id] || app.ruta)
    abrir()
    setFinderFrente(false)
  }

  // Carpeta Clientes (solo admin): ícono en el escritorio, pila en el Dock y su ventana de Finder.
  const [finderFrente, setFinderFrente] = useState(false) // 'clientes' | 'onboardings' | 'contratos' | false
  const [iconoSel, setIconoSel] = useState(null)
  function abrirClientes() {
    setFinder(true)
    setFinderFrente('clientes')
    setIconoSel(null)
  }
  function abrirOnboardings() {
    setOnboardings(true)
    setFinderFrente('onboardings')
    setIconoSel(null)
  }
  function abrirContratos() {
    setContratos(true)
    setFinderFrente('contratos')
    setIconoSel(null)
  }
  function abrirChat(ruta) {
    navigate(ruta)
    abrir()
    setFinderFrente(false)
  }
  // Como en macOS: la ventana que tocás pasa adelante.
  function enfocar(e) {
    if (e.target.closest('.fd-ventana')) return
    if (e.target.closest('.esc-ventana')) setFinderFrente(false)
    if (!e.target.closest('.esc-icono')) setIconoSel(null)
  }

  return (
    <div className="esc" onPointerDownCapture={enfocar}>
      <div className="esc-iconos">
        {[
          ...(isAdmin ? [{ id: 'clientes', nombre: 'Clientes', abrir: abrirClientes }, { id: 'contratos', nombre: 'Contratos', abrir: abrirContratos }] : []),
          { id: 'onboardings', nombre: 'Onboardings', abrir: abrirOnboardings },
          { id: 'alta', nombre: 'Nuevo onboarding', abrir: () => { setDandoAlta(true); setIconoSel(null) }, mas: true },
        ].map((ic) => (
          <button
            key={ic.id}
            type="button"
            className={`esc-icono${iconoSel === ic.id ? ' is-sel' : ''}`}
            onClick={() => setIconoSel(ic.id)}
            onDoubleClick={ic.abrir}
            onKeyDown={(e) => e.key === 'Enter' && ic.abrir()}
            aria-label={`Carpeta ${ic.nombre}`}
          >
            <span className="esc-icono__dibujo">
              <IconoCarpeta tamano={64} />
              {ic.mas ? <b aria-hidden="true">+</b> : null}
            </span>
            <span>{ic.nombre}</span>
          </button>
        ))}
      </div>
      {/* Mensajes no se desarma al cambiar de app: vuelve en el acto, con el mismo chat y scroll. */}
      <div
        ref={ventanaMensajes}
        className={`esc-ventana is-${tamano} is-${visible} ${enMensajes ? 'is-frente' : 'is-fondo'}`}
        aria-hidden={visible !== 'abierta' || !enMensajes}
      >
        <MensajesPage />
      </div>
      <div
        ref={ventanaOtra}
        className={`esc-ventana is-${tamano} is-${visible} ${enMensajes ? 'is-fondo' : 'is-frente'}`}
        aria-hidden={visible !== 'abierta' || enMensajes}
      >
        {contenidoOtra}
      </div>

      {isAdmin ? (
        <Finder abierta={finder} alFrente={finderFrente === 'clientes'} alEnfocar={() => setFinderFrente('clientes')} alCerrar={() => setFinder(false)} alAbrirChat={abrirChat} />
      ) : null}
      {isAdmin ? (
        <ContratosCarpeta abierta={contratos} alFrente={finderFrente === 'contratos'} alEnfocar={() => setFinderFrente('contratos')} alCerrar={() => setContratos(false)} />
      ) : null}
      <OnboardingsCarpeta abierta={onboardings} alFrente={finderFrente === 'onboardings'} alEnfocar={() => setFinderFrente('onboardings')} alCerrar={() => setOnboardings(false)} alAbrirChat={abrirChat} />
      {dandoAlta ? (
        <NuevoCliente
          onCerrar={() => setDandoAlta(false)}
          onAbrirChat={(canalId) => {
            setDandoAlta(false)
            if (canalId) abrirChat(`/mensajes?c=${canalId}`)
          }}
        />
      ) : null}

      {visible === 'cerrada' ? (
        <p className="esc-vacio">La ventana está cerrada. Abrila desde el Dock.</p>
      ) : null}

      {/* La franja del borde lo sube y también lo baja: si el cursor se aleja sin pasar por el Dock, no queda trabado. */}
      <div className="esc-borde" onMouseEnter={mostrarDock} onMouseLeave={esconderDock} aria-hidden="true" />
      <nav
        className={`esc-dock${dockVisible || fijo ? ' is-visible' : ''}`}
        aria-label="Dock"
        onMouseEnter={mostrarDock}
        onMouseLeave={esconderDock}
        onMouseMove={(e) => lupa(e.clientX)}
        onFocus={(e) => e.target.matches(':focus-visible') && mostrarDock()}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && esconderDock()}
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
              onClick={(e) => {
                abrirApp(app)
                if (!e.currentTarget.matches(':focus-visible')) e.currentTarget.blur()
              }}
              aria-label={app.nombre}
            >
              <span className="esc-dock__icono">{ICONOS[app.id]}</span>
              {app.cuenta ? <span className="esc-dock__cuenta">{app.cuenta > 99 ? '99+' : app.cuenta}</span> : null}
              <span className="esc-dock__nombre">{app.nombre}</span>
              {abierta ? <i className="esc-dock__punto" aria-label="Abierta" /> : null}
            </button>
          )
        })}
        {isAdmin ? (
          <>
            <i className="esc-dock__separador" aria-hidden="true" />
            <button
              ref={(el) => {
                iconos.current[apps.length] = el
              }}
              type="button"
              className="esc-dock__app is-clientes"
              onClick={(e) => {
                abrirClientes()
                if (!e.currentTarget.matches(':focus-visible')) e.currentTarget.blur()
              }}
              aria-label="Clientes"
            >
              <span className="esc-dock__icono"><IconoCarpeta tamano={50} /></span>
              <span className="esc-dock__nombre">Clientes</span>
              {finder ? <i className="esc-dock__punto" aria-label="Abierta" /> : null}
            </button>
          </>
        ) : null}
      </nav>
    </div>
  )
}
