import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, fetchProgramas, fetchSopsClassroom } from '../api/client'
import AppHeader from '../components/AppHeader'
import { Chevron } from '../components/frentes/piezas'
import Isotipo from '../components/marca/Isotipo'
import { tipoRecurso, tituloLindo, urlRecurso } from '../utils/frentes'
import { getModuloCoverUrl } from '../utils/modules'
import '../styles/frentes.css'
import '../styles/material.css'
import '../styles/classroom-rediseno.css'

// Todo el material, módulo por módulo. Al día a día se entra por la guía del inicio.
export default function ProgramasGridPage() {
  const [params, setParams] = useSearchParams()
  const vista = params.get('vista') === 'sops' ? 'sops' : 'modulos'
  const [programas, setProgramas] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelado = false
    fetchProgramas()
      .then((data) => {
        if (!cancelado) setProgramas(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        if (cancelado || (err instanceof ApiError && err.status === 401)) return
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los módulos.')
      })
    return () => {
      cancelado = true
    }
  }, [])

  // El avance de todo el material: clases implementadas de los módulos abiertos.
  const resumen = useMemo(() => {
    const abiertos = (programas || []).filter((m) => !m.bloqueado && m.total_clases)
    const total = abiertos.reduce((n, m) => n + m.total_clases, 0)
    const hechas = abiertos.reduce((n, m) => n + Math.round((m.total_clases * (m.porcentaje_progreso ?? 0)) / 100), 0)
    return { modulos: abiertos.length, total, hechas, pct: total ? Math.round((100 * hechas) / total) : 0 }
  }, [programas])

  return (
    <div className="app-shell im-root cr-root">
      <AppHeader />
      <main className="mt-grid-page">
        <header className="mt-grid-head">
          <Link to="/" className="im-back">
            <Chevron dir="left" /> Inicio
          </Link>
          <h1>Todo el material</h1>
          {programas && resumen.total ? (
            <div className="cr-resumen">
              <p>
                <b className="num">{resumen.hechas}</b> de <span className="num">{resumen.total}</span> clases implementadas
                <span className="cr-resumen__sep" aria-hidden="true">·</span>
                <span className="num">{resumen.modulos}</span> módulos abiertos
              </p>
              <span className="cr-resumen__barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={resumen.pct} aria-label="Avance de todo el material">
                <i style={{ transform: `scaleX(${resumen.pct / 100})` }} />
              </span>
            </div>
          ) : null}
          <div className="mt-vistas" role="tablist" aria-label="Ver por">
            {[['modulos', 'Módulos'], ['sops', 'SOPs']].map(([v, label]) => (
              <button key={v} type="button" role="tab" aria-selected={vista === v} className={vista === v ? 'is-on' : ''}
                onClick={() => setParams(v === 'sops' ? { vista: 'sops' } : {}, { replace: true })}>
                {label}
              </button>
            ))}
          </div>
        </header>

        {vista === 'sops' ? <VistaSops /> : error ? (
          <p className="im-error">{error}</p>
        ) : !programas ? (
          <p className="pc-loading">Cargando módulos…</p>
        ) : (
          <IndiceModulos modulos={programas} />
        )}
      </main>
    </div>
  )
}

// Todo el material como el índice de un libro: una fila por módulo con su número y su nombre en grande.
// La línea de abajo de cada fila es su barra de avance. Con mouse, la portada aparece flotando junto al
// cursor (las demás filas se apagan); en el celular va como miniatura en la fila. Arriba, un acceso
// directo al módulo que quedó a medio hacer.
function IndiceModulos({ modulos }) {
  const marco = useRef(null)
  const vista = useRef(null)
  const [enFoco, setEnFoco] = useState(null) // el módulo bajo el mouse
  const posicion = useRef({ x: 0, y: 0, cuadro: 0 })

  // La vista previa sigue al cursor con transform (sin re-render en cada movimiento). Va relativa a esta
  // sección y no a la pantalla: en el escritorio del equipo la ventana es el contenedor de lo "fixed".
  const mover = (e) => {
    posicion.current.x = e.clientX
    posicion.current.y = e.clientY
    if (posicion.current.cuadro) return
    posicion.current.cuadro = requestAnimationFrame(() => {
      posicion.current.cuadro = 0
      const caja = marco.current?.getBoundingClientRect()
      if (!caja) return
      vista.current?.style.setProperty('--x', `${posicion.current.x - caja.left}px`)
      vista.current?.style.setProperty('--y', `${posicion.current.y - caja.top}px`)
    })
  }
  useEffect(() => () => cancelAnimationFrame(posicion.current.cuadro), [])

  const seguir = modulos.find((m) => !m.bloqueado && m.total_clases && (m.porcentaje_progreso ?? 0) > 0 && m.porcentaje_progreso < 100)

  return (
    <div className="cr-material" ref={marco}>
      {seguir ? (
        <Link to={`/classroom/${seguir.id}`} className="cr-seguir">
          <span className="cr-seguir__portada" aria-hidden="true">
            <img src={getModuloCoverUrl(seguir)} alt="" decoding="async" />
          </span>
          <span className="cr-seguir__txt">
            <small>Seguí donde quedaste</small>
            <b>{seguir.titulo}</b>
          </span>
          <span className="cr-seguir__pct num">{seguir.porcentaje_progreso}%</span>
          <span className="cr-seguir__ir" aria-hidden="true">
            <Chevron />
          </span>
        </Link>
      ) : null}

      <ol
        className={`cr-indice${enFoco ? ' con-foco' : ''}`}
        onMouseMove={mover}
        onMouseLeave={() => setEnFoco(null)}
        aria-label="Módulos"
      >
        {modulos.map((m, i) => {
          const vacio = !m.total_clases
          const cerrado = vacio || m.bloqueado
          const pct = Math.min(100, Math.max(0, m.porcentaje_progreso ?? 0))
          const completo = !cerrado && pct === 100
          const numero = String(i + 1).padStart(2, '0')
          const estado = m.bloqueado
            ? m.motivo_bloqueo === 'plan' ? 'Bloqueado' : 'Se desbloquea pronto'
            : vacio
              ? 'Próximamente'
              : completo
                ? 'Completo'
                : pct
                  ? `${pct}%`
                  : 'Sin empezar'
          const fila = (
            <>
              <span className="cr-fila__num num" aria-hidden="true">
                {completo ? (
                  <svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg>
                ) : (
                  numero
                )}
              </span>
              <span className="cr-fila__mini" aria-hidden="true">
                <img src={getModuloCoverUrl(m)} alt="" loading="lazy" decoding="async" />
              </span>
              <span className="cr-fila__titulo">{m.titulo}</span>
              <span className="cr-fila__meta">
                {vacio ? null : <span className="num">{m.total_clases} clases</span>}
                <span className={`cr-fila__estado${cerrado ? ' is-cerrado' : completo ? ' is-completo' : pct ? ' is-avance' : ''}`}>
                  {m.bloqueado ? (
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
                      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
                    </svg>
                  ) : null}
                  {estado}
                </span>
              </span>
              <span className="cr-fila__ir" aria-hidden="true">
                {cerrado ? null : <Chevron />}
              </span>
              <span className="cr-fila__avance" aria-hidden="true">
                <i style={{ transform: `scaleX(${cerrado ? 0 : pct / 100})` }} />
              </span>
            </>
          )
          const clases = `cr-fila${cerrado ? ' is-cerrado' : ''}${completo ? ' is-completo' : ''}${enFoco?.id === m.id ? ' is-foco' : ''}`
          return (
            <li key={m.id} style={{ '--i': i }}>
              {cerrado ? (
                <div className={clases} onMouseEnter={() => setEnFoco(m)}>
                  {fila}
                </div>
              ) : (
                <Link
                  to={`/classroom/${m.id}`}
                  className={clases}
                  onMouseEnter={() => setEnFoco(m)}
                  aria-label={`${m.titulo}: ${m.total_clases} clases, ${estado}`}
                >
                  {fila}
                </Link>
              )}
            </li>
          )
        })}
      </ol>

      {/* La portada que sigue al cursor. Una sola para toda la lista: cambia la imagen, no se crea otra. */}
      <div className={`cr-vista${enFoco ? ' is-visible' : ''}${enFoco && (enFoco.bloqueado || !enFoco.total_clases) ? ' is-cerrado' : ''}`} ref={vista} aria-hidden="true">
        {enFoco ? <img src={getModuloCoverUrl(enFoco)} alt="" decoding="async" /> : null}
      </div>
    </div>
  )
}

const normal = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Todos los SOPs como una mesa de documentos: cada SOP es una hoja (una pila si trae varios documentos),
// con el tipo de cada documento como pestaña de carpeta. Arriba, el buscador y un filtro por módulo.
// Al tocar una hoja se abre el lector al costado, con los documentos y el video.
function VistaSops() {
  const [modulos, setModulos] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [modulo, setModulo] = useState(null) // programa_id elegido en el filtro; null = todos
  const [abierta, setAbierta] = useState(null) // { sop, modulo }
  const [filtros, setFiltros] = useState(false) // celular y tablet: los chips de módulo viven en un desplegable
  // En el celular el buscador es angosto: el texto de ayuda queda en la pregunta, sin "Hay N SOPs".
  const [angosto, setAngosto] = useState(() => window.matchMedia('(max-width: 720px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)')
    const cambiar = () => setAngosto(mq.matches)
    mq.addEventListener('change', cambiar)
    return () => mq.removeEventListener('change', cambiar)
  }, [])

  useEffect(() => {
    let cancelado = false
    fetchSopsClassroom()
      .then((d) => !cancelado && setModulos(Array.isArray(d) ? d : []))
      .catch((err) => {
        if (cancelado || (err instanceof ApiError && (err.status === 401 || err.status === 423))) return
        setError('No se pudieron cargar los SOPs.')
      })
    return () => {
      cancelado = true
    }
  }, [])

  const filtrados = useMemo(() => {
    if (!modulos) return null
    const palabras = normal(q).split(/\s+/).filter(Boolean)
    return modulos
      .filter((m) => modulo == null || m.programa_id === modulo)
      .map((m) => ({
        ...m,
        sops: palabras.length
          ? m.sops.filter((s) => {
              const texto = normal(`${s.titulo} ${s.seccion} ${m.modulo} ${s.documentos.map((d) => d.titulo).join(' ')}`)
              return palabras.every((p) => texto.includes(p))
            })
          : m.sops,
      }))
      .filter((m) => m.sops.length)
  }, [modulos, q, modulo])

  if (error) return <p className="im-error">{error}</p>
  if (!filtrados) return <p className="pc-loading">Cargando SOPs…</p>
  const total = modulos.reduce((n, m) => n + m.sops.length, 0)
  const visibles = filtrados.reduce((n, m) => n + m.sops.length, 0)

  return (
    <div className="cr-mesa">
      <div className="cr-mesa__buscar">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={angosto ? '¿Qué proceso buscás?' : `¿Qué proceso buscás? Hay ${total} SOPs`}
          aria-label="Buscar SOP"
          autoComplete="off"
        />
        {q || modulo != null ? <span className="cr-mesa__cuenta num">{visibles} de {total}</span> : null}
        <button
          type="button"
          className={`cr-mesa__filtros${filtros ? ' is-on' : ''}`}
          onClick={() => setFiltros((f) => !f)}
          aria-expanded={filtros}
          aria-controls="cr-mesa-filtro"
          aria-label={modulo != null ? 'Filtros: 1 módulo elegido' : 'Filtros'}
          title="Filtrar por módulo"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
          {modulo != null ? <i aria-hidden="true" /> : null}
        </button>
      </div>

      <div id="cr-mesa-filtro" className={`cr-mesa__filtro${filtros ? ' is-abierto' : ''}`} role="group" aria-label="Filtrar por módulo">
        <p className="cr-mesa__filtro-titulo">Filtrar por módulo</p>
        <button type="button" className={modulo == null ? 'is-on' : ''} aria-pressed={modulo == null} onClick={() => {
            setModulo(null)
            setFiltros(false)
          }}>
          Todos <span className="num">{total}</span>
        </button>
        {modulos.map((m) => (
          <button
            key={m.programa_id}
            type="button"
            className={modulo === m.programa_id ? 'is-on' : ''}
            aria-pressed={modulo === m.programa_id}
            onClick={() => {
              setModulo(modulo === m.programa_id ? null : m.programa_id)
              setFiltros(false)
            }}
          >
            {m.modulo} <span className="num">{m.sops.length}</span>
          </button>
        ))}
      </div>

      {filtrados.length ? (
        filtrados.map((m) => (
          <section key={m.programa_id} className="cr-mesa__grupo" aria-label={m.modulo}>
            <h2>
              {m.modulo} <span className="num">{m.sops.length}</span>
            </h2>
            <ul className="cr-hojas">
              {m.sops.map((s, i) => (
                <li key={s.clase_id} style={{ '--i': i }}>
                  <Hoja sop={s} numero={i + 1} modulo={m.modulo} activa={abierta?.sop.clase_id === s.clase_id} onAbrir={() => setAbierta({ sop: s, modulo: m })} />
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className="mt-sops__vacio">
          No hay un SOP con eso. <Link to="/">Pedilo desde el inicio</Link> y te lo armamos.
        </p>
      )}

      {abierta ? <LectorSop sop={abierta.sop} modulo={abierta.modulo} onCerrar={() => setAbierta(null)} /> : null}
    </div>
  )
}

// Una hoja: número y módulo arriba, el título, renglones de papel y el sello ATV. Los tipos de sus
// documentos asoman arriba como pestañas de carpeta; con más de un documento, se ve la pila detrás.
function Hoja({ sop, numero, modulo, activa, onAbrir }) {
  const tipos = [...new Set(sop.documentos.map((d) => tipoRecurso(d).tag))]
  const pila = Math.min(sop.documentos.length, 3)
  return (
    <button type="button" className={`cr-hoja${activa ? ' is-activa' : ''}`} data-pila={pila} onClick={onAbrir} aria-haspopup="dialog">
      <span className="cr-hoja__pestanas" aria-hidden="true">
        {tipos.map((t) => (
          <span key={t} className={`cr-pestana is-${t.toLowerCase()}`}>{t}</span>
        ))}
      </span>
      <span className="cr-hoja__papel">
        <span className="cr-hoja__cab">
          <span className="num">SOP {String(numero).padStart(2, '0')}</span>
          <span>{modulo}</span>
        </span>
        <b className="cr-hoja__titulo">{tituloLindo(sop.titulo)}</b>
        <small className="cr-hoja__seccion">{tituloLindo(sop.seccion)}</small>
        <span className="cr-hoja__renglones" aria-hidden="true" />
        <span className="cr-hoja__pie">
          <span>
            {sop.documentos.length} {sop.documentos.length === 1 ? 'documento' : 'documentos'}
            {sop.con_video === false ? '' : ' · video'}
          </span>
          <Isotipo className="cr-hoja__sello" />
        </span>
      </span>
    </button>
  )
}

// El lector: un panel al costado con el SOP abierto, sus documentos y el video. Esc o tocar afuera lo cierra.
function LectorSop({ sop, modulo, onCerrar }) {
  const cerrar = useRef(onCerrar)
  cerrar.current = onCerrar
  const panel = useRef(null)
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && cerrar.current()
    document.addEventListener('keydown', esc)
    panel.current?.focus()
    return () => document.removeEventListener('keydown', esc)
  }, [sop.clase_id])

  return (
    <div className="cr-lector" role="presentation">
      <div className="cr-lector__fondo" onClick={onCerrar} aria-hidden="true" />
      <aside className="cr-lector__panel" role="dialog" aria-modal="true" aria-label={tituloLindo(sop.titulo)} tabIndex={-1} ref={panel}>
        <header className="cr-lector__cab">
          <span className="cr-lector__ruta">
            {modulo.modulo} › {tituloLindo(sop.seccion)}
          </span>
          <button type="button" className="cr-lector__cerrar" onClick={onCerrar} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <h3>{tituloLindo(sop.titulo)}</h3>

        <p className="cr-lector__eti">Documentos</p>
        <ul className="cr-lector__docs">
          {sop.documentos.map((d) => {
            const { tag, label } = tipoRecurso(d)
            return (
              <li key={d.id}>
                <a href={urlRecurso(d.url)} target="_blank" rel="noopener noreferrer">
                  <span className={`cr-pestana is-${tag.toLowerCase()}`}>{tag}</span>
                  <span className="cr-lector__doc">
                    <b>{/^(documento|planilla|formulario) google/i.test(d.titulo) ? label : d.titulo}</b>
                    <small>{label}</small>
                  </span>
                  <Chevron />
                </a>
              </li>
            )
          })}
        </ul>

        <p className="cr-lector__eti">La clase</p>
        {sop.con_video === false ? (
          <span className="cr-lector__pronto">Video próximamente</span>
        ) : (
          <Link to={`/classroom/${modulo.programa_id}?clase=${sop.clase_id}`} className="cr-lector__video">
            <span className="cr-lector__play" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" /></svg>
            </span>
            <span>
              <b>Ver el video de la clase</b>
              <small>{modulo.modulo}</small>
            </span>
            <Chevron />
          </Link>
        )}
      </aside>
    </div>
  )
}
