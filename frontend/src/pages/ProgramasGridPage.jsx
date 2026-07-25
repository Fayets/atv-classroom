import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, fetchProgramas } from '../api/client'
import AppHeader from '../components/AppHeader'
import AccesoRestante from '../components/AccesoRestante'
import MainNav from '../components/MainNav'

import { getModuloCoverUrl } from '../utils/modules'

function ModuleCard({ modulo, onSelect }) {
  const progreso = Math.min(100, Math.max(0, modulo.porcentaje_progreso ?? 0))
  const label = modulo.titulo || 'Módulo'
  const coverUrl = getModuloCoverUrl(modulo)

  return (
    <article
      className="module-card"
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => onSelect(modulo.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(modulo.id)
        }
      }}
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          className="module-card__img"
          loading="lazy"
        />
      ) : (
        <div className="module-card__fallback" aria-hidden="true">
          {label}
        </div>
      )}
      {progreso > 0 ? (
        <div className="module-card__progress" aria-hidden="true">
          <div
            className="module-card__progress-fill"
            style={{ width: `${progreso}%` }}
          />
        </div>
      ) : null}
    </article>
  )
}

export default function ProgramasGridPage() {
  const navigate = useNavigate()

  const [programas, setProgramas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadProgramas() {
      setCargando(true)
      setError('')

      try {
        const data = await fetchProgramas()
        if (!cancelled) {
          setProgramas(Array.isArray(data) ? data : [])
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          return
        }
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar los módulos.',
        )
      } finally {
        if (!cancelled) {
          setCargando(false)
        }
      }
    }

    loadProgramas()

    return () => {
      cancelled = true
    }
  }, [])

  function handleSelectModulo(id) {
    navigate(`/classroom/${id}`)
  }

  return (
    <div className="app-shell hub-page classroom-page">
      <div className="hub-page__halo" aria-hidden="true" />

      <AppHeader />

      <main className="hub-page__main classroom-page__main">
        <div className="hub-page__hero classroom-page__hero">
          <p className="hub-page__eyebrow">Aumenta tu valor</p>

          <h1 className="hub-page__title">
            Tus{' '}
            <em className="hub-page__title-em">módulos</em>
          </h1>

          <MainNav activeTab="classroom" />

          <AccesoRestante />
        </div>

        <div className="classroom-page__content">
          {cargando ? (
            <div className="page-state page-state--plain">
              <p className="page-state__title">Cargando módulos…</p>
            </div>
          ) : error ? (
            <div className="page-state page-state--error">
              <p className="page-state__title">No se pudo cargar el contenido</p>
              <p className="page-state__text">{error}</p>
            </div>
          ) : programas.length === 0 ? (
            <div className="page-state page-state--plain">
              <p className="page-state__title">Todavía no hay módulos</p>
              <p className="page-state__text">
                Cuando se publiquen cursos, van a aparecer acá.
              </p>
            </div>
          ) : (
            <div className="modulos-grid">
              {programas.map((modulo) => (
                <ModuleCard
                  key={modulo.id}
                  modulo={modulo}
                  onSelect={handleSelectModulo}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
