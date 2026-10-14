import { useEffect, useMemo, useRef, useState } from 'react'
import { enviarMensaje } from '../../api/mensajes'
import { request } from '../../api/client'
import { IconoCarpeta } from './Finder'

// Carpeta "SOPs solicitados": los SOPs que pidieron los clientes desde la guía cuando no había material.
// La ve todo el equipo. Cada pedido se marca en proceso / entregado, con el link del SOP, y se le avisa
// al cliente en su chat.
const fetchSops = () => request('/api/sops-solicitados')
const actualizarSop = (id, cambios) => request(`/api/sops-solicitados/${id}`, { method: 'PATCH', body: JSON.stringify(cambios) })

const ESTADOS = {
  pendiente: { nombre: 'Pendientes', uno: 'Pendiente', color: '#ff9f0a' },
  en_proceso: { nombre: 'En proceso', uno: 'En proceso', color: '#0a84ff' },
  entregado: { nombre: 'Entregados', uno: 'Entregado', color: '#28c840' },
}
const normal = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '—')
const haceDias = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)

function IconoSop({ tamano = 64, color }) {
  return (
    <svg width={tamano * 0.8} height={tamano} viewBox="0 0 48 60" aria-hidden="true" className="sop-icono">
      <path d="M4 3a3 3 0 0 1 3-3h26l12 12v45a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#fff" stroke="#d1d1d6" />
      <path d="M33 0v9a3 3 0 0 0 3 3h9" fill="#ececf0" stroke="#d1d1d6" />
      <rect x="10" y="20" width="24" height="2.4" rx="1.2" fill="#d8d8de" />
      <rect x="10" y="26" width="28" height="2.4" rx="1.2" fill="#d8d8de" />
      <rect x="10" y="32" width="20" height="2.4" rx="1.2" fill="#d8d8de" />
      <rect x="0" y="40" width="30" height="13" rx="2.5" fill={color} />
      <text x="15" y="49.6" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" fontFamily="-apple-system, system-ui, sans-serif">SOP</text>
    </svg>
  )
}

function Vista({ s, alCambiar, alAbrirChat }) {
  const [url, setUrl] = useState(s.entrega_url || '')
  const [ocupado, setOcupado] = useState('')
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    setUrl(s.entrega_url || '')
    setAviso('')
    setError('')
  }, [s.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function cambiar(cambios, que) {
    setOcupado(que)
    setError('')
    try {
      alCambiar(await actualizarSop(s.id, cambios))
      return true
    } catch (e) {
      setError(e.message || 'No se pudo guardar.')
      return false
    } finally {
      setOcupado('')
    }
  }

  async function entregar() {
    if (!url.trim()) return setError('Pegá el link del SOP para entregarlo.')
    if (!(await cambiar({ estado: 'entregado', entrega_url: url.trim() }, 'entregar'))) return
    if (s.cliente?.canal_id) {
      const nombre = (s.cliente.nombre || '').split(' ')[0]
      try {
        await enviarMensaje(s.cliente.canal_id, `${nombre}, ya tenés el SOP que pediste: ${s.titulo.charAt(0) + s.titulo.slice(1).toLowerCase()} 👉 ${url.trim()}`)
        setAviso('Entregado y avisado en su chat.')
      } catch {
        setAviso('Quedó entregado, pero no se pudo avisar en el chat.')
      }
    } else setAviso('Quedó entregado.')
  }

  return (
    <div className="sop-vista">
      <div className="ob-vista__barra">
        <div className="ob-vista__quien">
          <b>{s.titulo}</b>
          <span>
            {s.area_nombre} · pedido el {fecha(s.creado_en)} · <span className="fd-tag" style={{ '--tag': ESTADOS[s.estado]?.color }}>{ESTADOS[s.estado]?.uno || s.estado}</span>
          </span>
        </div>
        <div className="ob-acciones">
          {s.cliente?.canal_id ? <button type="button" className="fd-boton is-suave" onClick={() => alAbrirChat(`/mensajes?c=${s.cliente.canal_id}`)}>Abrir su chat</button> : null}
        </div>
      </div>
      <div className="sop-cuerpo">
        <dl className="sop-datos">
          <div><dt>Cliente</dt><dd>{s.cliente?.nombre || s.pedido_por || '—'}</dd></div>
          <div><dt>Área</dt><dd>{s.area_nombre}</dd></div>
          <div><dt>Pedido</dt><dd>{fecha(s.creado_en)}{s.estado !== 'entregado' ? ` · hace ${haceDias(s.creado_en)} días` : ''}</dd></div>
          {s.resuelto_por ? <div><dt>Entregó</dt><dd>{s.resuelto_por} · {fecha(s.resuelto_en)}</dd></div> : null}
        </dl>
        <p className="ll-sub">Qué necesita</p>
        <p className="sop-texto">{s.problema}</p>
        {s.consulta ? (
          <>
            <p className="ll-sub">Lo que le preguntó a la guía</p>
            <p className="sop-texto is-cita">“{s.consulta}”</p>
          </>
        ) : null}

        <p className="ll-sub">Estado</p>
        <div className="sop-estados" role="group" aria-label="Estado">
          {Object.entries(ESTADOS).map(([k, v]) => (
            <button key={k} type="button" className={s.estado === k ? 'is-on' : ''} style={{ '--tag': v.color }} disabled={Boolean(ocupado)} onClick={() => s.estado !== k && cambiar({ estado: k }, k)}>
              <i />{v.uno}
            </button>
          ))}
        </div>

        <p className="ll-sub">Link del SOP</p>
        <div className="sop-entrega">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/…" />
          <button type="button" className="fd-boton" onClick={entregar} disabled={Boolean(ocupado)}>
            {ocupado === 'entregar' ? 'Entregando…' : s.cliente?.canal_id ? 'Entregar y avisarle' : 'Marcar entregado'}
          </button>
        </div>
        {s.entrega_url ? <a className="sop-link" href={s.entrega_url} target="_blank" rel="noopener noreferrer">Abrir el SOP entregado ↗</a> : null}
        {aviso ? <p className="sop-ok">{aviso}</p> : null}
        {error ? <p className="sop-error">{error}</p> : null}
      </div>
    </div>
  )
}

export default function SopsCarpeta({ abierta, alCerrar, alEnfocar, alFrente, alAbrirChat }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('todos') // todos | estado | area:<id>
  const [dentro, setDentro] = useState(null)
  const [sel, setSel] = useState(null)
  const [buscar, setBuscar] = useState('')
  const [grande, setGrande] = useState(false)
  const ventana = useRef(null)
  const pos = useRef({ x: 110, y: 64 })

  useEffect(() => {
    if (!abierta) return
    fetchSops()
      .then((d) => {
        setDatos(d)
        setError('')
      })
      .catch((e) => setError(e.message || 'No se pudieron cargar los pedidos.'))
  }, [abierta])

  const todas = datos?.solicitudes || []
  const visibles = useMemo(() => {
    const q = normal(buscar.trim())
    return todas.filter((s) => {
      if (filtro.startsWith('area:') && s.area !== filtro.slice(5)) return false
      if (ESTADOS[filtro] && s.estado !== filtro) return false
      return !q || normal(s.titulo).includes(q) || normal(s.cliente?.nombre).includes(q) || normal(s.problema).includes(q)
    })
  }, [todas, filtro, buscar])
  const actual = todas.find((s) => s.id === dentro)
  const cuenta = (f) => (f === 'todos' ? todas.length : f.startsWith('area:') ? todas.filter((s) => s.area === f.slice(5)).length : todas.filter((s) => s.estado === f).length)
  const titulo = dentro ? actual?.titulo || 'SOP' : filtro === 'todos' ? 'SOPs solicitados' : ESTADOS[filtro]?.nombre || datos?.areas.find((a) => `area:${a.id}` === filtro)?.nombre

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

  const lado = (id, nombre, color) => (
    <button key={id} type="button" className={`fd-lado${filtro === id ? ' is-activo' : ''}`} onClick={() => { setFiltro(id); setDentro(null) }}>
      {color ? <i className="fd-punto" style={{ '--tag': color }} /> : <IconoCarpeta tamano={16} />}
      <span>{nombre}</span>
      <small>{cuenta(id) || ''}</small>
    </button>
  )

  return (
    <div
      ref={ventana}
      className={`fd-ventana${abierta ? ' is-abierta' : ''}${grande ? ' is-grande' : ''}${alFrente ? ' is-frente' : ''}`}
      style={grande ? undefined : { transform: `translate(${pos.current.x}px, ${pos.current.y}px)` }}
      onPointerDown={alEnfocar}
      onKeyDown={(e) => {
        if (e.target.tagName === 'INPUT') return
        if (e.key === 'Enter' && sel != null && !dentro) setDentro(sel)
        if (e.key === 'Backspace' && dentro) setDentro(null)
      }}
      tabIndex={-1}
      role="dialog"
      aria-label="SOPs solicitados"
      aria-hidden={!abierta}
    >
      <aside className="fd-lateral">
        <div className="mac-semaforo fd-semaforo">
          <button type="button" aria-label="Cerrar" onClick={alCerrar}><svg viewBox="0 0 8 8"><path d="M1.5 1.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          <button type="button" aria-label="Minimizar" onClick={alCerrar}><svg viewBox="0 0 8 8"><path d="M1.2 4h5.6" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          <button type="button" aria-label="Agrandar" onClick={() => setGrande((g) => !g)}><svg viewBox="0 0 8 8"><path d="M2 2h3L2 5zM6 6H3l3-3z" fill="currentColor" /></svg></button>
        </div>
        <h5>SOPs solicitados</h5>
        {lado('todos', 'Todos')}
        {Object.entries(ESTADOS).map(([k, v]) => lado(k, v.nombre, v.color))}
        {datos?.areas?.length ? <h5>Áreas</h5> : null}
        {(datos?.areas || []).map((a) => lado(`area:${a.id}`, a.nombre))}
      </aside>

      <div className="fd-principal">
        <header className="fd-barra" onPointerDown={arrastrar} onDoubleClick={(e) => !e.target.closest('button, input') && setGrande((g) => !g)}>
          <div className="fd-nav">
            <button type="button" onClick={() => setDentro(null)} disabled={!dentro} aria-label="Atrás">
              <svg viewBox="0 0 10 16"><path d="M8 2L2 8l6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          <h3>{titulo}</h3>
          <span />
          <label className="fd-buscar">
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <input type="search" placeholder="Buscar SOP o cliente" value={buscar} onChange={(e) => { setBuscar(e.target.value); setDentro(null) }} />
          </label>
        </header>

        <div className={`fd-contenido${dentro ? ' is-vista' : ''}`} onClick={(e) => e.target === e.currentTarget && setSel(null)}>
          {error ? <p className="fd-vacio">{error}</p> : null}
          {!datos && !error ? <p className="fd-vacio">Cargando…</p> : null}
          {dentro && actual ? (
            <Vista s={actual} alAbrirChat={alAbrirChat} alCambiar={(n) => setDatos((d) => ({ ...d, solicitudes: d.solicitudes.map((x) => (x.id === n.id ? n : x)) }))} />
          ) : datos ? (
            <div className="fd-grilla" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
              {visibles.map((s) => (
                <button key={s.id} type="button" className={`fd-item${sel === s.id ? ' is-sel' : ''}`} onClick={() => setSel(s.id)} onDoubleClick={() => setDentro(s.id)} title={`${s.titulo} · ${s.cliente?.nombre || ''} · ${ESTADOS[s.estado]?.uno || ''}`}>
                  <IconoSop tamano={64} color={ESTADOS[s.estado]?.color || '#8e8e93'} />
                  <span>{s.titulo.charAt(0) + s.titulo.slice(1).toLowerCase()}</span>
                  <small className="fd-gris">{s.cliente?.nombre?.split(' ')[0] || s.pedido_por || ''} · {fecha(s.creado_en)}</small>
                </button>
              ))}
              {!visibles.length ? <p className="fd-vacio">{buscar.trim() ? 'Ningún pedido con ese nombre.' : 'No hay pedidos acá.'}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
