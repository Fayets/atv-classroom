import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ApiError,
  fetchClase,
  fetchPrograma,
  updateProgreso,
} from '../api/client'
import AppHeader from '../components/AppHeader'
import ClaseViewer from '../components/ClaseViewer'
import ProgramaSidebar from '../components/ProgramaSidebar'
import { getModuloCoverUrl } from '../utils/modules'
import { flattenClases, navegacionClase } from '../utils/programa'

function primeraClaseId(secciones) {
  for (const seccion of secciones) {
    if (seccion.clases?.length) {
      return seccion.clases[0].id
    }
  }
  return null
}

function recalcularProgreso(secciones) {
  const clases = secciones.flatMap((seccion) => seccion.clases ?? [])
  if (!clases.length) return 0
  const completadas = clases.filter((clase) => clase.completado).length
  return Math.round((completadas / clases.length) * 100)
}

function actualizarClaseEnPrograma(programa, claseId, completado) {
  const secciones = programa.secciones.map((seccion) => ({
    ...seccion,
    clases: seccion.clases.map((clase) =>
      clase.id === claseId ? { ...clase, completado } : clase,
    ),
  }))

  return {
    ...programa,
    secciones,
    porcentaje_progreso: recalcularProgreso(secciones),
  }
}

export default function ProgramaDetailPage() {
  const { programaId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [programa, setPrograma] = useState(null)
  const [claseDetalle, setClaseDetalle] = useState(null)
  const [cargandoPrograma, setCargandoPrograma] = useState(true)
  const [cargandoClase, setCargandoClase] = useState(false)
  const [guardandoProgreso, setGuardandoProgreso] = useState(false)
  const [error, setError] = useState('')

  const claseActivaId = searchParams.get('clase')
    ? Number(searchParams.get('clase'))
    : null

  const tieneContenido =
    programa?.secciones?.some((seccion) => seccion.clases?.length > 0) ?? false

  useEffect(() => {
    let cancelled = false

    async function loadPrograma() {
      setCargandoPrograma(true)
      setError('')

      try {
        const data = await fetchPrograma(programaId)
        if (!cancelled) {
          setPrograma(data)
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          return
        }
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo cargar el módulo.',
        )
      } finally {
        if (!cancelled) {
          setCargandoPrograma(false)
        }
      }
    }

    loadPrograma()

    return () => {
      cancelled = true
    }
  }, [programaId])

  useEffect(() => {
    if (!programa?.secciones?.length) return

    const todasLasClases = programa.secciones.flatMap(
      (seccion) => seccion.clases ?? [],
    )
    if (!todasLasClases.length) return

    const paramClase = searchParams.get('clase')
    const idDesdeUrl = paramClase ? Number(paramClase) : null
    const claseValida = todasLasClases.some((clase) => clase.id === idDesdeUrl)

    if (!claseValida) {
      const primera = primeraClaseId(programa.secciones)
      if (primera) {
        setSearchParams({ clase: String(primera) }, { replace: true })
      }
    }
  }, [programa, searchParams, setSearchParams])

  useEffect(() => {
    if (!claseActivaId || !tieneContenido) {
      setClaseDetalle(null)
      return
    }

    let cancelled = false

    async function loadClase() {
      setCargandoClase(true)

      try {
        const data = await fetchClase(claseActivaId)
        if (!cancelled) {
          setClaseDetalle(data)
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          return
        }
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo cargar la clase.',
        )
      } finally {
        if (!cancelled) {
          setCargandoClase(false)
        }
      }
    }

    loadClase()

    return () => {
      cancelled = true
    }
  }, [claseActivaId, tieneContenido])

  function handleSelectClase(id) {
    setSearchParams({ clase: String(id) })
  }

  async function handleToggleCompletado(completado) {
    if (!claseActivaId || guardandoProgreso) return

    setGuardandoProgreso(true)

    try {
      await updateProgreso(claseActivaId, completado)
      setClaseDetalle((prev) =>
        prev ? { ...prev, completado } : prev,
      )
      setPrograma((prev) =>
        prev
          ? actualizarClaseEnPrograma(prev, claseActivaId, completado)
          : prev,
      )
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return
      }
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar el progreso.',
      )
    } finally {
      setGuardandoProgreso(false)
    }
  }

  const progreso = Math.min(
    100,
    Math.max(0, programa?.porcentaje_progreso ?? 0),
  )
  const coverUrl = getModuloCoverUrl(programa)
  const clasesFlat = programa ? flattenClases(programa.secciones) : []
  const nav = navegacionClase(clasesFlat, claseActivaId)
  const seccionActiva = nav.actual?.seccionTitulo ?? null

  return (
    <div className={`app-shell${tieneContenido ? ' app-shell--player' : ''}`}>
      <AppHeader />

      <main
        className={`programa-detail${tieneContenido ? ' programa-detail--player' : ''}`}
      >
        {!tieneContenido ? (
          <div className="programa-detail__topbar">
            <button
              type="button"
              className="programa-detail__back"
              onClick={() => navigate('/classroom')}
            >
              Classroom
            </button>
            <span className="programa-detail__sep">/</span>
            <span className="programa-detail__current">
              {programa?.titulo || `Módulo ${programaId}`}
            </span>
          </div>
        ) : null}

        {cargandoPrograma ? (
          <div className="page-state page-state--plain">
            <p className="page-state__title">Cargando módulo…</p>
          </div>
        ) : error && !programa ? (
          <div className="page-state page-state--error">
            <p className="page-state__title">No se pudo cargar el módulo</p>
            <p className="page-state__text">{error}</p>
            <Link to="/classroom" className="programa-detail__link">
              Volver a Classroom
            </Link>
          </div>
        ) : tieneContenido ? (
          <div className="programa-detail__layout">
            <ProgramaSidebar
              titulo={programa.titulo}
              totalClases={clasesFlat.length}
              secciones={programa.secciones}
              claseActivaId={claseActivaId}
              onSelectClase={handleSelectClase}
              onVolver={() => navigate('/classroom')}
            />
            <div className="programa-detail__main">
              <div className="programa-detail__halo" aria-hidden="true" />
              {error ? (
                <p className="programa-detail__inline-error" role="alert">
                  {error}
                </p>
              ) : null}
              <ClaseViewer
                clase={claseDetalle}
                numero={nav.actual?.numero}
                seccionTitulo={seccionActiva}
                cargando={cargandoClase}
                guardando={guardandoProgreso}
                onToggleCompletado={handleToggleCompletado}
              />
            </div>
          </div>
        ) : (
          <>
            {coverUrl ? (
              <div className="programa-detail__cover-wrap">
                <img
                  src={coverUrl}
                  alt={programa.titulo}
                  className="programa-detail__cover"
                />
                {progreso > 0 ? (
                  <div className="programa-detail__progress">
                    <span>Progreso {progreso}%</span>
                    <div className="programa-detail__progress-track">
                      <div
                        className="programa-detail__progress-fill"
                        style={{ width: `${progreso}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="page-state page-state--plain">
              <p className="page-state__title">
                {programa?.titulo || 'Módulo'}
              </p>
              <p className="page-state__text">
                {programa?.descripcion ||
                  'El contenido de clases se publicará pronto.'}
              </p>
              <Link to="/classroom" className="programa-detail__link">
                Volver a Classroom
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
