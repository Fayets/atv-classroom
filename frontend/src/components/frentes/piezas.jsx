import { getVideoEmbedInfo } from '../../utils/video'
import { tipoRecurso } from '../../utils/frentes'

export function Check({ done, now }) {
  return (
    <span className={`pc-check${done ? ' is-done' : ''}${now && !done ? ' is-now' : ''}`} aria-hidden="true">
      {done ? (
        <svg viewBox="0 0 12 12">
          <path d="M3 6.2l2 2 4-4.4" />
        </svg>
      ) : null}
    </span>
  )
}

export function Chevron({ dir = 'right' }) {
  const d = { right: 'M4.5 2.5L8 6l-3.5 3.5', left: 'M7.5 2.5L4 6l3.5 3.5', down: 'M2.5 4.5L6 8l3.5-3.5' }[dir]
  return (
    <svg className="pc-chev" viewBox="0 0 12 12" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export function Video({ clase, className = '' }) {
  const info = getVideoEmbedInfo(clase?.video_url)
  return (
    <div className={`pc-video ${className}`}>
      {info?.type === 'iframe' ? (
        <iframe src={info.src} title={clase.titulo} allow="autoplay; fullscreen; picture-in-picture; clipboard-write" allowFullScreen />
      ) : info?.type === 'video' ? (
        <video src={info.src} controls playsInline />
      ) : (
        <div className="pc-video__empty">Esta clase todavía no tiene video</div>
      )}
    </div>
  )
}

export function Recursos({ recursos }) {
  if (!recursos?.length) return null
  return (
    <ul className="pc-recursos">
      {recursos.map((r) => {
        const t = tipoRecurso(r)
        const generico = /^(documento|planilla|formulario) google/i.test(r.titulo)
        return (
          <li key={r.id ?? r.url}>
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="pc-recurso">
              <span className={`pc-recurso__tag pc-tag--${t.tag.toLowerCase()}`}>{t.tag}</span>
              <span className="pc-recurso__txt">
                <b>{generico ? t.label : r.titulo}</b>
                <small>{r.url.includes('/copy') ? 'Se abre una copia para vos' : t.label}</small>
              </span>
              <Chevron />
            </a>
          </li>
        )
      })}
    </ul>
  )
}
