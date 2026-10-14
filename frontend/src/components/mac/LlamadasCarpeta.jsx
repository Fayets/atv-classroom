import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { asignarCliente, fetchLlamada, fetchLlamadas } from '../../api/llamadas'
import { fetchCanales } from '../../api/mensajes'
import { IconoCarpeta } from './Finder'

// Carpeta "Llamadas": las llamadas de Fathom de cada coach (las trae su Fathom conectado en Mi cuenta).
// El coach ve las suyas; el admin, una carpeta por coach. Desde una llamada se arma el roadmap del cliente.
const normal = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '—')
const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '—')
const FILTROS = [
  { id: 'todas', nombre: 'Todas' },
  { id: 'sin_roadmap', nombre: 'Sin roadmap', color: '#ff9f0a' },
  { id: 'sin_cliente', nombre: 'Sin cliente', color: '#8e8e93' },
]

// Ícono de una grabación: hoja con un botón de play.
export function IconoLlamada({ tamano = 64, hecha = false }) {
  return (
    <svg width={tamano * 0.8} height={tamano} viewBox="0 0 48 60" aria-hidden="true" className="ll-icono">
      <path d="M4 3a3 3 0 0 1 3-3h26l12 12v45a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#fff" stroke="#d1d1d6" />
      <path d="M33 0v9a3 3 0 0 0 3 3h9" fill="#ececf0" stroke="#d1d1d6" />
      <circle cx="24" cy="32" r="11" fill={hecha ? '#28c840' : '#5b4ef0'} />
      {hecha ? <path d="M19 32l4 4 7-8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M21 26.5v11l9-5.5z" fill="#fff" />}
    </svg>
  )
}

function Vista({ id, alAbrirChat }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [clientes, setClientes] = useState(null)
  const [eligiendo, setEligiendo] = useState(false)

  useEffect(() => {
    setD(null)
    fetchLlamada(id).then(setD).catch((e) => setError(e.message || 'No se pudo abrir.'))
  }, [id])

  async function elegirCliente(clienteId) {
    setD(await asignarCliente(id, clienteId ? Number(clienteId) : null))
    setEligiendo(false)
  }

  if (error) return <p className="fd-vacio">{error}</p>
  if (!d) return <p className="fd-vacio">Abriendo…</p>
  const puedeRoadmap = d.cliente?.canal_id && d.con_transcripcion
  return (
    <div className="ll-vista">
      <div className="ob-vista__barra">
        <div className="ob-vista__quien">
          <b>{d.titulo}</b>
          <span>{fechaHora(d.inicio)}{d.duracion_min ? ` · ${d.duracion_min} min` : ''}{d.coach ? ` · ${d.coach}` : ''}</span>
        </div>
        <div className="ob-acciones">
          {d.fathom_url ? <a className="fd-boton is-suave" href={d.fathom_url} target="_blank" rel="noopener noreferrer">Ver en Fathom</a> : null}
          {d.con_roadmap ? <span className="ll-hecho">Roadmap hecho ✓</span> : null}
          <button
            type="button"
            className="fd-boton"
            disabled={!puedeRoadmap}
            title={!d.cliente ? 'Primero decí de qué cliente es la llamada' : !d.con_transcripcion ? 'Fathom todavía no tiene la transcripción' : 'Arma los pasos y el mensaje en tu voz'}
            onClick={() => alAbrirChat(`/mensajes?c=${d.cliente.canal_id}&roadmap=${d.id}`)}
          >
            Crear roadmap
          </button>
        </div>
      </div>
      <div className="ll-cuerpo">
        <aside className="ll-lado">
          <p className="ll-sub">Cliente</p>
          {d.cliente && !eligiendo ? (
            <p className="ll-cliente">
              <b>{d.cliente.nombre}</b>
              <button type="button" onClick={() => { setEligiendo(true); fetchCanales().then(setClientes) }}>Cambiar</button>
            </p>
          ) : (
            <div className="ll-elegir">
              {!d.cliente ? <span>No encontramos al cliente por los mails de la llamada. ¿De quién es?</span> : null}
              <select
                defaultValue=""
                onFocus={() => !clientes && fetchCanales().then(setClientes)}
                onChange={(e) => e.target.value && elegirCliente(e.target.value)}
              >
                <option value="">Elegí el cliente…</option>
                {(clientes || [])
                  .filter((c) => c.tipo === 'cliente' && c.cliente)
                  .sort((a, b) => a.cliente.nombre.localeCompare(b.cliente.nombre))
                  .map((c) => <option key={c.id} value={c.cliente.id}>{c.cliente.nombre}</option>)}
              </select>
            </div>
          )}
          {d.invitados?.length ? (
            <>
              <p className="ll-sub">Invitados</p>
              <ul className="ll-invitados">{d.invitados.map((i) => <li key={i.email || i.nombre}>{i.nombre || i.email}<small>{i.email}</small></li>)}</ul>
            </>
          ) : null}
          {d.resumen ? (
            <>
              <p className="ll-sub">Resumen de Fathom</p>
              <div className="ll-resumen">{d.resumen}</div>
            </>
          ) : null}
        </aside>
        <section className="ll-transcripcion">
          <p className="ll-sub">Transcripción</p>
          {d.transcripcion ? <pre>{d.transcripcion}</pre> : <p className="fd-gris">Fathom todavía no terminó la transcripción. Vuelve a aparecer en unos minutos.</p>}
        </section>
      </div>
    </div>
  )
}

export default function LlamadasCarpeta({ abierta, alCerrar, alEnfocar, alFrente, alAbrirChat }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [coach, setCoach] = useState(null) // admin: dentro de la carpeta de un coach
  const [dentro, setDentro] = useState(null) // una llamada abierta
  const [sel, setSel] = useState(null)
  const [filtro, setFiltro] = useState('todas')
  const [buscar, setBuscar] = useState('')
  const [grande, setGrande] = useState(false)
  const ventana = useRef(null)
  const pos = useRef({ x: 84, y: 52 })

  useEffect(() => {
    if (!abierta) return
    fetchLlamadas()
      .then((d) => {
        setDatos(d)
        setError('')
      })
      .catch((e) => setError(e.message || 'No se pudieron cargar las llamadas.'))
  }, [abierta])

  const todas = useMemo(() => (datos ? (datos.admin ? datos.coaches.flatMap((c) => c.llamadas) : datos.llamadas) : []), [datos])
  const delCoach = datos?.admin ? datos.coaches.find((c) => c.id === coach) : null
  const enRaizAdmin = datos?.admin && !coach && !buscar.trim()
  const visibles = useMemo(() => {
    const q = normal(buscar.trim())
    const base = q ? todas : datos?.admin ? delCoach?.llamadas || [] : todas
    return base.filter((l) => {
      if (filtro === 'sin_roadmap' && l.con_roadmap) return false
      if (filtro === 'sin_cliente' && l.cliente) return false
      return !q || normal(l.titulo).includes(q) || normal(l.cliente?.nombre).includes(q)
    })
  }, [todas, delCoach, datos, filtro, buscar])
  const actual = todas.find((l) => l.id === dentro)
  const cuenta = (f) => (f === 'todas' ? todas.length : f === 'sin_roadmap' ? todas.filter((l) => !l.con_roadmap).length : todas.filter((l) => !l.cliente).length)

  function arrastrar(e) {
    if (grande || e.button !== 0 || e.target.closest('button, input, a, select')) return
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

  const atras = () => (dentro ? setDentro(null) : setCoach(null))
  const titulo = dentro ? actual?.titulo || 'Llamada' : buscar.trim() ? 'Búsqueda' : delCoach ? delCoach.nombre : 'Llamadas'
  const sinConectar = datos && !datos.conectado && !todas.length

  return (
    <div
      ref={ventana}
      className={`fd-ventana${abierta ? ' is-abierta' : ''}${grande ? ' is-grande' : ''}${alFrente ? ' is-frente' : ''}`}
      style={grande ? undefined : { transform: `translate(${pos.current.x}px, ${pos.current.y}px)` }}
      onPointerDown={alEnfocar}
      onKeyDown={(e) => {
        if (['INPUT', 'SELECT'].includes(e.target.tagName)) return
        if (e.key === 'Enter' && sel != null && !dentro) (enRaizAdmin ? setCoach(sel) : setDentro(sel))
        if (e.key === 'Backspace' && (dentro || coach)) atras()
      }}
      tabIndex={-1}
      role="dialog"
      aria-label="Llamadas"
      aria-hidden={!abierta}
    >
      <aside className="fd-lateral">
        <div className="mac-semaforo fd-semaforo">
          <button type="button" aria-label="Cerrar" onClick={alCerrar}><svg viewBox="0 0 8 8"><path d="M1.5 1.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          <button type="button" aria-label="Minimizar" onClick={alCerrar}><svg viewBox="0 0 8 8"><path d="M1.2 4h5.6" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          <button type="button" aria-label="Agrandar" onClick={() => setGrande((g) => !g)}><svg viewBox="0 0 8 8"><path d="M2 2h3L2 5zM6 6H3l3-3z" fill="currentColor" /></svg></button>
        </div>
        <h5>Llamadas</h5>
        {FILTROS.map((f) => (
          <button key={f.id} type="button" className={`fd-lado${filtro === f.id ? ' is-activo' : ''}`} onClick={() => { setFiltro(f.id); setDentro(null) }}>
            {f.color ? <i className="fd-punto" style={{ '--tag': f.color }} /> : <IconoCarpeta tamano={16} />}
            <span>{f.nombre}</span>
            <small>{cuenta(f.id) || ''}</small>
          </button>
        ))}
        {datos?.admin ? (
          <>
            <h5>Coaches</h5>
            {datos.coaches.map((c) => (
              <button key={c.id} type="button" className={`fd-lado${coach === c.id && !buscar.trim() ? ' is-activo' : ''}`} onClick={() => { setCoach(c.id); setDentro(null); setBuscar('') }}>
                <IconoCarpeta tamano={16} />
                <span>{c.nombre.split(' ')[0]}</span>
                <small>{c.llamadas.length || ''}</small>
              </button>
            ))}
          </>
        ) : null}
      </aside>

      <div className="fd-principal">
        <header className="fd-barra" onPointerDown={arrastrar} onDoubleClick={(e) => !e.target.closest('button, input') && setGrande((g) => !g)}>
          <div className="fd-nav">
            <button type="button" onClick={atras} disabled={!dentro && !coach} aria-label="Atrás">
              <svg viewBox="0 0 10 16"><path d="M8 2L2 8l6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          <h3>{titulo}</h3>
          <span />
          <label className="fd-buscar">
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <input type="search" placeholder="Buscar cliente o llamada" value={buscar} onChange={(e) => { setBuscar(e.target.value); setDentro(null) }} />
          </label>
        </header>

        <div className={`fd-contenido${dentro ? ' is-vista' : ''}`} onClick={(e) => e.target === e.currentTarget && setSel(null)}>
          {error ? <p className="fd-vacio">{error}</p> : null}
          {!datos && !error ? <p className="fd-vacio">Cargando…</p> : null}
          {sinConectar ? (
            <div className="ob-vista__vacia">
              <IconoLlamada tamano={96} />
              <b>Conectá tu Fathom y tus llamadas caen acá solas</b>
              <span>Con la transcripción, para armar el roadmap del cliente en un clic.</span>
              <Link className="fd-boton" to="/cuenta" onClick={alCerrar}>Conectar en Mi cuenta</Link>
            </div>
          ) : dentro ? (
            <Vista id={dentro} alAbrirChat={alAbrirChat} />
          ) : datos && enRaizAdmin ? (
            <div className="fd-grilla" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
              {datos.coaches.map((c) => (
                <button key={c.id} type="button" className={`fd-item${sel === c.id ? ' is-sel' : ''}`} onClick={() => setSel(c.id)} onDoubleClick={() => setCoach(c.id)}>
                  <IconoCarpeta tamano={64} />
                  <span>{c.nombre}</span>
                  <small className="fd-gris">{c.llamadas.length ? `${c.llamadas.length} llamadas` : c.conectado ? 'Sin llamadas' : 'Sin Fathom'}</small>
                </button>
              ))}
              {!datos.coaches.length ? <p className="fd-vacio">Todavía nadie del equipo conectó su Fathom.</p> : null}
            </div>
          ) : datos ? (
            <div className="fd-grilla" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
              {visibles.map((l) => (
                <button key={l.id} type="button" className={`fd-item${sel === l.id ? ' is-sel' : ''}`} onClick={() => setSel(l.id)} onDoubleClick={() => setDentro(l.id)} title={`${l.titulo} · ${fecha(l.inicio)}`}>
                  <IconoLlamada tamano={64} hecha={l.con_roadmap} />
                  <span>{l.cliente?.nombre || l.titulo}</span>
                  <small className="fd-gris">{fecha(l.inicio)}{l.duracion_min ? ` · ${l.duracion_min} min` : ''}</small>
                </button>
              ))}
              {!visibles.length ? <p className="fd-vacio">{buscar.trim() ? 'Ninguna llamada con ese nombre.' : 'No hay llamadas acá.'}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
