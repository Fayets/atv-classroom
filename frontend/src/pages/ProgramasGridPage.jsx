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

  return (
    <div className="app-shell im-root">
      <AppHeader />
      <main className="mt-grid-page">
        <header className="mt-grid-head">
          <Link to="/" className="im-back">
            <Chevron dir="left" /> Inicio
          </Link>
          <h1>Todo el material</h1>
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
          <div className="mt-grid">
            {programas.map((m, i) => {
              const vacio = !m.total_clases
              const cerrado = vacio || m.bloqueado
              const pct = Math.min(100, Math.max(0, m.porcentaje_progreso ?? 0))
              const contenido = (
                <>
                  <span className="mt-card__cover">
                    <img src={getModuloCoverUrl(m)} alt="" loading="lazy" decoding="async" />
                  </span>
                  <span className="mt-card__info">
                    <span className="mt-card__row">
                      <b>{m.titulo}</b>
                      {m.bloqueado && vacio ? null : <span className="num">{vacio ? 'Próximamente' : `${m.total_clases} clases`}</span>}
                    </span>
                    {m.bloqueado ? (
                      <span className="mt-card__lock">
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
                          <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
                        </svg>
                        Se desbloquea pronto
                      </span>
                    ) : vacio ? null : (
                      <span className="mt-card__row">
                        <span className="mt-bar" aria-hidden="true">
                          <i style={{ transform: `scaleX(${pct / 100})` }} />
                        </span>
                        <span className="num mt-card__pct">{pct}%</span>
                      </span>
                    )}
                  </span>
                </>
              )
              return cerrado ? (
                <div key={m.id} className={`mt-card is-soon${m.bloqueado ? ' is-locked' : ''}`} style={{ '--i': i }}>
                  {contenido}
                </div>
              ) : (
                <Link key={m.id} to={`/classroom/${m.id}`} className="mt-card" style={{ '--i': i }}>
                  {contenido}
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

const normal = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Todos los SOPs de los videos: un estante por módulo y cada SOP como una tapa con el isotipo de ATV.
// Al tocar una tapa se abren abajo sus documentos y el video.
const TONOS = ['oscura', 'piedra', 'blanca', 'oscura', 'piedra', 'roja', 'blanca', 'piedra']

function VistaSops() {
  const [modulos, setModulos] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [abierta, setAbierta] = useState(null)

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
    if (!palabras.length) return modulos
    return modulos
      .map((m) => ({
        ...m,
        sops: m.sops.filter((s) => {
          const texto = normal(`${s.titulo} ${s.seccion} ${m.modulo} ${s.documentos.map((d) => d.titulo).join(' ')}`)
          return palabras.every((p) => texto.includes(p))
        }),
      }))
      .filter((m) => m.sops.length)
  }, [modulos, q])

  if (error) return <p className="im-error">{error}</p>
  if (!filtrados) return <p className="pc-loading">Cargando SOPs…</p>
  const total = modulos.reduce((n, m) => n + m.sops.length, 0)

  return (
    <div className="mt-sops">
      <input className="mt-sops__buscar" type="search" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={`Buscar entre los ${total} SOPs`} aria-label="Buscar SOP" autoComplete="off" />
      {filtrados.length ? (
        filtrados.map((m, mi) => (
          <Estante key={m.programa_id} modulo={m} indice={mi} abierta={abierta} onAbrir={setAbierta} />
        ))
      ) : (
        <p className="mt-sops__vacio">
          No hay un SOP con eso. <Link to="/">Pedilo desde el inicio</Link> y te lo armamos.
        </p>
      )}
    </div>
  )
}

function Estante({ modulo: m, indice, abierta, onAbrir }) {
  const filaRef = useRef(null)
  const sop = m.sops.find((s) => s.clase_id === abierta)
  const correr = (dir) => filaRef.current?.scrollBy({ left: dir * filaRef.current.clientWidth * 0.8, behavior: 'smooth' })

  return (
    <section className="mt-estante">
      <div className="mt-estante__cab">
        <h2>
          {m.modulo} <span className="num">{m.sops.length}</span>
        </h2>
        <div className="mt-estante__flechas">
          <button type="button" onClick={() => correr(-1)} aria-label={`Anteriores de ${m.modulo}`}>
            <Chevron dir="left" />
          </button>
          <button type="button" onClick={() => correr(1)} aria-label={`Siguientes de ${m.modulo}`}>
            <Chevron />
          </button>
        </div>
      </div>
      <div className="mt-estante__fila" ref={filaRef}>
        {m.sops.map((s, i) => (
          <button
            key={s.clase_id}
            type="button"
            className={`mt-tapa is-${TONOS[(i + indice) % TONOS.length]}${abierta === s.clase_id ? ' is-on' : ''}`}
            onClick={() => onAbrir(abierta === s.clase_id ? null : s.clase_id)}
            aria-expanded={abierta === s.clase_id}
          >
            <span className="mt-tapa__cab">
              <span className="num">SOP {String(i + 1).padStart(2, '0')}</span>
              <Isotipo className="mt-tapa__logo" titulo="ATV" />
            </span>
            <b>{tituloLindo(s.titulo)}</b>
            <small>{tituloLindo(s.seccion)}</small>
            <span className="mt-tapa__pie">
              {[...new Set(s.documentos.map((d) => tipoRecurso(d).tag))].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </span>
            <Isotipo className="mt-tapa__marca" />
          </button>
        ))}
      </div>
      {sop ? (
        <div className="mt-estante__det">
          <div className="mt-estante__det-txt">
            <h3>{tituloLindo(sop.titulo)}</h3>
            <span>
              {m.modulo} › {tituloLindo(sop.seccion)}
            </span>
          </div>
          <Link to={`/classroom/${m.programa_id}?clase=${sop.clase_id}`} className="pc-btn pc-btn--light">
            Ver video <Chevron />
          </Link>
          <div className="mt-estante__docs">
            {sop.documentos.map((d) => (
              <a key={d.id} href={urlRecurso(d.url)} target="_blank" rel="noopener noreferrer" className="im-sopchip">
                <span>{tipoRecurso(d).tag}</span>
                {/^(documento|planilla|formulario) google/i.test(d.titulo) ? tipoRecurso(d).label : d.titulo}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
