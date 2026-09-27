import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Chevron } from './frentes/piezas'
import { tituloLindo } from '../utils/frentes'

function findSeccionIdForClase(secciones, claseId) {
  if (!claseId) return null
  for (const seccion of secciones) {
    if (seccion.clases?.some((clase) => clase.id === claseId)) {
      return seccion.id
    }
  }
  return null
}

export default function ProgramaSidebar({ titulo, secciones, claseActivaId, onSelectClase }) {
  const [expanded, setExpanded] = useState(() => new Set())

  const seccionActivaId = useMemo(() => findSeccionIdForClase(secciones, claseActivaId), [secciones, claseActivaId])

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
      if (next.has(seccionId)) next.delete(seccionId)
      else next.add(seccionId)
      return next
    })
  }

  const todas = secciones.flatMap((s) => s.clases ?? [])
  const vistas = todas.filter((c) => c.completado).length
  const pct = todas.length ? (vistas / todas.length) * 100 : 0

  return (
    <aside className="mt-side">
      <Link to="/classroom" className="im-back">
        <Chevron dir="left" /> Todo el material
      </Link>
      <div className="mt-side__mod">
        <h2>{titulo}</h2>
        <div className="mt-side__prog">
          <span className="mt-bar" aria-hidden="true">
            <i style={{ transform: `scaleX(${pct / 100})` }} />
          </span>
          <span className="num">
            {vistas}/{todas.length}
          </span>
        </div>
      </div>

      <nav className="mt-side__nav" aria-label="Clases del módulo">
        {secciones.map((seccion) => {
          const isOpen = expanded.has(seccion.id)
          const hechas = (seccion.clases ?? []).filter((c) => c.completado).length
          const total = seccion.clases?.length ?? 0
          return (
            <div key={seccion.id} className="mt-sec">
              <button type="button" className="mt-sec__head" onClick={() => toggleSection(seccion.id)} aria-expanded={isOpen}>
                <span>{tituloLindo(seccion.titulo)}</span>
                <span className="num mt-sec__count">{total && hechas === total ? '✓' : `${hechas}/${total}`}</span>
                <Chevron dir={isOpen ? 'down' : 'right'} />
              </button>
              {isOpen ? (
                <ul>
                  {seccion.clases.map((clase) => {
                    const activa = clase.id === claseActivaId
                    return (
                      <li key={clase.id}>
                        <button
                          type="button"
                          className={`mt-li${activa ? ' is-active' : ''}${clase.completado ? ' is-done' : ''}`}
                          onClick={() => onSelectClase(clase.id)}
                          aria-current={activa ? 'true' : undefined}
                        >
                          <Check done={clase.completado} now={activa} />
                          <span>{tituloLindo(clase.titulo)}</span>
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
