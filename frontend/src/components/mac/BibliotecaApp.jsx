import { useEffect, useMemo, useRef, useState } from 'react'
import { request } from '../../api/client'
import '../../styles/biblioteca.css'

// La Biblioteca: lo que el cerebro aprendió de cada nicho (chats, onboardings y roadmaps), como una app
// de Mac en el escritorio de todo el equipo. Solo lectura: se arma sola con lo que va aprendiendo.
const fetchBiblioteca = () => request('/api/biblioteca')

const ETAPA = { arrancando: 'Arrancando', validando: 'Validando', vendiendo: 'Vendiendo', escalando: 'Escalando' }
// Cada nicho es un lomo de otro color, como los libros en un estante.
const LOMOS = ['#c0392b', '#0a84ff', '#ff9f0a', '#30b0c7', '#8e5cd9', '#28a745', '#ff375f', '#a2845e', '#5e5ce6', '#64d2ff', '#bf5af2', '#ffd60a', '#ac8e68', '#32d74b']
const normal = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const iniciales = (n) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')

export function IconoBiblioteca({ tamano = 64 }) {
  return (
    <svg className="bb-icono" width={tamano} height={tamano} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="bb-fondo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb340" />
          <stop offset="1" stopColor="#ff7a00" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#bb-fondo)" />
      <path d="M32 21c-4.5-3.2-10.5-4.2-17-3.6v26c6.5-.6 12.5.4 17 3.6 4.5-3.2 10.5-4.2 17-3.6v-26c-6.5-.6-12.5.4-17 3.6z" fill="#fff" />
      <path d="M32 21v26" stroke="#ff9500" strokeWidth="1.6" />
      <path d="M19 24.5c3.6-.2 7 .5 9.6 2M19 29.5c3.6-.2 7 .5 9.6 2M45 24.5c-3.6-.2-7 .5-9.6 2M45 29.5c-3.6-.2-7 .5-9.6 2" stroke="#ffc58a" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function Barras({ items, color }) {
  if (!items.length) return <p className="bb-vacio">Todavía no hay suficiente.</p>
  const max = Math.max(...items.map((x) => x.veces))
  return (
    <ul className="bb-grupo bb-barras" style={{ '--barra': color }}>
      {items.map((x) => (
        <li key={x.que}>
          <span>{x.que}</span>
          <i><b style={{ transform: `scaleX(${x.veces / max})` }} /></i>
          <small>{x.veces}</small>
        </li>
      ))}
    </ul>
  )
}

function Citas({ items, mal }) {
  const [todas, setTodas] = useState(false)
  if (!items.length) return <p className="bb-vacio">Todavía no hay casos.</p>
  const visibles = todas ? items : items.slice(0, 5)
  return (
    <>
      <ul className={`bb-grupo bb-citas${mal ? ' is-mal' : ''}`}>
        {visibles.map((x, i) => (
          <li key={i}>
            <i aria-hidden="true">{mal ? '✕' : '✓'}</i>
            <div>
              <p>{x.texto}</p>
              {x.cita ? <q>{x.cita}</q> : null}
              <small>{x.cliente}</small>
            </div>
          </li>
        ))}
      </ul>
      {items.length > 5 ? (
        <button type="button" className="bb-mas" onClick={() => setTodas((t) => !t)}>
          {todas ? 'Ver menos' : `Ver los ${items.length}`}
        </button>
      ) : null}
    </>
  )
}

function Seccion({ titulo, sub, children }) {
  return (
    <section className="bb-seccion">
      <h4>{titulo}</h4>
      {sub ? <p className="bb-sub">{sub}</p> : null}
      {children}
    </section>
  )
}

function Nicho({ n, q, alAbrirChat }) {
  // El subnicho elegido (a quién le venden y qué): la página muestra solo lo de esos clientes.
  const [sub, setSub] = useState(null)
  const v = (sub && n.subnichos?.find((s) => s.nombre === sub)) || n
  const subnichos = n.subnichos || []
  const tiene = (...textos) => !q || textos.some((t) => normal(t).includes(q))
  const dolores = v.dolores.filter((x) => tiene(x.que))
  const recomendaciones = v.recomendaciones.filter((x) => tiene(x.que))
  const objeciones = v.objeciones.filter((x) => tiene(x.que))
  const funciono = v.funciono.filter((x) => tiene(x.texto, x.cita, x.cliente))
  const noFunciono = v.no_funciono.filter((x) => tiene(x.texto, x.cita, x.cliente))
  const ofertas = v.ofertas.filter((x) => tiene(x.cliente, x.oferta, x.precio))
  const roadmaps = v.roadmaps.filter((x) => tiene(x.titulo, x.cliente, x.coach, ...(x.cumplidos || [])))
  const clientes = v.clientes.filter((x) => tiene(x.nombre, x.que_vende))
  const conOnb = v.clientes.filter((c) => c.onboarding).length
  const nada = q && ![dolores, recomendaciones, objeciones, funciono, noFunciono, ofertas, roadmaps, clientes].some((l) => l.length)

  return (
    <div className="bb-pagina">
      <header className="bb-cabeza">
        <p className="bb-eti">{sub ? `Nicho · ${n.nombre}` : 'Nicho'}</p>
        <h2>{sub ? capital(sub) : n.nombre}</h2>
        <div className="bb-numeros">
          <span><b>{v.clientes.length}</b> clientes</span>
          <span><b>{conOnb}</b> con onboarding</span>
          <span><b>{v.funciono.length}</b> funcionaron</span>
          <span><b>{v.no_funciono.length}</b> no</span>
          <span><b>{v.roadmaps.length}</b> roadmaps</span>
        </div>
        {subnichos.length ? (
          <div className="bb-subnichos" role="group" aria-label="Subnichos">
            <button type="button" className={sub ? '' : 'is-on'} aria-pressed={!sub} onClick={() => setSub(null)}>
              Todos <small>{n.clientes.length}</small>
            </button>
            {subnichos.map((s) => (
              <button key={s.nombre} type="button" className={sub === s.nombre ? 'is-on' : ''} aria-pressed={sub === s.nombre} onClick={() => setSub(sub === s.nombre ? null : s.nombre)}>
                {capital(s.nombre)} <small>{s.clientes.length}</small>
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {nada ? <p className="bb-vacio">Nada con “{q}” en este nicho.</p> : null}

      <div className="bb-columnas">
        {!q || dolores.length ? <Seccion titulo="Lo que más les duele" sub="Veces que apareció en chats y onboardings"><Barras items={dolores} color="#e0563f" /></Seccion> : null}
        {!q || recomendaciones.length ? <Seccion titulo="Lo que más les recomendamos" sub="Lo que el equipo les mandó a ver o hacer"><Barras items={recomendaciones} color="#7d5bd6" /></Seccion> : null}
        {!q || funciono.length ? <Seccion titulo="Lo que les funcionó" sub="Con la frase del cliente"><Citas items={funciono} /></Seccion> : null}
        {!q || noFunciono.length ? <Seccion titulo="Lo que no les funcionó" sub="Para no repetirlo"><Citas items={noFunciono} mal /></Seccion> : null}
        {!q || objeciones.length ? <Seccion titulo="Lo que objetan" sub="Antes de comprar o en el camino"><Barras items={objeciones} color="#f29b18" /></Seccion> : null}
        {!q || roadmaps.length ? (
          <Seccion titulo="Roadmaps del nicho" sub="Los que más avanzaron primero, con los pasos que se cumplieron">
            {roadmaps.length ? (
              <ul className="bb-grupo bb-roadmaps">
                {roadmaps.map((r) => (
                  <li key={r.id}>
                    <div className="bb-rm__cabeza">
                      <b>{r.titulo}</b>
                      <small>{r.cliente}{r.coach ? ` · ${r.coach}` : ''}</small>
                      <span className="bb-rm__avance" aria-label={`${r.hechos} de ${r.total} pasos`}>
                        <i><b style={{ transform: `scaleX(${r.total ? r.hechos / r.total : 0})` }} /></i>
                        {r.hechos}/{r.total}
                      </span>
                    </div>
                    {r.cumplidos?.length ? (
                      <ul className="bb-rm__pasos">
                        {r.cumplidos.map((p, i) => <li key={i}>{p}</li>)}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="bb-vacio">Se llena solo con los roadmaps nuevos: cada paso que tildan queda acá con lo que contó el cliente después.</p>
            )}
          </Seccion>
        ) : null}
      </div>

      {!q || ofertas.length ? (
        <Seccion titulo="Ofertas y precios" sub="Del formulario de onboarding, con sus palabras">
          {ofertas.length ? (
            <div className="bb-tabla-caja">
              <table className="bb-tabla">
                <thead><tr><th>Cliente</th><th>Vende</th><th>Precio</th><th>Factura</th><th>Quiere llegar a</th></tr></thead>
                <tbody>
                  {ofertas.map((o, i) => (
                    <tr key={i}><td><b>{o.cliente}</b></td><td>{o.oferta || '—'}</td><td>{o.precio || '—'}</td><td>{o.factura || '—'}</td><td>{o.objetivo || '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="bb-vacio">Ningún cliente de este nicho tiene el onboarding leído todavía.</p>
          )}
        </Seccion>
      ) : null}

      {!q || clientes.length ? (
        <Seccion titulo="Quiénes son" sub={v.clientes.some((c) => c.canal_id) ? 'Doble clic para abrir su chat' : null}>
          <div className="bb-clientes">
            {clientes.map((c) => (
              <button
                key={c.id}
                type="button"
                className="bb-cliente"
                onDoubleClick={() => c.canal_id && alAbrirChat(`/mensajes?c=${c.canal_id}`)}
                title={c.canal_id ? `Abrir el chat de ${c.nombre}` : c.nombre}
              >
                <span className="bb-avatar" aria-hidden="true">{iniciales(c.nombre)}</span>
                <span className="bb-cliente__texto">
                  <b>{c.nombre}</b>
                  {c.que_vende ? <small>{c.que_vende}</small> : null}
                  <span className="bb-chips">
                    {c.subnicho && !sub ? <em className="is-sub">{capital(c.subnicho)}</em> : null}
                    {c.plan ? <em>{capital(c.plan)}</em> : null}
                    {c.etapa ? <em>{ETAPA[c.etapa] || c.etapa}</em> : null}
                    {c.onboarding ? <em className="is-verde">Onboarding</em> : null}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Seccion>
      ) : null}
    </div>
  )
}

export default function BibliotecaApp({ abierta, alCerrar, alEnfocar, alFrente, alAbrirChat }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [slug, setSlug] = useState(null)
  const [buscar, setBuscar] = useState('')
  const [grande, setGrande] = useState(false)
  const ventana = useRef(null)
  const contenido = useRef(null)
  const pos = useRef({ x: 70, y: 40 })

  useEffect(() => {
    if (!abierta) return
    fetchBiblioteca()
      .then((d) => {
        setDatos(d)
        setError('')
      })
      .catch((e) => setError(e.message || 'No se pudo cargar la biblioteca.'))
  }, [abierta])

  const nichos = datos?.nichos || []
  const actual = nichos.find((n) => n.slug === slug) || nichos[0]
  const q = normal(buscar.trim())
  const color = useMemo(() => Object.fromEntries(nichos.map((n, i) => [n.slug, LOMOS[i % LOMOS.length]])), [nichos])

  function elegir(s) {
    setSlug(s)
    if (contenido.current) contenido.current.scrollTop = 0
  }

  function arrastrar(e) {
    if (grande || e.button !== 0 || e.target.closest('button, input, a')) return
    const el = ventana.current
    const inicio = { x: e.clientX - pos.current.x, y: e.clientY - pos.current.y }
    const mover = (ev) => {
      const x = ev.clientX - inicio.x
      const y = Math.max(-el.offsetTop, ev.clientY - inicio.y)
      pos.current = { x, y }
      el.style.transform = `translate(${x}px, ${y}px)`
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  return (
    <div
      ref={ventana}
      className={`fd-ventana bb-ventana${abierta ? ' is-abierta' : ''}${grande ? ' is-grande' : ''}${alFrente ? ' is-frente' : ''}`}
      style={grande ? undefined : { transform: `translate(${pos.current.x}px, ${pos.current.y}px)` }}
      onPointerDown={alEnfocar}
      tabIndex={-1}
      role="dialog"
      aria-label="Biblioteca"
      aria-hidden={!abierta}
    >
      <aside className="fd-lateral">
        <div className="mac-semaforo fd-semaforo">
          <button type="button" aria-label="Cerrar" onClick={alCerrar}><svg viewBox="0 0 8 8"><path d="M1.5 1.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          <button type="button" aria-label="Minimizar" onClick={alCerrar}><svg viewBox="0 0 8 8"><path d="M1.2 4h5.6" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          <button type="button" aria-label="Agrandar" onClick={() => setGrande((g) => !g)}><svg viewBox="0 0 8 8"><path d="M2 2h3L2 5zM6 6H3l3-3z" fill="currentColor" /></svg></button>
        </div>
        <h5>Nichos</h5>
        {nichos.map((n) => (
          <button key={n.slug} type="button" className={`fd-lado${actual?.slug === n.slug ? ' is-activo' : ''}`} onClick={() => elegir(n.slug)}>
            <i className="bb-lomo" style={{ '--lomo': color[n.slug] }} aria-hidden="true" />
            <span>{n.nombre}</span>
            <small>{n.clientes.length}</small>
          </button>
        ))}
      </aside>

      <div className="fd-principal">
        <header className="fd-barra" onPointerDown={arrastrar} onDoubleClick={(e) => !e.target.closest('button, input') && setGrande((g) => !g)}>
          <span />
          <h3>{actual ? actual.nombre : 'Biblioteca'}</h3>
          <span />
          <label className="fd-buscar">
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <input type="search" placeholder="Buscar en el nicho" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          </label>
        </header>

        <div ref={contenido} className="fd-contenido bb-contenido">
          {error ? <p className="fd-vacio">{error}</p> : null}
          {!datos && !error ? <p className="fd-vacio">Cargando…</p> : null}
          {datos && !nichos.length ? <p className="fd-vacio">El cerebro todavía no ubicó a ningún cliente en un nicho.</p> : null}
          {actual ? <Nicho key={actual.slug} n={actual} q={q} alAbrirChat={alAbrirChat} /> : null}
        </div>
      </div>
    </div>
  )
}
