import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchMiRoadmap, fetchRoadmap } from '../api/roadmap'
import AppHeader from '../components/AppHeader'
import { useAuth } from '../context/AuthContext'
import '../styles/roadmap.css'
import { getUserInitials } from '../utils/user'

// Roadmap del cliente como un tablero de Miro: una tarjeta por coach, con sus documentos y versiones,
// flechas en el orden en que entraron, y arriba el documento que hay que seguir ahora.

const COLORES = ['#4f7fd8', '#2e9d6e', '#d8a43a', '#9a6fd6', '#d8644f', '#3aa7b5']
const ANCHO_DOC = 128
const fecha = (iso) => {
  const d = new Date(`${iso}T00:00:00`)
  const hoy = new Date()
  if (d.toDateString() === hoy.toDateString()) return 'Hoy'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}
const fechaLarga = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
const nombreDoc = (d) => (d.versiones > 1 ? `${d.titulo} · v${d.version}` : d.titulo)

function Cara({ coach, size = 30 }) {
  return coach.foto_url ? (
    <img className="rm-cara" src={coach.foto_url} alt="" width={size} height={size} referrerPolicy="no-referrer" />
  ) : (
    <span className="rm-cara rm-cara--ini" style={{ width: size, height: size }}>{getUserInitials(coach.nombre)}</span>
  )
}

function Hoja({ doc, principal, grande }) {
  return (
    <span className={`rm-hoja${grande ? ' is-grande' : ''}${principal ? ' is-principal' : ''}${doc?.estado === 'reemplazado' ? ' is-vieja' : ''}`} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      {principal ? <b>VIGENTE</b> : null}
    </span>
  )
}

export default function RoadmapPage() {
  const { isEquipo } = useAuth()
  const [params] = useSearchParams()
  const clienteId = Number(params.get('cliente')) || null
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('todo')
  const [elegido, setElegido] = useState(null)
  const [vista, setVista] = useState({ x: 0, y: 0, z: 1 })
  const lienzo = useRef(null)
  const arrastre = useRef(null)

  useEffect(() => {
    const pedir = isEquipo && clienteId ? fetchRoadmap(clienteId) : fetchMiRoadmap()
    pedir.then(setDatos).catch((e) => setError(e.message || 'No se pudo cargar el roadmap.'))
  }, [isEquipo, clienteId])

  const grupos = useMemo(() => {
    if (!datos) return []
    return datos.grupos
      .map((g, i) => ({ ...g, color: COLORES[i % COLORES.length], docs: filtro === 'vigente' ? g.docs.filter((d) => d.estado === 'vigente') : g.docs }))
      .filter((g) => g.docs.length)
  }, [datos, filtro])

  // Ubicación de cada tarjeta: en fila, de a tres, en el orden en que entró cada coach.
  const ubicadas = useMemo(() => {
    let x = 0
    let y = 0
    let alto = 0
    return grupos.map((g, i) => {
      const ancho = Math.max(270, g.docs.length * ANCHO_DOC + 40)
      if (i > 0 && i % 3 === 0) {
        x = 0
        y += alto + 90
        alto = 0
      }
      const pos = { ...g, x, y, ancho, alto: 250 }
      x += ancho + 90
      alto = Math.max(alto, 250)
      return pos
    })
  }, [grupos])

  const principal = datos?.principal
  const doc = useMemo(() => {
    const todos = datos?.grupos.flatMap((g) => g.docs.map((d) => ({ ...d, coach: g.coach }))) || []
    return todos.find((d) => d.id === (elegido ?? principal?.id)) || null
  }, [datos, elegido, principal])

  const ajustar = useCallback(() => {
    const caja = lienzo.current?.getBoundingClientRect()
    if (!caja || !ubicadas.length) return
    const ancho = Math.max(...ubicadas.map((u) => u.x + u.ancho))
    const alto = Math.max(...ubicadas.map((u) => u.y + u.alto))
    const z = Math.min(1.1, Math.max(0.4, Math.min((caja.width - 80) / ancho, (caja.height - 80) / alto)))
    setVista({ z, x: (caja.width - ancho * z) / 2, y: Math.max(40, (caja.height - alto * z) / 2.4) })
  }, [ubicadas])

  useEffect(() => {
    ajustar()
  }, [ajustar])

  useEffect(() => {
    const el = lienzo.current
    if (!el) return undefined
    const rueda = (e) => {
      e.preventDefault()
      const caja = el.getBoundingClientRect()
      const px = e.clientX - caja.left
      const py = e.clientY - caja.top
      if (e.ctrlKey || e.metaKey) {
        setVista((v) => {
          const z = Math.min(2, Math.max(0.3, v.z * Math.exp(-e.deltaY * 0.01)))
          return { z, x: px - ((px - v.x) * z) / v.z, y: py - ((py - v.y) * z) / v.z }
        })
      } else setVista((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
    }
    el.addEventListener('wheel', rueda, { passive: false })
    return () => el.removeEventListener('wheel', rueda)
  }, [datos])

  const zoom = (f) => {
    const caja = lienzo.current.getBoundingClientRect()
    const px = caja.width / 2
    const py = caja.height / 2
    setVista((v) => {
      const z = Math.min(2, Math.max(0.3, v.z * f))
      return { z, x: px - ((px - v.x) * z) / v.z, y: py - ((py - v.y) * z) / v.z }
    })
  }

  function bajar(e) {
    if (e.button !== 0 || e.target.closest('button, a')) return
    arrastre.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function mover(e) {
    const a = arrastre.current
    if (a) setVista((v) => ({ ...v, x: a.vx + e.clientX - a.x, y: a.vy + e.clientY - a.y }))
  }

  function irA(grupo) {
    const u = ubicadas.find((x) => x.coach.id === grupo.coach.id)
    const caja = lienzo.current?.getBoundingClientRect()
    if (!u || !caja) return
    setVista((v) => ({ ...v, x: caja.width / 2 - (u.x + u.ancho / 2) * v.z, y: caja.height / 2.4 - (u.y + u.alto / 2) * v.z }))
    setElegido(u.docs[u.docs.length - 1].id)
  }

  return (
    <div className="app-shell rm-root">
      <AppHeader />
      {error ? <p className="rm-vacio">{error}</p> : !datos ? <p className="rm-vacio">Cargando el roadmap…</p> : (
        <div className="rm">
          <aside className="rm-lado" aria-label="Filtros">
            <p className="rm-seccion">Roadmaps</p>
            <button type="button" className={filtro === 'vigente' ? 'is-on' : ''} onClick={() => setFiltro('vigente')}>
              <i className="rm-punto is-rojo" /> Vigente <span className="rm-cuenta">{datos.vigentes}</span>
            </button>
            <button type="button" className={filtro === 'todo' ? 'is-on' : ''} onClick={() => setFiltro('todo')}>
              <i className="rm-punto" /> Ver todo <span className="rm-cuenta">{datos.total}</span>
            </button>
            {datos.grupos.length ? <p className="rm-seccion">Coaches</p> : null}
            {datos.grupos.map((g) => (
              <button type="button" key={g.coach.id ?? 'atv'} onClick={() => irA(g)}>
                <Cara coach={g.coach} size={22} /> {g.coach.nombre.split(' ').slice(0, 2).join(' ')} <span className="rm-cuenta">{g.docs.length}</span>
              </button>
            ))}
          </aside>

          <section className="rm-centro">
            {principal ? (
              <div className="rm-ahora" role="status">
                <Hoja doc={principal} />
                <div>
                  <small>El que tenés que seguir ahora</small>
                  <b>
                    {nombreDoc(principal)} · {datos.grupos.find((g) => g.docs.some((d) => d.id === principal.id))?.coach.nombre.split(' ')[0]}
                    {principal.pasos_total ? ` · paso ${principal.paso_actual || 0} de ${principal.pasos_total}` : ''}
                  </b>
                </div>
                <a className="rm-boton" href={principal.url} target="_blank" rel="noopener noreferrer">Abrir</a>
              </div>
            ) : null}

            <div className="rm-lienzo" ref={lienzo} onPointerDown={bajar} onPointerMove={mover} onPointerUp={() => (arrastre.current = null)} onPointerCancel={() => (arrastre.current = null)}>
              {!ubicadas.length ? (
                <div className="rm-vacio-lienzo">
                  <b>Todavía no hay documentos en tu roadmap</b>
                  <span>Después de cada llamada, tu coach suma acá los próximos pasos.</span>
                </div>
              ) : (
                <div className="rm-mundo" style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.z})` }}>
                  <svg className="rm-flechas" width="1" height="1" aria-hidden="true">
                    <defs>
                      <marker id="rm-punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                        <path d="M0 0 10 5 0 10z" fill="currentColor" />
                      </marker>
                    </defs>
                    {ubicadas.slice(1).map((u, i) => {
                      const a = ubicadas[i]
                      const misma = Math.abs(a.y - u.y) < 1
                      const d = misma
                        ? `M ${a.x + a.ancho + 10} ${a.y + 125} L ${u.x - 12} ${u.y + 125}`
                        : `M ${a.x + a.ancho / 2} ${a.y + a.alto + 10} C ${a.x + a.ancho / 2} ${a.y + a.alto + 60}, ${u.x + u.ancho / 2} ${u.y - 60}, ${u.x + u.ancho / 2} ${u.y - 12}`
                      return <path key={u.coach.id ?? i} d={d} fill="none" stroke="currentColor" strokeWidth="1.6" markerEnd="url(#rm-punta)" />
                    })}
                  </svg>
                  {ubicadas.map((u) => (
                    <article key={u.coach.id ?? 'atv'} className="rm-tarjeta" style={{ left: u.x, top: u.y, width: u.ancho, '--color': u.color }}>
                      <header>
                        <Cara coach={u.coach} />
                        <div>
                          <b>{u.coach.nombre}</b>
                          <small>{u.area || u.docs[u.docs.length - 1].tipo_nombre}</small>
                        </div>
                      </header>
                      <div className="rm-docs">
                        {u.docs.map((d) => {
                          const esPrincipal = principal?.id === d.id
                          return (
                            <button type="button" key={d.id} className={`rm-doc${doc?.id === d.id ? ' is-elegido' : ''}${esPrincipal ? ' is-principal' : ''}`} onClick={() => setElegido(d.id)}>
                              <Hoja doc={d} principal={esPrincipal} grande />
                              <b>{nombreDoc(d)}</b>
                              <small>{d.estado === 'reemplazado' ? 'Reemplazado' : d.tipo === 'complementario' ? 'Complementario' : fecha(d.fecha)}</small>
                            </button>
                          )
                        })}
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {ubicadas.length ? (
                <div className="rm-zoom" role="group" aria-label="Zoom">
                  <button type="button" onClick={() => zoom(1 / 1.2)} aria-label="Alejar">−</button>
                  <button type="button" onClick={ajustar}>{Math.round(vista.z * 100)}%</button>
                  <button type="button" onClick={() => zoom(1.2)} aria-label="Acercar">+</button>
                </div>
              ) : null}
            </div>
          </section>

          <aside className="rm-ficha" aria-label="Documento elegido">
            {doc ? (
              <>
                <div className="rm-ficha__hoja">
                  <Hoja doc={doc} principal={principal?.id === doc.id} grande />
                </div>
                <h2>{nombreDoc(doc)}</h2>
                <p className="rm-ficha__sub">Documento de Google</p>
                <p className="rm-seccion">Información</p>
                <dl>
                  <div><dt>Estado</dt><dd className={doc.estado === 'vigente' ? 'is-rojo' : ''}>{doc.estado === 'vigente' ? 'Vigente' : 'Reemplazado'}</dd></div>
                  <div><dt>Tipo</dt><dd>{doc.tipo_nombre}</dd></div>
                  <div><dt>Coach</dt><dd>{doc.coach.nombre.split(' ')[0]}</dd></div>
                  <div><dt>Fecha</dt><dd>{fecha(doc.fecha) === 'Hoy' ? 'Hoy' : fechaLarga(doc.fecha)}</dd></div>
                  {doc.pasos_total ? <div><dt>Avance</dt><dd>Paso {doc.paso_actual || 0} de {doc.pasos_total}</dd></div> : null}
                </dl>
                <a className="rm-boton is-ancho" href={doc.url} target="_blank" rel="noopener noreferrer">Abrir documento</a>
              </>
            ) : (
              <p className="rm-ficha__sub">Elegí un documento del tablero para ver su información.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
