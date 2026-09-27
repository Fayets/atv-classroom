import { Check, Chevron, Recursos, Video } from './frentes/piezas'
import TextoFormateado from './frentes/TextoFormateado'
import { partirDescripcion, tituloLindo } from '../utils/frentes'

// Una sola columna del ancho del video: encabezado, video, contenido, SOP y navegación.
export default function ClaseViewer({ clase, modulo, seccionTitulo, numero, total, anterior, siguiente, cargando, guardando, onToggleCompletado, onIr }) {
  if (cargando) {
    return <p className="pc-loading">Cargando clase…</p>
  }

  if (!clase) {
    return <p className="pc-loading">Elegí una clase para empezar.</p>
  }

  const { cuerpo, mentor } = partirDescripcion(clase.descripcion)
  const tieneTexto = Boolean(clase.resumen || cuerpo)

  return (
    <article className="mt-clase">
      <header className="mt-clase__head">
        <p className="mt-crumbs">
          {modulo} <Chevron /> {tituloLindo(seccionTitulo)}
          {numero ? <span className="num mt-crumbs__n">Clase {numero} de {total}</span> : null}
        </p>
        <div className="mt-clase__title">
          <div>
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
          </div>
          <button
            type="button"
            className={`pc-btn ${clase.completado ? 'pc-btn--ghost' : 'pc-complete'}`}
            onClick={() => onToggleCompletado(!clase.completado)}
            disabled={guardando}
            aria-pressed={clase.completado}
          >
            <Check done={clase.completado} /> {clase.completado ? 'Vista' : 'Marcar como vista'}
          </button>
        </div>
      </header>

      <Video clase={clase} className="mt-video" />

      {tieneTexto ? (
        <section className="mt-section">
          {clase.resumen ? (
            <div className="mt-brief">
              <p className="mt-brief__lead">{clase.resumen}</p>
              {clase.claves?.length ? (
                <ol>
                  {clase.claves.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : (
            <TextoFormateado texto={cuerpo} className="mt-desc" />
          )}
        </section>
      ) : null}

      {clase.recursos?.length ? (
        <section className="mt-section">
          <h2 className="mt-section__t">Tu SOP y recursos</h2>
          <div className="mt-recursos">
            <Recursos recursos={clase.recursos} />
          </div>
        </section>
      ) : null}

      {anterior || siguiente ? (
        <nav className="mt-nav" aria-label="Otras clases">
          {anterior ? (
            <button type="button" className="mt-nav__btn" onClick={() => onIr(anterior.id)}>
              <small>
                <Chevron dir="left" /> Anterior
              </small>
              <b>{tituloLindo(anterior.titulo)}</b>
            </button>
          ) : (
            <span />
          )}
          {siguiente ? (
            <button type="button" className="mt-nav__btn mt-nav__btn--next" onClick={() => onIr(siguiente.id)}>
              <small>
                Siguiente <Chevron />
              </small>
              <b>{tituloLindo(siguiente.titulo)}</b>
            </button>
          ) : null}
        </nav>
      ) : null}
    </article>
  )
}
