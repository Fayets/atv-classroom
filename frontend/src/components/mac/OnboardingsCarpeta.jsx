import { useEffect, useMemo, useRef, useState } from 'react'
import PizarraOnboarding from './PizarraOnboarding'
import { enviarOnboarding } from '../../api/altas'
import { fetchFormularios, fetchOnboarding, fetchOnboardings } from '../../api/onboardings'
import { createFormPdfBlob, downloadAllFormFilesAsZip, downloadFormFile } from '../../utils/onboardingPdf'
import { IconoCarpeta } from './Finder'

// Carpeta "Onboardings": cada onboarding es el PDF de su formulario, el mismo que se descarga en
// atv-onboarding. Se ve en vista previa, se descarga de a uno o todos juntos en un zip.
const PASOS = [
  ['entro', 'Entró'],
  ['discord', 'Discord'],
  ['skool', 'Classroom'], // en el onboarding, skool_used ahora es "abrió el classroom"
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
const nombreArchivo = (n) => `formulario-${normal(n).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cliente'}.pdf`
const paraPdf = (d) => ({ client_name: d.nombre, client_email: d.email, plan: d.plan, submitted_at: d.formulario_en, form_data: d.respuestas || {} })

// Ícono de archivo PDF, como en el Finder: hoja con la esquina doblada y la etiqueta roja.
export function IconoPdf({ tamano = 64, apagado = false }) {
  return (
    <svg className={`ob-pdf${apagado ? ' is-apagado' : ''}`} width={tamano * 0.8} height={tamano} viewBox="0 0 48 60" aria-hidden="true">
      <path d="M4 3a3 3 0 0 1 3-3h26l12 12v45a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#fff" stroke="#d1d1d6" />
      <path d="M33 0v9a3 3 0 0 0 3 3h9" fill="#ececf0" stroke="#d1d1d6" />
      <rect x="10" y="20" width="24" height="2.4" rx="1.2" fill="#d8d8de" />
      <rect x="10" y="26" width="28" height="2.4" rx="1.2" fill="#d8d8de" />
      <rect x="10" y="32" width="20" height="2.4" rx="1.2" fill="#d8d8de" />
      <rect x="0" y="40" width="30" height="13" rx="2.5" fill={apagado ? '#aeaeb2' : '#e5352b'} />
      <text x="15" y="49.6" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" fontFamily="-apple-system, system-ui, sans-serif">PDF</text>
    </svg>
  )
}

function Avance({ pasos }) {
  return (
    <span className="ob-avance" aria-label={PASOS.filter(([k]) => pasos[k]).map(([, n]) => n).join(', ') || 'Sin pasos'}>
      {PASOS.map(([k, n]) => <i key={k} className={pasos[k] ? 'is-ok' : ''} title={n} />)}
    </span>
  )
}

function Vista({ id, alEnviar, enviando, alAbrirChat }) {
  const [d, setD] = useState(null)
  const [url, setUrl] = useState(null)
  const [error, setError] = useState('')
  const [bajando, setBajando] = useState(false)
  // PDF o pizarra: se recuerda la última que eligió cada uno.
  const [modo, setModo] = useState(() => {
    try {
      return localStorage.getItem('ob-modo') === 'pizarra' ? 'pizarra' : 'pdf'
    } catch {
      return 'pdf'
    }
  })
  function elegir(m) {
    setModo(m)
    try {
      localStorage.setItem('ob-modo', m)
    } catch {
      /* sin almacenamiento: solo dura esta vez */
    }
  }

  useEffect(() => {
    let vivo = true
    let creada = null
    setD(null)
    setUrl(null)
    setError('')
    fetchOnboarding(id)
      .then(async (x) => {
        if (!vivo) return
        setD(x)
        if (!x.pasos.formulario) return
        const blob = await createFormPdfBlob(paraPdf(x))
        creada = URL.createObjectURL(blob)
        if (vivo) setUrl(creada)
      })
      .catch((e) => vivo && setError(e.message || 'No se pudo abrir.'))
    return () => {
      vivo = false
      if (creada) URL.revokeObjectURL(creada)
    }
  }, [id])

  async function bajar() {
    setBajando(true)
    try {
      await downloadFormFile(paraPdf(d))
    } finally {
      setBajando(false)
    }
  }

  if (error) return <p className="fd-vacio">{error}</p>
  if (!d) return <p className="fd-vacio">Abriendo…</p>
  return (
    <div className="ob-vista">
      <div className="ob-vista__barra">
        <div className="ob-vista__quien">
          <b>{nombreArchivo(d.nombre)}</b>
          <span>
            {d.plan || 'Sin plan'} · <span className="fd-tag" style={{ '--tag': ESTADOS[d.estado].color }}>{ESTADOS[d.estado].nombre}</span> · <Avance pasos={d.pasos} />
          </span>
        </div>
        <div className="ob-acciones">
          {d.pasos.formulario ? (
            <div className="ob-modo" role="group" aria-label="Ver como">
              <button type="button" aria-pressed={modo === 'pdf'} onClick={() => elegir('pdf')}>PDF</button>
              <button type="button" aria-pressed={modo === 'pizarra'} onClick={() => elegir('pizarra')}>✏️ Pizarra</button>
            </div>
          ) : null}
          {d.mail_pendiente ? <button type="button" className="fd-boton" onClick={() => alEnviar(d)} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar link de onboarding'}</button> : null}
          {d.canal_id ? <button type="button" className="fd-boton is-suave" onClick={() => alAbrirChat(`/mensajes?c=${d.canal_id}`)}>Abrir su chat</button> : null}
          {d.pasos.formulario ? <button type="button" className="fd-boton" onClick={bajar} disabled={bajando}>{bajando ? 'Generando…' : 'Descargar PDF'}</button> : null}
        </div>
      </div>
      {d.pasos.formulario && modo === 'pizarra' ? (
        <PizarraOnboarding id={id} />
      ) : d.pasos.formulario ? (
        url ? <iframe className="ob-vista__pdf" src={`${url}#navpanes=0&view=FitH`} title={`Formulario de ${d.nombre}`} /> : <p className="fd-vacio">Generando el PDF…</p>
      ) : (
        <div className="ob-vista__vacia">
          <IconoPdf tamano={96} apagado />
          <b>{d.nombre} todavía no completó el formulario</b>
          <span>{PASOS.map(([k, n]) => `${d.pasos[k] ? '✓' : '○'} ${n}`).join('   ')}</span>
          {d.discord_invite_url ? <span className="fd-gris">Invitación de Discord: {d.discord_invite_url}</span> : null}
        </div>
      )}
    </div>
  )
}

export default function OnboardingsCarpeta({ abierta, alCerrar, alEnfocar, alFrente, alAbrirChat }) {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [buscar, setBuscar] = useState('')
  const [vista, setVista] = useState('iconos')
  const [dentro, setDentro] = useState(null)
  const [sel, setSel] = useState(null)
  const [grande, setGrande] = useState(false)
  const [enviando, setEnviando] = useState(null)
  const [zip, setZip] = useState('')
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
  const completos = visibles.filter((o) => o.pasos.formulario)

  async function enviar(o) {
    setEnviando(o.id)
    try {
      await enviarOnboarding(o.alta_id)
      setLista((l) => l.map((x) => (x.id === o.id ? { ...x, mail_pendiente: false } : x)))
      setDentro(null)
      setTimeout(() => setDentro(o.id), 0)
    } catch (e) {
      setError(e.message || 'No se pudo mandar el mail.')
    } finally {
      setEnviando(null)
    }
  }

  // Como "Descargar todos" de atv-onboarding: un PDF por formulario completo de lo que estás viendo.
  async function bajarTodos() {
    setZip('Preparando…')
    try {
      const ids = new Set(completos.map((o) => o.id))
      const forms = (await fetchFormularios()).filter((f) => ids.has(f.id))
      await downloadAllFormFilesAsZip(forms, { onProgress: (n, t) => setZip(`${n} de ${t}`) })
      setZip('')
    } catch (e) {
      setZip('')
      setError(e.message || 'No se pudo armar el zip.')
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
          <h3>{dentro ? actual?.nombre || 'Onboarding' : filtro === 'todos' ? 'Onboardings' : FILTROS.find((f) => f.id === filtro)?.nombre}</h3>
          {!dentro ? (
            <div className="ob-barra-der">
              <button type="button" className="ob-todos" onClick={bajarTodos} disabled={Boolean(zip) || !completos.length} title="Un PDF por formulario completo, en un zip">
                {zip || `Descargar todos (${completos.length})`}
              </button>
              <div className="fd-vistas" role="group" aria-label="Vista">
                <button type="button" aria-pressed={vista === 'iconos'} onClick={() => setVista('iconos')} aria-label="Íconos">
                  <svg viewBox="0 0 16 16"><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></svg>
                </button>
                <button type="button" aria-pressed={vista === 'lista'} onClick={() => setVista('lista')} aria-label="Lista">
                  <svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="1.6" rx=".8" /><rect x="2" y="7.2" width="12" height="1.6" rx=".8" /><rect x="2" y="11.4" width="12" height="1.6" rx=".8" /></svg>
                </button>
              </div>
            </div>
          ) : <span />}
          <label className="fd-buscar">
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <input type="search" placeholder="Buscar" value={buscar} onChange={(e) => { setBuscar(e.target.value); setDentro(null) }} />
          </label>
        </header>

        <div className={`fd-contenido${dentro ? ' is-vista' : ''}`} onClick={(e) => e.target === e.currentTarget && setSel(null)}>
          {error ? <p className="fd-vacio">{error}</p> : null}
          {!lista && !error ? <p className="fd-vacio">Cargando…</p> : null}
          {dentro ? (
            <Vista id={dentro} alEnviar={enviar} enviando={enviando === dentro} alAbrirChat={alAbrirChat} />
          ) : lista && vista === 'iconos' ? (
            <div className="fd-grilla" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
              {visibles.map((o) => (
                <button key={o.id} type="button" className={`fd-item${sel === o.id ? ' is-sel' : ''}`} onClick={() => setSel(o.id)} onDoubleClick={() => setDentro(o.id)} title={`${o.nombre} · ${o.plan || ''} · ${ESTADOS[o.estado].nombre}`}>
                  <span className="ob-icono">
                    <IconoPdf tamano={64} apagado={!o.pasos.formulario} />
                    {o.mail_pendiente ? <i className="ob-icono__aviso" title="Falta mandar el link" /> : null}
                  </span>
                  <span>{o.nombre}</span>
                </button>
              ))}
            </div>
          ) : lista ? (
            <table className="fd-tabla fd-tabla--lista">
              <thead><tr><th>Nombre</th><th>Plan</th><th>Avance</th><th>Estado</th><th>Creado</th></tr></thead>
              <tbody>
                {visibles.map((o) => (
                  <tr key={o.id} className={sel === o.id ? 'is-sel' : ''} onClick={() => setSel(o.id)} onDoubleClick={() => setDentro(o.id)}>
                    <td>
                      <span className="fd-nombre"><IconoPdf tamano={20} apagado={!o.pasos.formulario} />{nombreArchivo(o.nombre)}</span>
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
