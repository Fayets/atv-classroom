import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchCarpetaClientes, fetchFicha } from '../../api/clientes'

// Carpeta "Clientes" como una ventana del Finder: una carpeta por cliente y, al entrar, su ficha.

const TAGS = {
  vigente: '#28c840',
  proximo_a_vencer: '#ff9f0a',
  vencido: '#ff3b30',
  pausa: '#8e8e93',
  no_va_a_renovar: '#af52de',
  llamada_recompra: '#0a84ff',
}
const FILTROS = [
  { id: 'todos', nombre: 'Todos los clientes', icono: 'reloj' },
  { id: 'vigente', nombre: 'Vigentes', tag: 'vigente' },
  { id: 'proximo_a_vencer', nombre: 'Por vencer', tag: 'proximo_a_vencer' },
  { id: 'vencido', nombre: 'Vencidos', tag: 'vencido' },
  { id: 'otros', nombre: 'Pausa y recompra', tag: 'pausa' },
]
const PLANES = ['mentoria', 'boost', 'advantage', 'mid', 'entry']
const bonito = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '—')
const normal = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const fecha = (iso) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('es-AR') : '—')
const usd = (n) => (n == null ? '—' : `US$ ${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`)

export function IconoCarpeta({ tamano = 64, tag }) {
  return (
    <svg className="fd-carpeta" width={tamano} height={tamano * 0.8} viewBox="0 0 80 64" aria-hidden="true">
      <defs>
        <linearGradient id="fd-atras" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6cc4f7" />
          <stop offset="1" stopColor="#3aa1e8" />
        </linearGradient>
        <linearGradient id="fd-frente" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fd3fb" />
          <stop offset="1" stopColor="#56b5f2" />
        </linearGradient>
      </defs>
      <path d="M4 10a5 5 0 0 1 5-5h18l6 6h38a5 5 0 0 1 5 5v40a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" fill="url(#fd-atras)" />
      <path d="M4 21a4 4 0 0 1 4-4h64a4 4 0 0 1 4 4v35a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" fill="url(#fd-frente)" />
      <path d="M4 21a4 4 0 0 1 4-4h64a4 4 0 0 1 4 4" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1" />
      {tag ? <circle cx="68" cy="52" r="6" fill={TAGS[tag] || '#8e8e93'} stroke="#fff" strokeWidth="2" /> : null}
    </svg>
  )
}

function IconoArchivo({ tipo }) {
  const color = { miro: '#ffd02f', fathom: '#7b61ff', documento: '#2f7cf6', chat: '#ff6a5b' }[tipo] || '#8e8e93'
  const letra = { miro: 'M', fathom: 'F', documento: 'D', chat: '' }[tipo]
  return (
    <svg width="44" height="54" viewBox="0 0 44 54" aria-hidden="true">
      <path d="M4 2h25l13 13v35a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#fff" stroke="#d1d1d6" />
      <path d="M29 2v11a2 2 0 0 0 2 2h11" fill="#f2f2f7" stroke="#d1d1d6" />
      <rect x="9" y="25" width="26" height="18" rx="4" fill={color} />
      {tipo === 'chat' ? (
        <path d="M15 30h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-8l-4 3v-3h-2a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z" fill="#fff" />
      ) : (
        <text x="22" y="38.5" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff" fontFamily="-apple-system, system-ui">{letra}</text>
      )}
    </svg>
  )
}

function Seccion({ titulo, children, abierta: inicial = true }) {
  const [abierta, setAbierta] = useState(inicial)
  return (
    <section className={`fd-info${abierta ? ' is-abierta' : ''}`}>
      <button type="button" className="fd-info__titulo" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta}>
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 2l4 3-4 3z" fill="currentColor" /></svg>
        {titulo}
      </button>
      {abierta ? <div className="fd-info__cuerpo">{children}</div> : null}
    </section>
  )
}

function Dato({ nombre, children }) {
  if (children == null || children === '' || children === '—') return null
  return (
    <div className="fd-dato">
      <dt>{nombre}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Ficha({ id, alAbrirChat }) {
  const [ficha, setFicha] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let vivo = true
    setError('')
    fetchFicha(id)
      .then((f) => vivo && setFicha(f))
      .catch((e) => vivo && setError(e.message || 'No se pudo abrir la ficha.'))
    return () => {
      vivo = false
    }
  }, [id])

  if (error) return <p className="fd-vacio">{error}</p>
  if (!ficha || ficha.cliente.id !== id) return <p className="fd-vacio">Abriendo…</p>
  const c = ficha.cliente
  const cl = ficha.classroom
  const adeudado = Number(c.total_adeudado_usd || 0)
  const archivos = [...(ficha.chat ? [{ tipo: 'chat', titulo: 'Chat del classroom', chat: ficha.chat }] : []), ...ficha.archivos]

  return (
    <div className="fd-ficha">
      <header className="fd-ficha__cabeza">
        <IconoCarpeta tamano={72} tag={c.estado_efectivo} />
        <div>
          <h2>{c.nombre || c.email}</h2>
          <p>
            <span className="fd-pill">{bonito(c.plan_actual)}</span>
            <span className="fd-tag" style={{ '--tag': TAGS[c.estado_efectivo] || '#8e8e93' }}>{c.estado_texto}</span>
            {c.dias_restantes != null ? <span className="fd-gris">{c.dias_restantes >= 0 ? `${c.dias_restantes} días de acceso` : `vencido hace ${-c.dias_restantes} días`}</span> : null}
          </p>
        </div>
      </header>

      {archivos.length ? (
        <div className="fd-archivos" role="list">
          {archivos.map((a, i) =>
            a.chat ? (
              <button key={i} type="button" role="listitem" className="fd-archivo" onDoubleClick={() => alAbrirChat(a.chat)} onClick={(e) => e.detail === 0 && alAbrirChat(a.chat)} title="Doble clic para abrir">
                <IconoArchivo tipo="chat" />
                <span>{a.titulo}</span>
              </button>
            ) : (
              <a key={i} role="listitem" className="fd-archivo" href={a.url} target="_blank" rel="noopener noreferrer" title={a.url}>
                <IconoArchivo tipo={a.tipo} />
                <span>{a.titulo || bonito(a.tipo)}</span>
              </a>
            ),
          )}
        </div>
      ) : null}

      <Seccion titulo="General">
        <dl className="fd-datos">
          <Dato nombre="Mail">{c.email}</Dato>
          <Dato nombre="Otros mails">{c.otros_mails?.join(', ')}</Dato>
          <Dato nombre="Responsable">{c.responsable}</Dato>
          <Dato nombre="Inicio">{fecha(c.fecha_inicio)}</Dato>
          <Dato nombre="Vence">{fecha(c.fecha_vencimiento)}</Dato>
          <Dato nombre="Duración">{c.duracion_dias ? `${c.duracion_dias} días` : null}</Dato>
          <Dato nombre="Recompra">{c.fecha_recompra ? fecha(c.fecha_recompra) : null}</Dato>
          <Dato nombre="Oportunidad">{c.oportunidad ? bonito(c.oportunidad) : null}</Dato>
          <Dato nombre="Canal de Discord">{c.canal_discord}</Dato>
          <Dato nombre="Alta">{fecha(c.fecha_alta)}</Dato>
        </dl>
      </Seccion>

      <Seccion titulo="Plata">
        <div className="fd-cifras">
          <div><small>Pagado</small><b>{usd(c.total_pagado_usd)}</b></div>
          <div className={adeudado > 0 ? 'is-debe' : ''}><small>Adeuda</small><b>{usd(adeudado)}</b></div>
          {c.prioridad_cobro ? <div><small>Prioridad de cobro</small><b>{bonito(c.prioridad_cobro)}</b></div> : null}
        </div>
        {ficha.cuotas.length ? (
          <table className="fd-tabla">
            <thead><tr><th>Cuota</th><th>Monto</th><th>Vence</th><th>Pagada</th><th>Estado</th></tr></thead>
            <tbody>
              {ficha.cuotas.map((q, i) => (
                <tr key={i}>
                  <td>{q.numero_cuota ?? i + 1}</td>
                  <td>{usd(q.monto_usd)}</td>
                  <td>{fecha(q.fecha_vence)}</td>
                  <td>{q.fecha_pago ? fecha(q.fecha_pago) : '—'}</td>
                  <td><span className={`fd-estado is-${q.estado}`}>{bonito(q.estado)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {ficha.pagos.length ? (
          <ul className="fd-lista">
            {ficha.pagos.map((p, i) => (
              <li key={i}><b>{usd(p.monto_usd)}</b> <span className="fd-gris">{fecha(p.fecha)}{p.origen ? ` · ${p.origen}` : ''}</span>{p.notas ? <p>{p.notas}</p> : null}</li>
            ))}
          </ul>
        ) : <p className="fd-gris">Sin pagos cargados.</p>}
      </Seccion>

      {c.observaciones || ficha.observaciones.length || c.acciones_revisar || c.dudas || c.arreglo_closer ? (
        <Seccion titulo="Notas">
          {c.arreglo_closer ? <p className="fd-nota"><b>Arreglo con el closer.</b> {c.arreglo_closer}</p> : null}
          {c.acciones_revisar ? <p className="fd-nota"><b>Acciones a revisar.</b> {c.acciones_revisar}</p> : null}
          {c.dudas ? <p className="fd-nota"><b>Dudas.</b> {c.dudas}</p> : null}
          {c.observaciones ? <p className="fd-nota">{c.observaciones}</p> : null}
          <ul className="fd-lista">
            {ficha.observaciones.map((o, i) => (
              <li key={i}><span className="fd-gris">{o.autor || 'Equipo'} · {fecha(o.created_at)}</span><p>{o.texto}</p></li>
            ))}
          </ul>
        </Seccion>
      ) : null}

      {ficha.proximos_pasos.length ? (
        <Seccion titulo="Próximos pasos">
          <ul className="fd-lista">
            {ficha.proximos_pasos.map((p, i) => (
              <li key={i}>
                <span className="fd-gris">{fecha(p.fecha_llamada)}{p.mentor ? ` · ${p.mentor}` : ''}</span>
                <p>{p.contenido}</p>
                {p.link ? <a href={p.link} target="_blank" rel="noopener noreferrer">Ver la llamada</a> : null}
              </li>
            ))}
          </ul>
        </Seccion>
      ) : null}

      <Seccion titulo="En el classroom">
        <dl className="fd-datos">
          <Dato nombre="Clases completadas">{String(cl.clases_completadas)}</Dato>
          <Dato nombre="Frentes">{cl.frentes.length ? cl.frentes.map((f) => bonito(f.slug)).join(', ') : null}</Dato>
        </dl>
        {cl.ultimas_clases.length ? (
          <ul className="fd-lista">
            {cl.ultimas_clases.map((x) => (
              <li key={x.id}>{bonito(x.titulo.toLowerCase())} <span className="fd-gris">· {x.modulo} · {fecha(x.completado_en)}</span></li>
            ))}
          </ul>
        ) : null}
        {cl.consultas_guia.length ? (
          <>
            <h4 className="fd-sub">Le preguntó a la guía</h4>
            <ul className="fd-lista">
              {cl.consultas_guia.map((q, i) => <li key={i}>“{q.texto}” <span className="fd-gris">· {fecha(q.creado_en)}</span></li>)}
            </ul>
          </>
        ) : null}
      </Seccion>

      {ficha.mensajes.length ? (
        <Seccion titulo="Últimos mensajes">
          <ul className="fd-burbujas">
            {ficha.mensajes.map((m, i) => (
              <li key={i} className={m.equipo ? 'is-equipo' : ''}>
                <small>{m.autor} · {fecha(m.creado_en)}</small>
                <p>{m.texto}</p>
              </li>
            ))}
          </ul>
          {ficha.chat ? <button type="button" className="fd-boton" onClick={() => alAbrirChat(ficha.chat)}>Abrir el chat</button> : null}
        </Seccion>
      ) : null}
    </div>
  )
}

export default function Finder({ abierta, alCerrar, alEnfocar, alFrente, alAbrirChat }) {
  const [clientes, setClientes] = useState(null)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [plan, setPlan] = useState(null)
  const [buscar, setBuscar] = useState('')
  const [vista, setVista] = useState('iconos')
  const [sel, setSel] = useState(null)
  const [historia, setHistoria] = useState({ pila: [null], i: 0 }) // null = la carpeta Clientes
  const [grande, setGrande] = useState(false)
  const ventana = useRef(null)
  const pos = useRef({ x: 0, y: 0 })
  const dentro = historia.pila[historia.i]

  // Se precarga apenas entra el admin (y se refresca cada vez que abrís la carpeta): abre al instante.
  useEffect(() => {
    const t = setTimeout(
      () => {
        fetchCarpetaClientes()
          .then((c) => {
            setClientes(c)
            setError('')
          })
          .catch((e) => setError(e.message || 'No se pudo abrir la carpeta.'))
      },
      abierta ? 0 : 1200,
    )
    return () => clearTimeout(t)
  }, [abierta])

  const lista = useMemo(() => {
    if (!clientes) return []
    const q = normal(buscar.trim())
    return clientes.filter((c) => {
      if (plan && c.plan !== plan) return false
      if (filtro === 'otros' && !['pausa', 'no_va_a_renovar', 'llamada_recompra'].includes(c.estado)) return false
      if (!['todos', 'otros'].includes(filtro) && c.estado !== filtro) return false
      return !q || normal(c.nombre).includes(q) || normal(c.responsable).includes(q)
    })
  }, [clientes, filtro, plan, buscar])

  const cuenta = (pred) => (clientes ? clientes.filter(pred).length : 0)
  const clienteDentro = clientes?.find((c) => c.id === dentro)

  function ir(id) {
    setHistoria((h) => ({ pila: [...h.pila.slice(0, h.i + 1), id], i: h.i + 1 }))
    setSel(null)
  }
  const atras = () => setHistoria((h) => ({ ...h, i: Math.max(0, h.i - 1) }))
  const adelante = () => setHistoria((h) => ({ ...h, i: Math.min(h.pila.length - 1, h.i + 1) }))
  function elegir(id) {
    setSel(id)
    fetchFicha(id).catch(() => {}) // al hacer doble clic ya está
  }
  function verFiltro(f, p = null) {
    setFiltro(f)
    setPlan(p)
    setHistoria({ pila: [null], i: 0 })
  }

  // Arrastrar desde la barra, como en macOS: solo transform, sin recalcular la página.
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

  function teclas(e) {
    if (e.target.tagName === 'INPUT') return
    if (e.key === 'Enter' && sel != null && dentro == null) ir(sel)
    if ((e.metaKey && e.key === '[') || (e.key === 'Backspace' && dentro != null)) atras()
    if (e.metaKey && e.key === ']') adelante()
    if (e.metaKey && e.key.toLowerCase() === 'w') {
      e.preventDefault()
      alCerrar()
    }
  }

  return (
    <div
      ref={ventana}
      className={`fd-ventana${abierta ? ' is-abierta' : ''}${grande ? ' is-grande' : ''}${alFrente ? ' is-frente' : ''}`}
      style={grande ? undefined : { transform: `translate(${pos.current.x}px, ${pos.current.y}px)` }}
      onPointerDown={alEnfocar}
      onKeyDown={teclas}
      tabIndex={-1}
      role="dialog"
      aria-label="Clientes"
      aria-hidden={!abierta}
    >
      <aside className="fd-lateral">
        <div className="mac-semaforo fd-semaforo">
          <button type="button" aria-label="Cerrar" onClick={alCerrar}><svg viewBox="0 0 8 8"><path d="M1.5 1.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          <button type="button" aria-label="Minimizar" onClick={alCerrar}><svg viewBox="0 0 8 8"><path d="M1.2 4h5.6" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          <button type="button" aria-label="Agrandar" onClick={() => setGrande((g) => !g)}><svg viewBox="0 0 8 8"><path d="M2 2h3L2 5zM6 6H3l3-3z" fill="currentColor" /></svg></button>
        </div>
        <h5>Favoritos</h5>
        {FILTROS.map((f) => {
          const n = f.id === 'todos' ? cuenta(() => true) : f.id === 'otros' ? cuenta((c) => ['pausa', 'no_va_a_renovar', 'llamada_recompra'].includes(c.estado)) : cuenta((c) => c.estado === f.id)
          return (
            <button key={f.id} type="button" className={`fd-lado${filtro === f.id && !plan ? ' is-activo' : ''}`} onClick={() => verFiltro(f.id)}>
              {f.tag ? <i className="fd-punto" style={{ '--tag': TAGS[f.tag] }} /> : <IconoCarpeta tamano={16} />}
              <span>{f.nombre}</span>
              <small>{n || ''}</small>
            </button>
          )
        })}
        <h5>Planes</h5>
        {PLANES.map((p) => (
          <button key={p} type="button" className={`fd-lado${plan === p ? ' is-activo' : ''}`} onClick={() => verFiltro('todos', p)}>
            <IconoCarpeta tamano={16} />
            <span>{bonito(p)}</span>
            <small>{cuenta((c) => c.plan === p) || ''}</small>
          </button>
        ))}
      </aside>

      <div className="fd-principal">
        <header className="fd-barra" onPointerDown={arrastrar} onDoubleClick={(e) => !e.target.closest('button, input') && setGrande((g) => !g)}>
          <div className="fd-nav">
            <button type="button" onClick={atras} disabled={historia.i === 0} aria-label="Atrás">
              <svg viewBox="0 0 10 16"><path d="M8 2L2 8l6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button type="button" onClick={adelante} disabled={historia.i >= historia.pila.length - 1} aria-label="Adelante">
              <svg viewBox="0 0 10 16"><path d="M2 2l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          <h3>{dentro != null ? clienteDentro?.nombre || 'Cliente' : plan ? bonito(plan) : FILTROS.find((f) => f.id === filtro)?.id === 'todos' ? 'Clientes' : FILTROS.find((f) => f.id === filtro)?.nombre}</h3>
          {dentro == null ? (
            <div className="fd-vistas" role="group" aria-label="Vista">
              <button type="button" aria-pressed={vista === 'iconos'} onClick={() => setVista('iconos')} aria-label="Íconos">
                <svg viewBox="0 0 16 16"><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></svg>
              </button>
              <button type="button" aria-pressed={vista === 'lista'} onClick={() => setVista('lista')} aria-label="Lista">
                <svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="1.6" rx=".8" /><rect x="2" y="7.2" width="12" height="1.6" rx=".8" /><rect x="2" y="11.4" width="12" height="1.6" rx=".8" /></svg>
              </button>
            </div>
          ) : <span />}
          <label className="fd-buscar">
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <input type="search" placeholder="Buscar" value={buscar} onChange={(e) => { setBuscar(e.target.value); if (dentro != null) setHistoria({ pila: [null], i: 0 }) }} />
          </label>
        </header>

        <div className="fd-contenido" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
          {error && !clientes ? <p className="fd-vacio">{error}</p> : null}
          {!clientes && !error ? <p className="fd-vacio">Cargando…</p> : null}
          {dentro != null ? (
            <Ficha id={dentro} alAbrirChat={alAbrirChat} />
          ) : clientes && vista === 'iconos' ? (
            <div className="fd-grilla" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
              {lista.map((c) => (
                <button key={c.id} type="button" className={`fd-item${sel === c.id ? ' is-sel' : ''}`} onClick={() => elegir(c.id)} onDoubleClick={() => ir(c.id)} title={`${c.nombre} · ${bonito(c.plan)} · ${c.estado_texto}`}>
                  <IconoCarpeta tamano={64} tag={c.estado} />
                  <span>{c.nombre}</span>
                </button>
              ))}
            </div>
          ) : clientes ? (
            <table className="fd-tabla fd-tabla--lista">
              <thead><tr><th>Nombre</th><th>Plan</th><th>Estado</th><th>Vence</th><th>Responsable</th></tr></thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} className={sel === c.id ? 'is-sel' : ''} onClick={() => elegir(c.id)} onDoubleClick={() => ir(c.id)}>
                    <td><span className="fd-nombre"><IconoCarpeta tamano={18} />{c.nombre}</span></td>
                    <td>{bonito(c.plan)}</td>
                    <td><span className="fd-tag" style={{ '--tag': TAGS[c.estado] || '#8e8e93' }}>{c.estado_texto}</span></td>
                    <td>{fecha(c.vence)}</td>
                    <td>{c.responsable || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
        <footer className="fd-estado-barra">
          {dentro != null ? `Clientes › ${clienteDentro?.nombre || ''}` : `${lista.length} ${lista.length === 1 ? 'ítem' : 'ítems'}`}
        </footer>
      </div>
    </div>
  )
}
