import { useEffect, useRef, useState } from 'react'
import { Check } from '../frentes/piezas'
import { tituloLindo } from '../../utils/frentes'

function normalizar(t) {
  return (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Índice del módulo: se abre sobre la clase, con buscador. Esc o click afuera lo cierra.
export default function IndiceClases({ titulo, secciones, claseActivaId, onElegir, onCerrar }) {
  const [q, setQ] = useState('')
  const inputRef = useRef(null)
  const activaRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    activaRef.current?.scrollIntoView({ block: 'center' })
    function onKey(e) {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const filtro = normalizar(q.trim())
  const grupos = secciones
    .map((s) => ({ ...s, clases: (s.clases ?? []).filter((c) => !filtro || normalizar(c.titulo).includes(filtro)) }))
    .filter((s) => s.clases.length)

  return (
    <div className="ms-indice" role="dialog" aria-modal="true" aria-label={`Clases de ${titulo}`}>
      <button type="button" className="ms-indice__fondo" aria-label="Cerrar índice" onClick={onCerrar} />
      <div className="ms-indice__panel">
        <div className="ms-indice__buscar">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar en ${titulo}`} aria-label="Buscar clase" />
          <kbd>esc</kbd>
        </div>
        <div className="ms-indice__lista">
          {grupos.length ? (
            grupos.map((s) => (
              <section key={s.id}>
                <h3>{tituloLindo(s.titulo)}</h3>
                <ul>
                  {s.clases.map((c) => {
                    const activa = c.id === claseActivaId
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          ref={activa ? activaRef : undefined}
                          className={`ms-indice__item${activa ? ' is-active' : ''}`}
                          onClick={() => onElegir(c.id)}
                          aria-current={activa ? 'true' : undefined}
                        >
                          <Check done={c.completado} now={activa} />
                          <span>{tituloLindo(c.titulo)}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))
          ) : (
            <p className="ms-indice__vacio">Ninguna clase de {titulo} coincide con “{q}”.</p>
          )}
        </div>
      </div>
    </div>
  )
}
