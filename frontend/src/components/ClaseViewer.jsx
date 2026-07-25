import DescripcionClase from './DescripcionClase'
import {
  formatDuracion,
  getVideoEmbedInfo,
} from '../utils/video'
import { formatNumeroClase } from '../utils/programa'

function CheckCircleIcon({ done }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1.5"
        fill={done ? 'currentColor' : 'none'}
      />
      {done ? (
        <path
          d="M8 12l2.5 2.5L16 9"
          stroke="#0e0e0e"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  )
}

function VideoPlaceholder({ duracion }) {
  return (
    <div className="clase-viewer__video-placeholder">
      <div className="clase-viewer__play-btn" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5" />
          <path d="M20 16l14 8-14 8V16z" fill="currentColor" />
        </svg>
      </div>
      {duracion ? (
        <span className="clase-viewer__duracion">{duracion}</span>
      ) : null}
    </div>
  )
}

export default function ClaseViewer({
  clase,
  numero,
  seccionTitulo,
  cargando,
  guardando,
  onToggleCompletado,
}) {
  if (cargando) {
    return (
      <div className="clase-viewer clase-viewer--loading">
        <p className="clase-viewer__loading-text">Cargando clase…</p>
      </div>
    )
  }

  if (!clase) {
    return (
      <div className="clase-viewer clase-viewer--empty">
        <p className="clase-viewer__empty-text">
          Elegí una clase del menú para empezar.
        </p>
      </div>
    )
  }

  const video = getVideoEmbedInfo(clase.video_url)
  const duracion = formatDuracion(clase.duracion_segundos)
  const tituloConNumero = numero
    ? `${formatNumeroClase(numero)} ${clase.titulo}`
    : clase.titulo

  return (
    <article className="clase-viewer">
      <header className="clase-viewer__header">
        <div className="clase-viewer__header-text">
          {seccionTitulo ? (
            <p className="clase-viewer__section">{seccionTitulo}</p>
          ) : null}
          <h1 className="clase-viewer__title">{tituloConNumero}</h1>
        </div>
        <button
          type="button"
          className={`clase-viewer__complete${clase.completado ? ' clase-viewer__complete--done' : ''}`}
          onClick={() => onToggleCompletado(!clase.completado)}
          disabled={guardando}
          aria-pressed={clase.completado}
          title={clase.completado ? 'Marcar como pendiente' : 'Marcar como completada'}
        >
          <CheckCircleIcon done={clase.completado} />
          <span className="visually-hidden">
            {clase.completado ? 'Completada' : 'Marcar completada'}
          </span>
        </button>
      </header>

      <div className="clase-viewer__media-wrap">
        <div className="clase-viewer__media">
          {video?.type === 'iframe' ? (
            <div className="clase-viewer__embed-wrap">
              <iframe
                src={video.src}
                title={clase.titulo}
                className="clase-viewer__embed"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
              {duracion ? (
                <span className="clase-viewer__duracion">{duracion}</span>
              ) : null}
            </div>
          ) : video?.type === 'video' ? (
            <div className="clase-viewer__embed-wrap">
              <video
                className="clase-viewer__video"
                src={video.src}
                controls
                playsInline
              />
              {duracion ? (
                <span className="clase-viewer__duracion">{duracion}</span>
              ) : null}
            </div>
          ) : (
            <VideoPlaceholder duracion={duracion} />
          )}
        </div>
      </div>

      {clase.descripcion ? (
        <DescripcionClase texto={clase.descripcion} />
      ) : null}

      {clase.recursos?.length > 0 ? (
        <section className="clase-viewer__recursos">
          <h2 className="clase-viewer__recursos-title">Recursos</h2>
          <ul className="clase-viewer__recursos-list">
            {clase.recursos.map((recurso) => {
              const isPdf =
                recurso.tipo === 'pdf' || recurso.url?.startsWith('/uploads/')

              return (
                <li key={recurso.id ?? `${recurso.titulo}-${recurso.url}`}>
                  <a
                    href={recurso.url}
                    className="clase-viewer__recurso-link"
                    target="_blank"
                    rel="noopener noreferrer"
                    {...(isPdf ? { download: `${recurso.titulo}.pdf` } : {})}
                  >
                    <span className="clase-viewer__recurso-icon" aria-hidden="true">
                      {isPdf ? (
                        <svg viewBox="0 0 24 24" fill="none">
                          <path
                            d="M8 4h6l4 4v12a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M14 4v4h4M9 13h6M9 17h4"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none">
                          <path
                            d="M8 12h8M14 8l4 4-4 4"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M16.5 6.5v9.75a4.25 4.25 0 01-8.5 0V5.75a2.75 2.75 0 015.5 0v10.5a1.5 1.5 0 01-3 0V6.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span>{recurso.titulo}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </article>
  )
}
