import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, fetchProgramas } from '../api/client'
import AppHeader from '../components/AppHeader'
import { Chevron } from '../components/frentes/piezas'
import { getModuloCoverUrl } from '../utils/modules'
import '../styles/frentes.css'
import '../styles/material.css'

// Todo el material, módulo por módulo. Al día a día se entra por la guía del inicio.
export default function ProgramasGridPage() {
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
        </header>

        {error ? (
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
                    <img src={getModuloCoverUrl(m)} alt="" loading="lazy" />
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
