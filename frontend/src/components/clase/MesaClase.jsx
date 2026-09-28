import { useEffect, useState } from 'react'
import { Check, Chevron, Recursos, Video } from '../frentes/piezas'
import TextoFormateado from '../frentes/TextoFormateado'
import { partirDescripcion, tituloLindo } from '../../utils/frentes'

// Qué claves ya aplicó cada uno: es una ayuda personal, vive en el navegador.
function leerHechas(claseId) {
  try {
    return JSON.parse(localStorage.getItem(`atv_claves_${claseId}`) || '[]')
  } catch {
    return []
  }
}

function guardarHechas(claseId, hechas) {
  try {
    localStorage.setItem(`atv_claves_${claseId}`, JSON.stringify(hechas))
  } catch {
    // sin almacenamiento, el checklist vale solo mientras la página esté abierta
  }
}

// La clase como mesa de trabajo: a la izquierda se ve, a la derecha se implementa y se revisa.
export default function MesaClase({ clase, cargando, guardando, anterior, siguiente, onToggleCompletado, onIr }) {
  const [hechas, setHechas] = useState([])

  useEffect(() => {
    if (clase?.id) setHechas(leerHechas(clase.id))
  }, [clase?.id])

  if (cargando) return <p className="pc-loading">Cargando clase…</p>
  if (!clase) return <p className="pc-loading">Elegí una clase para empezar.</p>

  const { cuerpo, mentor } = partirDescripcion(clase.descripcion)
  const claves = clase.claves ?? []
  const recursos = clase.recursos ?? []

  function alternar(i) {
    const nuevas = hechas.includes(i) ? hechas.filter((x) => x !== i) : [...hechas, i]
    setHechas(nuevas)
    guardarHechas(clase.id, nuevas)
  }

  return (
    <div className="ms-mesa">
      <article className="ms-ver">
        <Video clase={clase} className="ms-video" />
        <header className="ms-ver__head">
          <h1>{tituloLindo(clase.titulo)}</h1>
          {mentor ? (
            <p className="mt-mentor">
              Clase de <b>{mentor.nombre ?? 'tu mentor'}</b>
              {mentor.handles.map((h) => (
                <span key={h}>
                  {' · '}
                  <a href={`https://instagram.com/${h}`} target="_blank" rel="noopener noreferrer">
                    @{h}
                  </a>
                </span>
              ))}
            </p>
          ) : null}
        </header>
        {clase.resumen ? (
          <p className="mt-brief__lead">{clase.resumen}</p>
        ) : cuerpo ? (
          <TextoFormateado texto={cuerpo} className="mt-desc" />
        ) : null}

      </article>

      <aside className="ms-panel" aria-label="Implementar y revisar">
        <section className="ms-paso">
          <span className="ms-paso__n">Implementar</span>
          <h2>{claves.length ? 'Aplicalo en tu negocio' : 'Llevalo a tu negocio'}</h2>
          {claves.length ? (
            <>
              <ul className="ms-claves">
                {claves.map((k, i) => {
                  const ok = hechas.includes(i)
                  return (
                    <li key={k}>
                      <label className={ok ? 'is-done' : ''}>
                        <input type="checkbox" checked={ok} onChange={() => alternar(i)} />
                        <Check done={ok} />
                        <span>{k}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
              <p className="ms-paso__meta num">
                {hechas.length} de {claves.length} aplicadas
              </p>
            </>
          ) : (
            <p className="ms-paso__txt">Aplicá lo que viste y dejalo documentado en tu SOP, así queda como un proceso de tu equipo.</p>
          )}
          {recursos.length ? (
            <div className="ms-recursos">
              <Recursos recursos={recursos} />
            </div>
          ) : null}
        </section>

        <section className="ms-paso ms-paso--revisar">
          <span className="ms-paso__n">Revisar</span>
          <div className="ms-coach">
            <span className="im-coach__av" aria-hidden="true">
              {(clase.coach?.nombre ?? 'ATV').slice(0, 2).toUpperCase()}
            </span>
            <div>
              <b>{clase.coach ? `Lo revisás con ${clase.coach.nombre}` : 'Lo revisás con tu coach'}</b>
              <span>{clase.coach?.area ?? 'Cuando lo tengas implementado'}</span>
            </div>
          </div>
          <button
            type="button"
            className={`pc-btn ms-implementar${clase.completado ? ' is-done' : ''}`}
            onClick={() => onToggleCompletado(!clase.completado)}
            disabled={guardando}
            aria-pressed={clase.completado}
          >
            <Check done={clase.completado} /> {clase.completado ? 'Implementada' : 'Marcar como implementada'}
          </button>
        </section>
      </aside>

      {anterior || siguiente ? (
        <nav className="mt-nav ms-nav" aria-label="Otras clases">
          {anterior ? (
            <button type="button" className="mt-nav__btn mt-nav__btn--prev" onClick={() => onIr(anterior.id)}>
              <span className="mt-nav__ico" aria-hidden="true">
                <Chevron dir="left" />
              </span>
              <span className="mt-nav__txt">
                <small>Anterior</small>
                <b>{tituloLindo(anterior.titulo)}</b>
              </span>
            </button>
          ) : (
            <span />
          )}
          {siguiente ? (
            <button type="button" className="mt-nav__btn mt-nav__btn--next" onClick={() => onIr(siguiente.id)}>
              <span className="mt-nav__txt">
                <small>Siguiente clase</small>
                <b>{tituloLindo(siguiente.titulo)}</b>
              </span>
              <span className="mt-nav__ico" aria-hidden="true">
                <Chevron />
              </span>
            </button>
          ) : null}
          </nav>
        ) : null}
    </div>
  )
}
