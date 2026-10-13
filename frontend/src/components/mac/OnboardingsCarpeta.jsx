import { useEffect, useMemo, useRef, useState } from 'react'
import { enviarOnboarding } from '../../api/altas'
import { fetchOnboarding, fetchOnboardings } from '../../api/onboardings'
import PREGUNTAS from '../../data/onboardingPreguntas.json'
import { IconoCarpeta } from './Finder'

// Carpeta "Onboardings": lo mismo que el dashboard de atv-onboarding, como una ventana del Finder.
const PASOS = [
  ['entro', 'Entró'],
  ['discord', 'Discord'],
  ['skool', 'Skool'],
  ['formulario', 'Formulario'],
]
const ESTADOS = {
  sin_empezar: { nombre: 'Sin empezar', color: '#8e8e93' },
  en_curso: { nombre: 'En curso', color: '#ff9f0a' },
  completo: { nombre: 'Completo', color: '#28c840' },
}
const FILTROS = [
  { id: 'todos', nombre: 'Todos' },
  { id: 'pendiente_link', nombre: 'Falta mandar el link', color: '#c0392b' },
  { id: 'sin_empezar', nombre: 'Sin empezar', color: ESTADOS.sin_empezar.color },
  { id: 'en_curso', nombre: 'En curso', color: ESTADOS.en_curso.color },
  { id: 'completo', nombre: 'Completos', color: ESTADOS.completo.color },
]
const normal = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '—')

function Avance({ pasos }) {
  return (
    <span className="ob-avance" aria-label={PASOS.filter(([k]) => pasos[k]).map(([, n]) => n).join(', ') || 'Sin pasos'}>
      {PASOS.map(([k, n]) => <i key={k} className={pasos[k] ? 'is-ok' : ''} title={n} />)}
    </span>
  )
}

function Detalle({ id, alEnviar, enviando, alAbrirChat }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let vivo = true
    setD(null)
    fetchOnboarding(id).then((x) => vivo && setD(x)).catch((e) => vivo && setError(e.message || 'No se pudo abrir.'))
    return () => {
      vivo = false
    }
  }, [id])
  if (error) return <p className="fd-vacio">{error}</p>
  if (!d) return <p className="fd-vacio">Abriendo…</p>
  const r = d.respuestas || {}
  const hayRespuestas = Object.values(r).some((v) => String(v ?? '').trim())
  return (
    <div className="fd-ficha">
      <header className="fd-ficha__cabeza">
        <IconoCarpeta tamano={72} />
        <div>
          <h2>{d.nombre}</h2>
          <p>
            {d.plan ? <span className="fd-pill">{d.plan}</span> : null}
            <span className="fd-tag" style={{ '--tag': ESTADOS[d.estado].color }}>{ESTADOS[d.estado].nombre}</span>
            <span className="fd-gris">{d.email}</span>
          </p>
        </div>
      </header>
      <div className="ob-pasos">
        {PASOS.map(([k, n]) => (
          <span key={k} className={d.pasos[k] ? 'is-ok' : ''}>{d.pasos[k] ? '✓' : '○'} {n}</span>
        ))}
      </div>
      <div className="ob-acciones">
        {d.mail_pendiente ? (
          <button type="button" className="fd-boton" onClick={() => alEnviar(d)} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar link de onboarding'}</button>
        ) : null}
        {d.canal_id ? <button type="button" className="fd-boton is-suave" onClick={() => alAbrirChat(`/mensajes?c=${d.canal_id}`)}>Abrir su chat</button> : null}
        {d.discord_invite_url ? <span className="fd-gris">Invitación de Discord: {d.discord_invite_url}</span> : null}
      </div>
      <p className="fd-gris">Creado el {fecha(d.creado_en)}{d.formulario_en ? ` · formulario el ${fecha(d.formulario_en)}` : ''}</p>
      {hayRespuestas ? (
        PREGUNTAS.bloques.map((b) => {
          const items = b.questions.filter((q) => String(r[q.id] ?? '').trim())
          if (!items.length) return null
          return (
            <section key={b.title} className="ob-bloque">
              <h4>{b.title}</h4>
              <dl>
                {items.map((q) => (
                  <div key={q.id}>
                    <dt>{q.label}</dt>
                    <dd>{String(r[q.id])}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )
        })
      ) : (
        <p className="fd-vacio">Todavía no completó el formulario.</p>
      )}
      {hayRespuestas && PREGUNTAS.viejas.some((q) => String(r[q.key] ?? '').trim()) ? (
        <section className="ob-bloque">
          <h4>Formulario anterior</h4>
          <dl>
            {PREGUNTAS.viejas.filter((q) => String(r[q.key] ?? '').trim()).map((q) => (
              <div key={q.key}><dt>{q.label}</dt><dd>{String(r[q.key])}</dd></div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  )
}

export default function OnboardingsCarpeta({ abierta, alCerrar, alEnfocar, alFrente, alAbrirChat }) {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [buscar, setBuscar] = useState('')
  const [dentro, setDentro] = useState(null)
  const [sel, setSel] = useState(null)
  const [grande, setGrande] = useState(false)
  const [enviando, setEnviando] = useState(null)
  const ventana = useRef(null)
  const pos = useRef({ x: 36, y: 28 })

  useEffect(() => {
    if (!abierta) return
    fetchOnboardings()
      .then((l) => {
        setLista(l)
        setError('')
      })
      .catch((e) => setError(e.message || 'No se pudieron cargar los onboardings.'))
  }, [abierta])

  const visibles = useMemo(() => {
    if (!lista) return []
    const q = normal(buscar.trim())
    return lista.filter((o) => {
      if (filtro === 'pendiente_link' && !o.mail_pendiente) return false
      if (!['todos', 'pendiente_link'].includes(filtro) && o.estado !== filtro) return false
      return !q || normal(o.nombre).includes(q) || normal(o.email).includes(q)
    })
  }, [lista, filtro, buscar])
  const cuenta = (f) => (!lista ? 0 : f === 'todos' ? lista.length : f === 'pendiente_link' ? lista.filter((o) => o.mail_pendiente).length : lista.filter((o) => o.estado === f).length)
  const actual = lista?.find((o) => o.id === dentro)

  async function enviar(o) {
    setEnviando(o.id)
    try {
      await enviarOnboarding(o.alta_id)
      setLista((l) => l.map((x) => (x.id === o.id ? { ...x, mail_pendiente: false } : x)))
      setDentro(null)
      setTimeout(() => setDentro(o.id), 0) // vuelve a pedir el detalle actualizado
    } catch (e) {
      setError(e.message || 'No se pudo mandar el mail.')
    } finally {
      setEnviando(null)
    }
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
      className={`fd-ventana${abierta ? ' is-abierta' : ''}${grande ? ' is-grande' : ''}${alFrente ? ' is-frente' : ''}`}
      style={grande ? undefined : { transform: `translate(${pos.current.x}px, ${pos.current.y}px)` }}
      onPointerDown={alEnfocar}
      onKeyDown={(e) => {
        if (e.target.tagName === 'INPUT') return
        if (e.key === 'Enter' && sel && !dentro) setDentro(sel)
        if (e.key === 'Backspace' && dentro) setDentro(null)
      }}
      tabIndex={-1}
      role="dialog"
      aria-label="Onboardings"
      aria-hidden={!abierta}
    >
      <aside className="fd-lateral">
        <div className="mac-semaforo fd-semaforo">
          <button type="button" aria-label="Cerrar" onClick={alCerrar}><svg viewBox="0 0 8 8"><path d="M1.5 1.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          <button type="button" aria-label="Minimizar" onClick={alCerrar}><svg viewBox="0 0 8 8"><path d="M1.2 4h5.6" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          <button type="button" aria-label="Agrandar" onClick={() => setGrande((g) => !g)}><svg viewBox="0 0 8 8"><path d="M2 2h3L2 5zM6 6H3l3-3z" fill="currentColor" /></svg></button>
        </div>
        <h5>Onboardings</h5>
        {FILTROS.map((f) => (
          <button key={f.id} type="button" className={`fd-lado${filtro === f.id ? ' is-activo' : ''}`} onClick={() => { setFiltro(f.id); setDentro(null) }}>
            {f.color ? <i className="fd-punto" style={{ '--tag': f.color }} /> : <IconoCarpeta tamano={16} />}
            <span>{f.nombre}</span>
            <small>{cuenta(f.id) || ''}</small>
          </button>
        ))}
      </aside>

      <div className="fd-principal">
        <header className="fd-barra" onPointerDown={arrastrar} onDoubleClick={(e) => !e.target.closest('button, input') && setGrande((g) => !g)}>
          <div className="fd-nav">
            <button type="button" onClick={() => setDentro(null)} disabled={!dentro} aria-label="Atrás">
              <svg viewBox="0 0 10 16"><path d="M8 2L2 8l6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          <h3>{dentro ? actual?.nombre || 'Onboarding' : FILTROS.find((f) => f.id === filtro)?.nombre === 'Todos' ? 'Onboardings' : FILTROS.find((f) => f.id === filtro)?.nombre}</h3>
          <span />
          <label className="fd-buscar">
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <input type="search" placeholder="Buscar" value={buscar} onChange={(e) => { setBuscar(e.target.value); setDentro(null) }} />
          </label>
        </header>

        <div className="fd-contenido" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
          {error ? <p className="fd-vacio">{error}</p> : null}
          {!lista && !error ? <p className="fd-vacio">Cargando…</p> : null}
          {dentro ? (
            <Detalle id={dentro} alEnviar={enviar} enviando={enviando === dentro} alAbrirChat={alAbrirChat} />
          ) : lista ? (
            <table className="fd-tabla fd-tabla--lista">
              <thead><tr><th>Cliente</th><th>Plan</th><th>Avance</th><th>Estado</th><th>Creado</th></tr></thead>
              <tbody>
                {visibles.map((o) => (
                  <tr key={o.id} className={sel === o.id ? 'is-sel' : ''} onClick={() => setSel(o.id)} onDoubleClick={() => setDentro(o.id)}>
                    <td>
                      <span className="fd-nombre"><IconoCarpeta tamano={18} />{o.nombre}</span>
                      {o.mail_pendiente ? <span className="ob-falta">falta el link</span> : null}
                    </td>
                    <td>{o.plan || '—'}</td>
                    <td><Avance pasos={o.pasos} /></td>
                    <td><span className="fd-tag" style={{ '--tag': ESTADOS[o.estado].color }}>{ESTADOS[o.estado].nombre}</span></td>
                    <td>{fecha(o.creado_en)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {lista && !visibles.length && !dentro ? <p className="fd-vacio">No hay onboardings acá.</p> : null}
        </div>
      </div>
    </div>
  )
}
