import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchContratoPdf, fetchContratos } from '../../api/contratos'
import { IconoCarpeta } from './Finder'
import { IconoPdf } from './OnboardingsCarpeta'

// Carpeta "Contratos" (solo admins): una carpeta por programa y adentro el contrato de ZapSign de cada
// cliente. Firmado = PDF rojo que se abre y se descarga; pendiente = PDF gris (todavía no firmó).
const ESTADOS = {
  firmado: { nombre: 'Firmado', color: '#28c840' },
  pendiente: { nombre: 'Falta firmar', color: '#ff9f0a' },
}
const CONTRATO = { entry: 'Entry Level', mid: 'Mid Level', high: 'High Level' }
const normal = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '—')
const archivo = (c) => `contrato-${normal(c.nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cliente'}.pdf`

function guardar(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Vista({ c }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!c.pdf) return undefined
    let vivo = true
    let creada = null
    setUrl(null)
    setError('')
    fetchContratoPdf(c.id)
      .then((b) => {
        creada = URL.createObjectURL(b)
        if (vivo) setUrl(creada)
      })
      .catch((e) => vivo && setError(e.message))
    return () => {
      vivo = false
      if (creada) URL.revokeObjectURL(creada)
    }
  }, [c.id, c.pdf])

  async function bajar() {
    guardar(await fetchContratoPdf(c.id), archivo(c))
  }

  return (
    <div className="ob-vista">
      <div className="ob-vista__barra">
        <div className="ob-vista__quien">
          <b>{archivo(c)}</b>
          <span>
            {c.programa}
            {c.contrato && CONTRATO[c.contrato] !== c.programa ? ` (firma el de ${CONTRATO[c.contrato]})` : ''}
            {c.pago ? ` · ${c.pago}` : ''} · <span className="fd-tag" style={{ '--tag': ESTADOS[c.estado].color }}>{ESTADOS[c.estado].nombre}</span>
            {c.firmado_en ? ` · ${fecha(c.firmado_en)}` : ''}
          </span>
        </div>
        <div className="ob-acciones">{c.pdf ? <button type="button" className="fd-boton" onClick={bajar}>Descargar PDF</button> : null}</div>
      </div>
      {c.pdf ? (
        error ? <p className="fd-vacio">{error}</p> : url ? <iframe className="ob-vista__pdf" src={`${url}#navpanes=0&view=FitH`} title={`Contrato de ${c.nombre}`} /> : <p className="fd-vacio">Abriendo el contrato…</p>
      ) : (
        <div className="ob-vista__vacia">
          <IconoPdf tamano={96} apagado />
          <b>{c.nombre} todavía no firmó</b>
          <span>Se le generó el contrato el {fecha(c.enviado_en)}. Cuando firme en ZapSign aparece acá el PDF.</span>
        </div>
      )}
    </div>
  )
}

export default function ContratosCarpeta({ abierta, alCerrar, alEnfocar, alFrente }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [programa, setPrograma] = useState(null) // null = la raíz, con una carpeta por programa
  const [dentro, setDentro] = useState(null)
  const [sel, setSel] = useState(null)
  const [buscar, setBuscar] = useState('')
  const [grande, setGrande] = useState(false)
  const [zip, setZip] = useState('')
  const ventana = useRef(null)
  const pos = useRef({ x: 60, y: 40 })

  useEffect(() => {
    if (!abierta) return
    fetchContratos()
      .then((d) => {
        setDatos(d)
        setError('')
      })
      .catch((e) => setError(e.message || 'No se pudieron cargar los contratos.'))
  }, [abierta])

  const contratos = datos?.contratos || []
  const de = (p) => contratos.filter((c) => c.programa === p)
  const visibles = useMemo(() => {
    const q = normal(buscar.trim())
    return contratos.filter((c) => (q ? normal(c.nombre).includes(q) || normal(c.email).includes(q) : c.programa === programa))
  }, [contratos, programa, buscar])
  const actual = contratos.find((c) => c.id === dentro)
  const enRaiz = !programa && !buscar.trim()
  const firmados = visibles.filter((c) => c.pdf)

  function ir(p) {
    setPrograma(p)
    setDentro(null)
    setSel(null)
    setBuscar('')
  }

  async function bajarTodos() {
    setZip('Preparando…')
    try {
      const { default: JSZip } = await import('jszip')
      const z = new JSZip()
      for (const [i, c] of firmados.entries()) {
        setZip(`${i + 1} de ${firmados.length}`)
        z.file(archivo(c), await fetchContratoPdf(c.id))
      }
      guardar(await z.generateAsync({ type: 'blob' }), `contratos-${normal(programa || 'busqueda').replace(/[^a-z0-9]+/g, '-')}.zip`)
    } catch (e) {
      setError(e.message || 'No se pudo armar el zip.')
    } finally {
      setZip('')
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

  function atras() {
    if (dentro) setDentro(null)
    else ir(null)
  }

  return (
    <div
      ref={ventana}
      className={`fd-ventana${abierta ? ' is-abierta' : ''}${grande ? ' is-grande' : ''}${alFrente ? ' is-frente' : ''}`}
      style={grande ? undefined : { transform: `translate(${pos.current.x}px, ${pos.current.y}px)` }}
      onPointerDown={alEnfocar}
      onKeyDown={(e) => {
        if (e.target.tagName === 'INPUT') return
        if (e.key === 'Enter' && sel && !dentro) (enRaiz ? ir(sel) : setDentro(sel))
        if (e.key === 'Backspace' && (dentro || programa)) atras()
      }}
      tabIndex={-1}
      role="dialog"
      aria-label="Contratos"
      aria-hidden={!abierta}
    >
      <aside className="fd-lateral">
        <div className="mac-semaforo fd-semaforo">
          <button type="button" aria-label="Cerrar" onClick={alCerrar}><svg viewBox="0 0 8 8"><path d="M1.5 1.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          <button type="button" aria-label="Minimizar" onClick={alCerrar}><svg viewBox="0 0 8 8"><path d="M1.2 4h5.6" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          <button type="button" aria-label="Agrandar" onClick={() => setGrande((g) => !g)}><svg viewBox="0 0 8 8"><path d="M2 2h3L2 5zM6 6H3l3-3z" fill="currentColor" /></svg></button>
        </div>
        <h5>Contratos</h5>
        <button type="button" className={`fd-lado${enRaiz ? ' is-activo' : ''}`} onClick={() => ir(null)}>
          <IconoCarpeta tamano={16} />
          <span>Todos los programas</span>
          <small>{contratos.length || ''}</small>
        </button>
        <h5>Programas</h5>
        {(datos?.programas || []).map((p) => (
          <button key={p} type="button" className={`fd-lado${programa === p && !buscar.trim() ? ' is-activo' : ''}`} onClick={() => ir(p)}>
            <IconoCarpeta tamano={16} />
            <span>{p}</span>
            <small>{de(p).length || ''}</small>
          </button>
        ))}
      </aside>

      <div className="fd-principal">
        <header className="fd-barra" onPointerDown={arrastrar} onDoubleClick={(e) => !e.target.closest('button, input') && setGrande((g) => !g)}>
          <div className="fd-nav">
            <button type="button" onClick={atras} disabled={enRaiz && !dentro} aria-label="Atrás">
              <svg viewBox="0 0 10 16"><path d="M8 2L2 8l6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          <h3>{dentro ? actual?.nombre || 'Contrato' : buscar.trim() ? 'Búsqueda' : programa || 'Contratos'}</h3>
          {!dentro && !enRaiz ? (
            <div className="ob-barra-der">
              <button type="button" className="ob-todos" onClick={bajarTodos} disabled={Boolean(zip) || !firmados.length} title="Los contratos firmados de esta carpeta, en un zip">
                {zip || `Descargar todos (${firmados.length})`}
              </button>
            </div>
          ) : <span />}
          <label className="fd-buscar">
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <input type="search" placeholder="Buscar cliente" value={buscar} onChange={(e) => { setBuscar(e.target.value); setDentro(null) }} />
          </label>
        </header>

        <div className={`fd-contenido${dentro ? ' is-vista' : ''}`} onClick={(e) => e.target === e.currentTarget && setSel(null)}>
          {error ? <p className="fd-vacio">{error}</p> : null}
          {!datos && !error ? <p className="fd-vacio">Cargando…</p> : null}
          {dentro && actual ? (
            <Vista c={actual} />
          ) : datos && enRaiz ? (
            <div className="fd-grilla" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
              {datos.programas.map((p) => (
                <button key={p} type="button" className={`fd-item${sel === p ? ' is-sel' : ''}`} onClick={() => setSel(p)} onDoubleClick={() => ir(p)} title={`${p} · ${de(p).length} contratos`}>
                  <IconoCarpeta tamano={64} />
                  <span>{p}</span>
                  <small className="fd-gris">{de(p).length ? `${de(p).filter((c) => c.pdf).length} firmados de ${de(p).length}` : 'Vacía'}</small>
                </button>
              ))}
            </div>
          ) : datos ? (
            <div className="fd-grilla" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
              {visibles.map((c) => (
                <button key={c.id} type="button" className={`fd-item${sel === c.id ? ' is-sel' : ''}`} onClick={() => setSel(c.id)} onDoubleClick={() => setDentro(c.id)} title={`${c.nombre} · ${ESTADOS[c.estado].nombre}`}>
                  <span className="ob-icono">
                    <IconoPdf tamano={64} apagado={!c.pdf} />
                    {!c.pdf ? <i className="ob-icono__aviso ct-pendiente" title="Falta firmar" /> : null}
                  </span>
                  <span>{c.nombre}</span>
                </button>
              ))}
            </div>
          ) : null}
          {datos && !enRaiz && !visibles.length && !dentro ? (
            <p className="fd-vacio">{buscar.trim() ? 'Ningún contrato con ese nombre.' : `Todavía no hay contratos de ${programa}.`}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
