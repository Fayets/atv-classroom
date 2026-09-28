import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Chevron } from '../frentes/piezas'
import { tituloLindo } from '../../utils/frentes'
import IndiceClases from './IndiceClases'

// Arriba de la clase: volver, el índice (también con ⌘K) y el avance del módulo por tramos.
export default function BarraModulo({ titulo, secciones, claseActivaId, seccionTitulo, numero, total, onSelectClase }) {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAbierto((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const todas = secciones.flatMap((s) => s.clases ?? [])
  const hechas = todas.filter((c) => c.completado).length

  return (
    <div className="ms-barra">
      <div className="ms-barra__fila">
        <Link to="/classroom" className="im-back">
          <Chevron dir="left" /> Todo el material
        </Link>
        <button type="button" className="ms-indice-btn" onClick={() => setAbierto(true)} aria-haspopup="dialog">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2.5 4h11M2.5 8h11M2.5 12h7" />
          </svg>
          <span>
            <b>{titulo}</b>
            {seccionTitulo ? <> · {tituloLindo(seccionTitulo)}</> : null}
            {numero ? <span className="num"> · Clase {numero} de {total}</span> : null}
          </span>
          <kbd>⌘K</kbd>
        </button>
        <span className="ms-barra__avance num">
          {hechas} de {todas.length} implementadas
        </span>
      </div>

      <div className="ms-tramos" aria-label="Avance del módulo">
        {secciones.map((s) => {
          const clases = s.clases ?? []
          if (!clases.length) return null
          const actual = clases.some((c) => c.id === claseActivaId)
          return (
            <div key={s.id} className={`ms-tramo${actual ? ' is-actual' : ''}`} style={{ flexGrow: clases.length }}>
              <div className="ms-tramo__segs">
                {clases.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`ms-seg${c.completado ? ' is-done' : ''}${c.id === claseActivaId ? ' is-now' : ''}`}
                    onClick={() => onSelectClase(c.id)}
                    title={tituloLindo(c.titulo)}
                    aria-label={tituloLindo(c.titulo)}
                    aria-current={c.id === claseActivaId ? 'true' : undefined}
                  />
                ))}
              </div>
              <span className="ms-tramo__t">{tituloLindo(s.titulo)}</span>
            </div>
          )
        })}
      </div>

      {abierto ? (
        <IndiceClases
          titulo={titulo}
          secciones={secciones}
          claseActivaId={claseActivaId}
          onElegir={(id) => {
            setAbierto(false)
            onSelectClase(id)
          }}
          onCerrar={() => setAbierto(false)}
        />
      ) : null}
    </div>
  )
}
