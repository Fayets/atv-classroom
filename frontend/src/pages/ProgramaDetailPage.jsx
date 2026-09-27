import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ApiError,
  fetchClase,
  fetchPrograma,
  updateProgreso,
} from '../api/client'
import AppHeader from '../components/AppHeader'
import '../styles/frentes.css'
import '../styles/material.css'
import ClaseViewer from '../components/ClaseViewer'
import ProgramaSidebar from '../components/ProgramaSidebar'
import { Chevron } from '../components/frentes/piezas'
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

  const clasesFlat = programa ? flattenClases(programa.secciones) : []
  const nav = navegacionClase(clasesFlat, claseActivaId)

  return (
    <div className="app-shell im-root">
      <AppHeader />

      {cargandoPrograma ? (
        <p className="pc-loading">Cargando módulo…</p>
      ) : error && !programa ? (
        <main className="im-home">
          <p className="im-error">{error}</p>
          <Link to="/classroom" className="im-back">
            <Chevron dir="left" /> Todo el material
          </Link>
        </main>
      ) : tieneContenido ? (
        <main className="mt-player">
          <ProgramaSidebar
            titulo={programa.titulo}
            secciones={programa.secciones}
            claseActivaId={claseActivaId}
            onSelectClase={handleSelectClase}
          />
          <section className="mt-main">
            {error ? (
              <p className="im-error" role="alert">
                {error}
              </p>
            ) : null}
            <ClaseViewer
              clase={claseDetalle}
              modulo={programa.titulo}
              seccionTitulo={nav.actual?.seccionTitulo}
              numero={nav.actual?.numero}
              total={nav.total}
              anterior={nav.anterior}
              siguiente={nav.siguiente}
              cargando={cargandoClase}
              guardando={guardandoProgreso}
              onToggleCompletado={handleToggleCompletado}
              onIr={(id) => {
                handleSelectClase(id)
                window.scrollTo({ top: 0 })
              }}
            />
          </section>
        </main>
      ) : (
        <main className="im-home mt-vacio">
          <Link to="/classroom" className="im-back">
            <Chevron dir="left" /> Todo el material
          </Link>
          <h1>{programa?.titulo || 'Módulo'}</h1>
          <p className="pc-muted">{programa?.descripcion || 'Las clases de este módulo se publican pronto.'}</p>
        </main>
      )}
    </div>
  )
}
