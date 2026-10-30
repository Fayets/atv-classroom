import { useEffect, useMemo, useRef, useState } from 'react'
import { enviarCierre, fetchCierreMes, fetchCierres } from '../../api/cierre'
import { IconoCarpeta } from './Finder'
import { IconoPdf } from './OnboardingsCarpeta'

// Carpeta "Cierres de mes" (solo admins): una carpeta por mes enviado y adentro quiénes completaron el
// formulario de cierre (abre sus respuestas) y quiénes faltan. Desde acá se manda el cierre del mes.
const normal = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '—')
const mayus = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const num = (n) => (typeof n === 'number' ? n.toLocaleString('es-AR') : '—')
const usd = (n) => (typeof n === 'number' ? `US$ ${n.toLocaleString('es-AR')}` : '—')
const pct = (n) => (n === null || n === undefined ? '—' : `${n}%`)

// Un cierre traído del Typeform: las preguntas de ese formulario con lo que escribió, tal cual.
const enTexto = (v) => (/^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : v)
function DelTypeform({ c }) {
  return (
    <div className="ci-vista">
      <div className="ob-vista__barra">
        <div className="ob-vista__quien">
          <b>{c.nombre}</b>
          <span>Typeform · {c.ficha && c.ficha !== c.nombre ? `ficha: ${c.ficha} · ` : ''}completó el {fecha(c.completado_en)}</span>
        </div>
      </div>
      <div className="ci-cuerpo">
        {c.respuestas.typeform.map(([pregunta, v]) => (
          <section key={pregunta}>
            <h4>{pregunta}</h4>
            <p className="ci-texto">{enTexto(v)}</p>
          </section>
        ))}
      </div>
    </div>
  )
}

function Respuestas({ c }) {
  const r = c.respuestas
  if (Array.isArray(r.typeform)) return <DelTypeform c={c} />
  const filas = (lista) => lista.map(([k, v]) => <div key={k} className="ci-dato"><small>{k}</small><b>{v}</b></div>)
  return (
    <div className="ci-vista">
      <div className="ob-vista__barra">
        <div className="ob-vista__quien">
          <b>{c.nombre}{c.creador ? ` · ${c.creador}` : ''}</b>
          <span>{c.plan ? `${mayus(c.plan)} · ` : ''}{c.creador ? `creador ${c.creador} · ` : ''}{r.typeform ? 'por Typeform · ' : ''}completó el {fecha(c.completado_en)}</span>
        </div>
      </div>
      <div className="ci-cuerpo">
        <section>
          <h4>Su negocio</h4>
          {['oferta', 'avatar'].map((k) => (
            <p key={k} className="ci-texto"><b>{mayus(k)}{r.cambios?.includes(k) ? <em> · cambió este mes</em> : null}</b>{r[k] || '—'}</p>
          ))}
        </section>
        <section>
          <h4>Contenido</h4>
          <div className="ci-datos">{filas([['Reels', num(r.reels)], ['Secuencias de historias', num(r.historias)], ['YouTube', num(r.youtube)], ['CTAs en historias', num(r.cta_historias)], ['CTAs en reels', num(r.cta_reels)]])}</div>
        </section>
        <section>
          <h4>Ventas</h4>
          <div className="ci-datos">{filas([['Conversaciones', num(r.conversaciones)], ['Agendas', num(r.agendas)], ['Llamadas', num(r.llamadas)], ['Ventas', num(r.ventas)]])}</div>
          <div className="ci-datos is-tasas">{filas([['Agendamiento', pct(c.tasas.agendamiento)], ['Asistencia', pct(c.tasas.asistencia)], ['Cierre', pct(c.tasas.cierre)]])}</div>
          <div className="ci-datos">{filas([['Cash collected', usd(r.cash)], ['Facturación', usd(r.facturacion)]])}</div>
        </section>
        <section>
          <h4>Cuello de botella: {r.cuello}</h4>
          <p className="ci-texto">{r.cuello_por_que}</p>
        </section>
        <section>
          <h4>Conformidad: {r.satisfaccion ? `${r.satisfaccion}/10` : r.satisfaccion_rango || '—'}</h4>
          <p className="ci-texto">{r.satisfaccion_por_que}</p>
        </section>
        {r.typeform ? (
          <section>
            <h4>Como lo escribió en el Typeform</h4>
            {Object.entries(r.typeform).filter(([, v]) => v).map(([pregunta, v]) => (
              <p key={pregunta} className="ci-texto"><b>{pregunta}</b>{v}</p>
            ))}
          </section>
        ) : null}
        {r.propuesta ? (
          <section>
            <h4>Qué podríamos agregar o implementar de nuevo en ATV</h4>
            <p className="ci-texto">{r.propuesta}</p>
          </section>
        ) : null}
      </div>
    </div>
  )
}

function Enviar({ datos, alEnviado }) {
  const [periodo, setPeriodo] = useState(datos.sugerido)
  const [confirmar, setConfirmar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const yaEnviado = datos.meses.some((m) => m.periodo === periodo)

  async function enviar() {
    setEnviando(true)
    setError('')
    try {
      const r = await enviarCierre(periodo)
      setConfirmar(false)
      alEnviado(r)
    } catch (e) {
      setError(e.message || 'No se pudo enviar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="ci-enviar">
      {!confirmar ? (
        <>
          <input type="month" value={periodo} onChange={(e) => e.target.value && setPeriodo(e.target.value)} aria-label="Mes del cierre" />
          <button type="button" className="ob-todos" onClick={() => setConfirmar(true)}>{yaEnviado ? 'Sumar clientes nuevos' : 'Enviar cierre'}</button>
        </>
      ) : (
        <>
          <span>{yaEnviado ? `Se suman los clientes con acceso que no lo tenían.` : `Se envía a ${datos.activos} clientes con acceso (sin las señas). Tienen 3 días.`}</span>
          <button type="button" className="ob-todos ci-si" onClick={enviar} disabled={enviando}>{enviando ? 'Enviando…' : 'Confirmar'}</button>
          <button type="button" className="ob-todos" onClick={() => setConfirmar(false)} disabled={enviando}>Cancelar</button>
        </>
      )}
      {error ? <span className="ci-error">{error}</span> : null}
    </div>
  )
}

export default function CierresCarpeta({ abierta, alCerrar, alEnfocar, alFrente }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [periodo, setPeriodo] = useState(null) // null = la raíz, con una carpeta por mes
  const [mes, setMes] = useState(null)
  const [dentro, setDentro] = useState(null)
  const [sel, setSel] = useState(null)
  const [buscar, setBuscar] = useState('')
  const [grande, setGrande] = useState(false)
  const [aviso, setAviso] = useState('')
  const ventana = useRef(null)
  const pos = useRef({ x: 90, y: 60 })

  function cargar() {
    fetchCierres()
      .then((d) => {
        setDatos(d)
        setError('')
      })
      .catch((e) => setError(e.message || 'No se pudieron cargar los cierres.'))
  }
  useEffect(() => {
    if (abierta) cargar()
  }, [abierta])
  useEffect(() => {
    if (!periodo) return setMes(null)
    let vivo = true
    setMes(null)
    fetchCierreMes(periodo)
      .then((m) => vivo && setMes(m))
      .catch((e) => vivo && setError(e.message))
    return () => {
      vivo = false
    }
  }, [periodo])

  const q = normal(buscar.trim())
  const completaron = useMemo(() => (mes?.completaron || []).filter((c) => !q || normal(c.nombre).includes(q)), [mes, q])
  const faltan = useMemo(() => (mes?.faltan || []).filter((c) => !q || normal(c.nombre).includes(q)), [mes, q])
  const actual = mes?.completaron.find((c) => c.id === dentro)

  function ir(p) {
    setPeriodo(p)
    setDentro(null)
    setSel(null)
    setBuscar('')
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

  const archivo = (c, hecho) => (
    <button
      key={hecho ? `r${c.id}` : `f${c.cliente_id}`}
      type="button"
      className={`fd-item${sel === (hecho ? c.id : `f${c.cliente_id}`) ? ' is-sel' : ''}`}
      onClick={() => setSel(hecho ? c.id : `f${c.cliente_id}`)}
      onDoubleClick={() => hecho && setDentro(c.id)}
      title={hecho ? `${c.nombre}${c.creador ? ` · ${c.creador}` : ''} · completó el ${fecha(c.completado_en)}` : `${c.nombre} · todavía no lo completó`}
    >
      <span className="ob-icono">
        <IconoPdf tamano={58} apagado={!hecho} />
        {!hecho && mes?.vencido && !mes?.importado ? <i className="ob-icono__aviso ct-pendiente" title="Se le venció el plazo" /> : null}
      </span>
      <span>{c.nombre}{hecho && c.creador ? <small className="fd-gris"> · {c.creador}</small> : null}</span>
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
        if (e.key === 'Enter' && sel && !dentro) (periodo ? mes?.completaron.some((c) => c.id === sel) && setDentro(sel) : ir(sel))
        if (e.key === 'Backspace' && (dentro || periodo)) (dentro ? setDentro(null) : ir(null))
      }}
      tabIndex={-1}
      role="dialog"
      aria-label="Cierres de mes"
      aria-hidden={!abierta}
    >
      <aside className="fd-lateral">
        <div className="mac-semaforo fd-semaforo">
          <button type="button" aria-label="Cerrar" onClick={alCerrar}><svg viewBox="0 0 8 8"><path d="M1.5 1.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          <button type="button" aria-label="Minimizar" onClick={alCerrar}><svg viewBox="0 0 8 8"><path d="M1.2 4h5.6" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          <button type="button" aria-label="Agrandar" onClick={() => setGrande((g) => !g)}><svg viewBox="0 0 8 8"><path d="M2 2h3L2 5zM6 6H3l3-3z" fill="currentColor" /></svg></button>
        </div>
        <h5>Cierres de mes</h5>
        <button type="button" className={`fd-lado${!periodo ? ' is-activo' : ''}`} onClick={() => ir(null)}>
          <IconoCarpeta tamano={16} />
          <span>Todos los meses</span>
          <small>{datos?.meses.length || ''}</small>
        </button>
        <h5>Meses</h5>
        {(datos?.meses || []).map((m) => (
          <button key={m.periodo} type="button" className={`fd-lado${periodo === m.periodo ? ' is-activo' : ''}`} onClick={() => ir(m.periodo)}>
            <IconoCarpeta tamano={16} />
            <span>{mayus(m.mes)}</span>
            <small>{m.completaron}/{m.total}</small>
          </button>
        ))}
      </aside>

      <div className="fd-principal">
        <header className="fd-barra" onPointerDown={arrastrar} onDoubleClick={(e) => !e.target.closest('button, input') && setGrande((g) => !g)}>
          <div className="fd-nav">
            <button type="button" onClick={() => (dentro ? setDentro(null) : ir(null))} disabled={!periodo && !dentro} aria-label="Atrás">
              <svg viewBox="0 0 10 16"><path d="M8 2L2 8l6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          <h3>{dentro ? actual?.nombre : periodo ? mayus(mes?.mes || '') : 'Cierres de mes'}</h3>
          {!periodo && datos ? (
            <div className="ob-barra-der">
              <Enviar datos={datos} alEnviado={(r) => { setAviso(`Cierre de ${r.mes}: ${r.nuevos === r.enviados ? `enviado a ${r.enviados} clientes` : `${r.nuevos} clientes nuevos sumados`}.`); cargar() }} />
            </div>
          ) : <span />}
          {periodo && !dentro ? (
            <label className="fd-buscar">
              <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              <input type="search" placeholder="Buscar cliente" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
            </label>
          ) : <span />}
        </header>

        <div className={`fd-contenido${dentro ? ' is-vista' : ''}`} onClick={(e) => e.target === e.currentTarget && setSel(null)}>
          {error ? <p className="fd-vacio">{error}</p> : null}
          {aviso && !periodo ? <p className="ci-aviso">{aviso}</p> : null}
          {!datos && !error ? <p className="fd-vacio">Cargando…</p> : null}
          {dentro && actual ? (
            <Respuestas c={actual} />
          ) : periodo ? (
            !mes ? (
              <p className="fd-vacio">Cargando…</p>
            ) : (
              <div className="ci-mes">
                <p className="ci-plazo">{mes.importado ? 'Traído del Typeform (no se le pide a nadie)' : `Enviado el ${fecha(mes.enviado_en)} · ${mes.vencido ? `venció el ${fecha(mes.vence_en)}` : `vence el ${fecha(mes.vence_en)}`}`}</p>
                <h4 className="ci-grupo">Completaron <small>{completaron.length}</small></h4>
                {completaron.length ? <div className="fd-grilla">{completaron.map((c) => archivo(c, true))}</div> : <p className="fd-vacio ci-vacio">Todavía nadie.</p>}
                <h4 className="ci-grupo">Faltan <small>{faltan.length}</small></h4>
                {faltan.length ? <div className="fd-grilla">{faltan.map((c) => archivo(c, false))}</div> : <p className="fd-vacio ci-vacio">No falta nadie.</p>}
              </div>
            )
          ) : datos ? (
            datos.meses.length ? (
              <div className="fd-grilla" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
                {datos.meses.map((m) => (
                  <button key={m.periodo} type="button" className={`fd-item${sel === m.periodo ? ' is-sel' : ''}`} onClick={() => setSel(m.periodo)} onDoubleClick={() => ir(m.periodo)} title={`${m.mes} · ${m.completaron} de ${m.total}`}>
                    <IconoCarpeta tamano={64} />
                    <span>{mayus(m.mes)}</span>
                    <small className="fd-gris">{m.completaron} de {m.total}{m.importado ? ' · Typeform' : ''}</small>
                  </button>
                ))}
              </div>
            ) : (
              <p className="fd-vacio">Todavía no se envió ningún cierre. Elegí el mes arriba y tocá Enviar cierre.</p>
            )
          ) : null}
        </div>
      </div>
    </div>
  )
}
