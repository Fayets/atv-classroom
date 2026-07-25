import { useEffect, useMemo, useState } from 'react'
import { formatNumeroClase } from '../utils/programa'

function findSeccionIdForClase(secciones, claseId) {
  if (!claseId) return null
  for (const seccion of secciones) {
    if (seccion.clases?.some((clase) => clase.id === claseId)) {
      return seccion.id
    }
  }
  return null
}

export default function ProgramaSidebar({
  titulo,
  totalClases,
  secciones,
  claseActivaId,
  onSelectClase,
  onVolver,
}) {
  const [expanded, setExpanded] = useState(() => new Set())

  const seccionActivaId = useMemo(
    () => findSeccionIdForClase(secciones, claseActivaId),
    [secciones, claseActivaId],
  )

  useEffect(() => {
    if (seccionActivaId == null) return
    setExpanded((prev) => {
      if (prev.has(seccionActivaId)) return prev
      const next = new Set(prev)
      next.add(seccionActivaId)
      return next
    })
  }, [seccionActivaId])

  function toggleSection(seccionId) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(seccionId)) {
        next.delete(seccionId)
      } else {
        next.add(seccionId)
      }
      return next
    })
  }

  const claseNumeros = useMemo(() => {
    const map = new Map()
    let contador = 0
    for (const seccion of secciones) {
      for (const clase of seccion.clases ?? []) {
        contador += 1
        map.set(clase.id, formatNumeroClase(contador))
      }
    }
    return map
  }, [secciones])

  return (
    <aside className="programa-sidebar">
      <div className="programa-sidebar__header">
        <button
          type="button"
          className="programa-sidebar__back"
          onClick={onVolver}
        >
          ← Classroom
        </button>
        <h2 className="programa-sidebar__title">{titulo}</h2>
        <p className="programa-sidebar__count">
          {totalClases} {totalClases === 1 ? 'clase' : 'clases'}
        </p>
      </div>

      <nav className="programa-sidebar__nav" aria-label="Contenido del módulo">
        {secciones.map((seccion) => {
          const isOpen = expanded.has(seccion.id)

          return (
            <div
              key={seccion.id}
              className={`programa-sidebar__section${isOpen ? ' programa-sidebar__section--open' : ''}`}
            >
              <button
                type="button"
                className="programa-sidebar__section-title"
                onClick={() => toggleSection(seccion.id)}
                aria-expanded={isOpen}
              >
                <span>{seccion.titulo}</span>
                <svg
                  className="programa-sidebar__section-chevron"
                  viewBox="0 0 12 12"
                  aria-hidden="true"
                >
                  <path
                    d="M4 2l4 4-4 4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {isOpen ? (
                <ul className="programa-sidebar__clases">
                  {seccion.clases.map((clase) => {
                    const activa = clase.id === claseActivaId
                    const numero = claseNumeros.get(clase.id)

                    return (
                      <li key={clase.id}>
                        <button
                          type="button"
                          className={`programa-sidebar__clase${activa ? ' programa-sidebar__clase--active' : ''}${clase.completado ? ' programa-sidebar__clase--done' : ''}`}
                          onClick={() => onSelectClase(clase.id)}
                          aria-current={activa ? 'true' : undefined}
                        >
                          <span className="programa-sidebar__clase-num">{numero}</span>
                          <span className="programa-sidebar__clase-title">
                            {clase.titulo}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
