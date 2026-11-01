import { useEffect, useMemo, useRef, useState } from 'react'
import {
  aprobarCuello, desactivarLeccion, fetchClientesCuellos, fetchCuello, fetchCuellos, fetchNeurona,
  guardarCuello, guardarLecciones, pedirCuello, reintentarCuello,
} from '../../api/cuellos'
import { IconoCarpeta } from './Finder'
import HojaCuello from './HojaCuello'
import { IconoPdf } from './OnboardingsCarpeta'
import '../../styles/cuellos.css'
import { descargarPdfCuello } from '../../utils/cuelloPdf'
import { paraChat, partir, SECCIONES, unir } from '../../utils/docCuello'

// Carpeta "Cuellos de botella" (equipo): el cliente mandó un Loom con su traba, Jeremy arma el diagnóstico,
// Juan lo corrige y lo aprueba. La neurona mide cuánto se parecen Jeremy y el cerebro a lo que deja Juan, y
// guarda cada corrección como lección.
const ESTADO = { pidiendo: 'Mandando a Jeremy…', esperando: 'Jeremy lo está armando', borrador: 'Para corregir', aprobado: 'Aprobado', error: 'Con error' }
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '—')
const pct = (n) => (n === null || n === undefined ? '—' : `${Math.round(n * 100)}%`)
const normal = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function Nuevo({ alCreado }) {
  const [clientes, setClientes] = useState(null)
  const [buscar, setBuscar] = useState('')
  const [cliente, setCliente] = useState(null)
  const [loom, setLoom] = useState('')
  const [texto, setTexto] = useState('')
  const [contexto, setContexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    fetchClientesCuellos().then(setClientes).catch((e) => setError(e.message))
  }, [])
  const q = normal(buscar.trim())
  const opciones = useMemo(() => (clientes || []).filter((c) => !q || normal(c.nombre).includes(q)).slice(0, 8), [clientes, q])

  async function enviar(e) {
    e.preventDefault()
    if (!cliente) return setError('Elegí el cliente.')
    setEnviando(true)
    setError('')
    try {
      alCreado(await pedirCuello({ cliente_id: cliente.id, loom_url: loom.trim() || null, texto: texto.trim() || null, contexto: contexto.trim() || null }))
    } catch (err) {
      setError(err.message || 'No se pudo pedir el diagnóstico.')
      setEnviando(false)
    }
  }

  return (
    <form className="cb-nuevo" onSubmit={enviar}>
      <label className="cb-campo">
        <span>Cliente</span>
        {cliente ? (
          <span className="cb-elegido">
            <b>{cliente.nombre}</b><small>{cliente.plan}</small>
            <button type="button" onClick={() => setCliente(null)}>Cambiar</button>
          </span>
        ) : (
          <>
            <input id="cb-buscar" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={clientes ? 'Buscar cliente' : 'Cargando clientes…'} autoComplete="off" />
            {q ? (
              <span className="cb-opciones">
                {opciones.map((c) => (
                  <button key={c.id} type="button" onClick={() => { setCliente(c); setBuscar('') }}>{c.nombre}<small>{c.plan}</small></button>
                ))}
                {!opciones.length ? <small className="cb-gris">No hay un cliente con ese nombre.</small> : null}
              </span>
            ) : null}
          </>
        )}
      </label>
      <label className="cb-campo">
        <span>Loom del cliente</span>
        <input id="cb-loom" value={loom} onChange={(e) => setLoom(e.target.value)} placeholder="https://www.loom.com/share/…" inputMode="url" />
      </label>
      <label className="cb-campo">
        <span>Si no hay Loom, la traba en sus palabras</span>
        <textarea id="cb-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} />
      </label>
      <label className="cb-campo">
        <span>Contexto en una línea (opcional)</span>
        <input id="cb-contexto" value={contexto} onChange={(e) => setContexto(e.target.value)} placeholder="Qué vende y a quién" />
      </label>
      {error ? <p className="cb-error" role="alert">{error}</p> : null}
      <div className="cb-acciones">
        <small className="cb-gris">Jeremy tarda entre 5 y 10 minutos. Lee también su chat, sus llamadas y su último cierre de mes.</small>
        <button type="submit" className="cb-btn" disabled={enviando || (!loom.trim() && !texto.trim())}>{enviando ? 'Pidiendo…' : 'Pedir diagnóstico'}</button>
      </div>
    </form>
  )
}

function Lecciones({ diag, cambios, alListo }) {
  const [textos, setTextos] = useState(() => cambios.map((c) => c.propuesta || ''))
  const [guardando, setGuardando] = useState(false)
  async function guardar() {
    setGuardando(true)
    await guardarLecciones(diag.id, cambios.map((c, i) => ({ seccion: c.seccion, antes: c.antes, despues: c.despues, texto: textos[i] })).filter((l) => l.texto.trim()))
    alListo()
  }
  return (
    <div className="cb-lecciones">
      <h4>¿Qué tiene que aprender de tus correcciones?</h4>
      <p className="cb-gris">Una regla por cada sección que cambiaste. Va en todos los diagnósticos que se pidan de acá en adelante, a Jeremy y al cerebro. Borrá las que no sirvan.</p>
      {cambios.map((c, i) => (
        <label key={c.seccion} className="cb-campo">
          <span>{c.seccion} · {pct(c.parecido)} igual a lo de Jeremy</span>
          <textarea rows={2} value={textos[i]} placeholder="Escribí la regla, o dejalo vacío" onChange={(e) => setTextos((t) => t.map((x, j) => (j === i ? e.target.value : x)))} />
        </label>
      ))}
      <div className="cb-acciones">
        <span />
        <button type="button" className="cb-btn" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar lecciones'}</button>
      </div>
    </div>
  )
}

export function Diagnostico({ id, alCambiar = () => {}, alEnviar }) {
  const [d, setD] = useState(null)
  const [partes, setPartes] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [cambios, setCambios] = useState(null)
  const [error, setError] = useState('')
  const [verTrans, setVerTrans] = useState(false)
  const [bajando, setBajando] = useState(false)

  async function pdf() {
    setBajando(true)
    try {
      await descargarPdfCuello({ cliente: d.cliente, texto: d.version_final, fecha: new Date(d.aprobado_en || Date.now()) })
    } catch (e) {
      setError(e.message || 'No se pudo armar el PDF.')
    } finally {
      setBajando(false)
    }
  }

  function cargar() {
    return fetchCuello(id).then((x) => {
      setD(x)
      setPartes((p) => (x.estado === 'borrador' && p ? p : partir(x.version_final)))
    }).catch((e) => setError(e.message))
  }
  useEffect(() => {
    setD(null)
    setPartes(null)
    setCambios(null)
    cargar()
  }, [id])
  // Mientras Jeremy trabaja, se vuelve a mirar cada 20 s.
  useEffect(() => {
    if (!d || !['pidiendo', 'esperando'].includes(d.estado)) return undefined
    const t = setInterval(cargar, 20_000)
    return () => clearInterval(t)
  }, [d?.estado])

  if (!d) return <p className="fd-vacio">{error || 'Cargando…'}</p>
  const jeremy = partir(d.version_jeremy)
  const cerebro = partir(d.version_cerebro)

  async function guardar() {
    setGuardando(true)
    setError('')
    try {
      await guardarCuello(id, unir(partes))
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }
  async function aprobar() {
    setGuardando(true)
    setError('')
    try {
      const r = await aprobarCuello(id, unir(partes))
      setD(r)
      setCambios(r.cambios || [])
      alCambiar()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="cb-diag">
      <div className="cb-diag__cab">
        <div>
          <h3>{d.cliente}</h3>
          <small className="cb-gris">
            Pedido el {fecha(d.creado_en)}
            {d.loom_url ? <> · <a href={d.loom_url} target="_blank" rel="noreferrer">ver el Loom</a></> : null}
            {d.transcripcion ? <> · <button type="button" className="cb-link" onClick={() => setVerTrans((v) => !v)}>{verTrans ? 'ocultar' : 'ver'} lo que mandó</button></> : null}
          </small>
        </div>
        <span className={`cb-estado is-${d.estado}`}>{ESTADO[d.estado]}</span>
      </div>
      {verTrans ? <pre className="cb-trans">{d.transcripcion}</pre> : null}
      {error ? <p className="cb-error" role="alert">{error}</p> : null}

      {d.estado === 'pidiendo' || d.estado === 'esperando' ? (
        <div className="cb-espera">
          <i className="cb-latido" aria-hidden="true" />
          <p>{d.estado === 'pidiendo' ? 'Leyendo el Loom y juntando lo que sabemos del cliente…' : 'Jeremy lo está armando. Tarda entre 5 y 10 minutos; esta ventana se actualiza sola.'}</p>
          {d.estado === 'esperando' ? <button type="button" className="cb-btn is-suave" onClick={async () => { setD(await reintentarCuello(id)) }}>Volver a mandar</button> : null}
        </div>
      ) : null}

      {d.estado === 'error' ? (
        <div className="cb-espera is-error">
          <p>{d.error}</p>
          <button type="button" className="cb-btn" onClick={async () => { setD(await reintentarCuello(id)); alCambiar() }}>Reintentar</button>
        </div>
      ) : null}

      {d.estado === 'borrador' && partes ? (
        <>
          <p className="cb-gris">Así sale el PDF. Escribí directo sobre el documento: lo que cambies es lo que va a aprender la neurona.</p>
          <HojaCuello key={d.id} cliente={d.cliente} partes={partes} original={jeremy} alCambiar={setPartes} />
          <div className="cb-acciones cb-pie">
            <small className="cb-gris">{d.cerebro_listo ? 'El cerebro ya armó su versión: la vas a ver cuando apruebes.' : 'El cerebro todavía está armando su versión.'}</small>
            <span className="cb-btns">
              <button type="button" className="cb-btn is-suave" disabled={guardando} onClick={guardar}>Guardar</button>
              <button type="button" className="cb-btn" disabled={guardando} onClick={aprobar}>Aprobar versión final</button>
            </span>
          </div>
        </>
      ) : null}

      {d.estado === 'aprobado' ? (
        <>
          {cambios && cambios.length ? <Lecciones diag={d} cambios={cambios} alListo={() => { setCambios(null); alCambiar() }} /> : null}
          {!(cambios && cambios.length) ? (
            <div className="cb-acciones cb-enviar">
              <small className="cb-gris">{bajando ? 'Armando el PDF…' : 'El documento final de Juan, con la marca de ATV.'}</small>
              <span className="cb-btns">
                <button type="button" className="cb-btn is-suave" onClick={() => navigator.clipboard?.writeText(paraChat(d.version_final)).catch(() => {})}>Copiar texto</button>
                <button type="button" className={`cb-btn${alEnviar ? ' is-suave' : ''}`} disabled={bajando} onClick={pdf}>Descargar PDF</button>
                {alEnviar ? <button type="button" className="cb-btn" onClick={() => alEnviar(d)}>Enviar PDF al chat</button> : null}
              </span>
            </div>
          ) : null}
          <div className="cb-medidas">
            <span>Jeremy <b>{pct(d.coincidencia_jeremy)}</b> igual a tu versión</span>
            <span>Cerebro <b>{pct(d.coincidencia_cerebro)}</b> igual a tu versión</span>
          </div>
          <div className="cb-comp">
            <div className="cb-comp__cab"><span /><span className="is-jer">Jeremy</span><span className="is-juan">Juan · final</span><span className="is-cer">Cerebro, en silencio</span></div>
            {SECCIONES.map((s) => (
              <div key={s} className="cb-comp__fila">
                <h5>{s}</h5>
                <p className={jeremy[s] !== partir(d.version_final)[s] ? 'is-corregida' : ''}>{jeremy[s] || '—'}</p>
                <p>{partir(d.version_final)[s] || '—'}</p>
                <p>{cerebro[s] || (d.version_cerebro === null ? 'No llegó a armarla.' : '—')}</p>
              </div>
            ))}
          </div>
          {d.lecciones?.length ? (
            <div className="cb-aprendido">
              <h4>Lo que aprendió de este caso</h4>
              <ul>{d.lecciones.map((l) => <li key={l.id}><small>{l.seccion}</small>{l.texto}</li>)}</ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function Grafico({ serie, umbral }) {
  if (!serie.length) return <p className="fd-vacio">Todavía no hay casos aprobados. El gráfico arranca con el primero.</p>
  const W = 640, H = 210, x0 = 44, x1 = 620, y0 = 20, y1 = 170
  const x = (i) => (serie.length === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (serie.length - 1))
  const y = (v) => y1 - (y1 - y0) * v
  const linea = (k) => serie.map((s, i) => (s[k] === null ? null : `${x(i)},${y(s[k])}`)).filter(Boolean).join(' ')
  return (
    <svg className="cb-graf" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Coincidencia con la versión final de Juan, por semana">
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line x1={x0} x2={x1} y1={y(v)} y2={y(v)} className="cb-graf__grilla" />
          <text x={x0 - 8} y={y(v) + 4} textAnchor="end">{v * 100}%</text>
        </g>
      ))}
      <line x1={x0} x2={x1} y1={y(umbral)} y2={y(umbral)} className="cb-graf__umbral" />
      <text x={x1} y={y(umbral) - 6} textAnchor="end" className="cb-graf__umbral-t">{umbral * 100}% · pasa a fase 2</text>
      <polyline points={linea('jeremy')} className="cb-graf__jer" />
      <polyline points={linea('cerebro')} className="cb-graf__cer" />
      {serie.map((s, i) => (
        <g key={s.semana}>
          {s.cerebro !== null ? <circle cx={x(i)} cy={y(s.cerebro)} r="4" className="cb-graf__punto" /> : null}
          <text x={x(i)} y={H - 14} textAnchor="middle">{new Date(`${s.semana}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' })}</text>
        </g>
      ))}
    </svg>
  )
}

function Avance({ n }) {
  return (
    <div className="cb-avance">
      <h3>¿Ya puede hacerlo sola?</h3>
      <p className="cb-gris">En cada caso el cerebro arma su diagnóstico en silencio y se compara con la versión final que aprobó Juan.</p>
      <div className="cb-fases">
        {[[1, 'Arma Jeremy, aprende el cerebro', 'El cliente recibe lo de Jeremy corregido por Juan.'],
          [2, 'Arma el cerebro, Juan corrige', `Cuando la coincidencia pase ${n.umbral * 100}% tres semanas seguidas.`],
          [3, 'Solo el cerebro', 'Juan revisa una muestra.']].map(([f, t, p]) => (
          <div key={f} className={n.fase === f ? 'is-on' : ''}><small>Fase {f}{n.fase === f ? ' · ahora' : ''}</small><b>{t}</b><p>{p}</p></div>
        ))}
      </div>
      <div className="cb-kpis">
        <div><small>Casos aprobados</small><b>{n.casos}</b></div>
        <div><small>Cerebro igual a Juan</small><b>{pct(n.coincidencia_cerebro)}</b></div>
        <div><small>Jeremy igual a Juan</small><b>{pct(n.coincidencia_jeremy)}</b></div>
        <div><small>Lecciones</small><b>{n.lecciones.filter((l) => l.activa).length}</b></div>
      </div>
      <div className="cb-graf-caja">
        <div className="cb-graf-cab"><b>Coincidencia con la versión final de Juan, por semana</b><span><i className="is-cer" />Cerebro <i className="is-jer" />Jeremy</span></div>
        <Grafico serie={n.serie} umbral={n.umbral} />
      </div>
    </div>
  )
}

function Aprendido({ n, alCambiar }) {
  const max = Math.max(1, ...Object.values(n.secciones_corregidas))
  return (
    <div className="cb-avance">
      <h3>Lo que aprendió</h3>
      <p className="cb-gris">Cada regla sale de una corrección de Juan y va en todos los pedidos siguientes.</p>
      <div className="cb-barras">
        {SECCIONES.map((s) => (
          <div key={s}><span>{s}</span><i style={{ transform: `scaleX(${n.secciones_corregidas[s] / max})` }} /><small>{n.secciones_corregidas[s]}</small></div>
        ))}
      </div>
      {n.lecciones.length ? (
        <ul className="cb-reglas">
          {n.lecciones.map((l) => (
            <li key={l.id} className={l.activa ? '' : 'is-apagada'}>
              <div><small>{l.seccion} · {fecha(l.creado_en)} · usada en {l.usada} {l.usada === 1 ? 'pedido' : 'pedidos'}</small><p>{l.texto}</p></div>
              {l.activa ? <button type="button" className="cb-link" onClick={async () => { await desactivarLeccion(l.id); alCambiar() }}>Dejar de usar</button> : <small>Ya no se usa</small>}
            </li>
          ))}
        </ul>
      ) : <p className="fd-vacio">Todavía no hay lecciones. Salen cuando Juan corrige y aprueba un diagnóstico.</p>}
    </div>
  )
}

export default function CuellosCarpeta({ abierta, alFrente, alEnfocar, alCerrar }) {
  const [vista, setVista] = useState('lista') // lista · nuevo · avance · casos · aprendido
  const [lista, setLista] = useState(null)
  const [neurona, setNeurona] = useState(null)
  const [dentro, setDentro] = useState(null)
  const [sel, setSel] = useState(null)
  const [grande, setGrande] = useState(false)
  const [error, setError] = useState('')
  const ventana = useRef(null)
  const pos = useRef({ x: 120, y: 70 })

  function cargar() {
    fetchCuellos().then((d) => { setLista(d); setError('') }).catch((e) => setError(e.message))
    fetchNeurona().then(setNeurona).catch(() => {})
  }
  useEffect(() => {
    if (abierta) cargar()
  }, [abierta])

  function ir(v) {
    setVista(v)
    setDentro(null)
    setSel(null)
  }
  function arrastrar(e) {
    if (grande || e.button !== 0 || e.target.closest('button, input, a, textarea')) return
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

  const diags = lista?.diagnosticos || []
  const pendientes = diags.filter((d) => d.estado === 'borrador').length
  const titulo = dentro ? diags.find((d) => d.id === dentro)?.cliente || 'Diagnóstico'
    : { lista: 'Cuellos de botella', nuevo: 'Nuevo diagnóstico', avance: 'Neurona · Avance', casos: 'Neurona · Casos', aprendido: 'Neurona · Lo que aprendió' }[vista]
  const archivo = (d) => (
    <button key={d.id} type="button" className={`fd-item${sel === d.id ? ' is-sel' : ''}`} onClick={() => setSel(d.id)} onDoubleClick={() => setDentro(d.id)}
      title={`${d.cliente} · ${ESTADO[d.estado]} · ${fecha(d.creado_en)}`}>
      <span className="ob-icono">
        <IconoPdf tamano={58} apagado={d.estado !== 'aprobado' && d.estado !== 'borrador'} />
        {d.estado === 'borrador' ? <i className="ob-icono__aviso" title="Para corregir" /> : null}
      </span>
      <span>{d.cliente}</span>
      <small className="fd-gris">{vista === 'casos' ? `cerebro ${pct(d.coincidencia_cerebro)}` : ESTADO[d.estado]}</small>
    </button>
  )

  return (
    <div
      ref={ventana}
      className={`fd-ventana cb-ventana${abierta ? ' is-abierta' : ''}${grande ? ' is-grande' : ''}${alFrente ? ' is-frente' : ''}`}
      style={grande ? undefined : { transform: `translate(${pos.current.x}px, ${pos.current.y}px)` }}
      onPointerDown={alEnfocar}
      tabIndex={-1}
      role="dialog"
      aria-label="Cuellos de botella"
      aria-hidden={!abierta}
    >
      <aside className="fd-lateral">
        <div className="mac-semaforo fd-semaforo">
          <button type="button" aria-label="Cerrar" onClick={alCerrar}><svg viewBox="0 0 8 8"><path d="M1.5 1.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          <button type="button" aria-label="Minimizar" onClick={alCerrar}><svg viewBox="0 0 8 8"><path d="M1.2 4h5.6" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          <button type="button" aria-label="Agrandar" onClick={() => setGrande((g) => !g)}><svg viewBox="0 0 8 8"><path d="M2 2h3L2 5zM6 6H3l3-3z" fill="currentColor" /></svg></button>
        </div>
        <h5>Diagnósticos</h5>
        <button type="button" className={`fd-lado${vista === 'lista' && !dentro ? ' is-activo' : ''}`} onClick={() => ir('lista')}>
          <IconoCarpeta tamano={16} /><span>Todos</span><small>{pendientes ? `${pendientes} para corregir` : diags.length || ''}</small>
        </button>
        <button type="button" className={`fd-lado${vista === 'nuevo' ? ' is-activo' : ''}`} onClick={() => ir('nuevo')}>
          <span className="cb-mas" aria-hidden="true">+</span><span>Nuevo diagnóstico</span>
        </button>
        <h5>Neurona</h5>
        <button type="button" className={`fd-lado${vista === 'avance' ? ' is-activo' : ''}`} onClick={() => ir('avance')}>
          <svg className="cb-icono" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 12.5l4-4 3 2.5 4-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span>Avance</span><small>{neurona ? pct(neurona.coincidencia_cerebro) : ''}</small>
        </button>
        <button type="button" className={`fd-lado${vista === 'casos' ? ' is-activo' : ''}`} onClick={() => ir('casos')}>
          <IconoCarpeta tamano={16} /><span>Casos</span><small>{neurona?.casos || ''}</small>
        </button>
        <button type="button" className={`fd-lado${vista === 'aprendido' ? ' is-activo' : ''}`} onClick={() => ir('aprendido')}>
          <svg className="cb-icono" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h10M3 8h10M3 12.5h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          <span>Lo que aprendió</span><small>{neurona?.lecciones.filter((l) => l.activa).length || ''}</small>
        </button>
      </aside>

      <div className="fd-principal">
        <header className="fd-barra" onPointerDown={arrastrar} onDoubleClick={(e) => !e.target.closest('button, input') && setGrande((g) => !g)}>
          <div className="fd-nav">
            <button type="button" onClick={() => (dentro ? setDentro(null) : ir('lista'))} disabled={!dentro && vista === 'lista'} aria-label="Atrás">
              <svg viewBox="0 0 10 16"><path d="M8 2L2 8l6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          <h3>{titulo}</h3>
          <span />
          <span />
        </header>
        <div className={`fd-contenido${dentro || vista !== 'lista' ? ' is-vista' : ''}`} onClick={(e) => e.target === e.currentTarget && setSel(null)}>
          {error ? <p className="fd-vacio">{error}</p> : null}
          {dentro ? (
            <Diagnostico id={dentro} alCambiar={cargar} />
          ) : vista === 'nuevo' ? (
            <Nuevo alCreado={(d) => { cargar(); setVista('lista'); setDentro(d.id) }} />
          ) : vista === 'avance' ? (
            neurona ? <Avance n={neurona} /> : <p className="fd-vacio">Cargando…</p>
          ) : vista === 'aprendido' ? (
            neurona ? <Aprendido n={neurona} alCambiar={cargar} /> : <p className="fd-vacio">Cargando…</p>
          ) : vista === 'casos' ? (
            neurona?.casos_lista.length ? <div className="fd-grilla">{neurona.casos_lista.map(archivo)}</div> : <p className="fd-vacio">Todavía no hay casos aprobados.</p>
          ) : !lista ? (
            <p className="fd-vacio">Cargando…</p>
          ) : (
            <>
              {!lista.jeremy ? <p className="cb-aviso">Falta conectar Jeremy en el servidor: los pedidos van a quedar con error hasta que se configure.</p> : null}
              {diags.length ? <div className="fd-grilla">{diags.map(archivo)}</div> : <p className="fd-vacio">Todavía no hay diagnósticos. Tocá Nuevo diagnóstico y pegá el Loom del cliente.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
