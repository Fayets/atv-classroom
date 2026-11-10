import { getVideoEmbedInfo } from '../../utils/video'
import { tipoRecurso, urlRecurso } from '../../utils/frentes'

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
  const bloqueadoPara = clase?.video_bloqueado_para || []
  return (
    <div className={`pc-video ${className}`}>
      {/* Solo el equipo recibe esta lista: ve el video y sabe para quién está bloqueado. */}
      {bloqueadoPara.length ? <span className="pc-video__aviso">🔒 Bloqueado para {bloqueadoPara.join(', ')}</span> : null}
      {clase?.video_proximamente ? (
        // Como las portadas de los módulos: fondo hueso, etiqueta azul, título grande y el dibujo del módulo.
        <div className="pc-pronto">
          <span className="pc-pronto__arriba">ATV — Aumenta tu valor</span>
          {clase.portada ? <span className="pc-pronto__dibujo" style={{ backgroundImage: `url(${clase.portada})` }} aria-hidden="true" /> : null}
          <div className="pc-pronto__texto">
            <span className="pc-pronto__tag">Próximamente</span>
            <b className="pc-pronto__titulo">{clase.titulo}</b>
          </div>
          <span className="pc-pronto__abajo">
            {clase.modulo ? <>Módulo <b>{clase.modulo}</b><br /></> : null}
            <small>Video en grabación · los SOPs ya están abajo</small>
          </span>
        </div>
      ) : info?.type === 'iframe' ? (
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
            <a href={urlRecurso(r.url)} target="_blank" rel="noopener noreferrer" className="pc-recurso">
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

// La etiqueta de un recurso en las fichas de SOPs: logo de Miro y de Loom, y un clip para los links
// (Franco, 10-11-2026). El resto (PDF, DOC, SHEET…) sigue como texto.
export function EtiquetaRecurso({ recurso }) {
  const { tag, label } = tipoRecurso(recurso)
  if (tag === 'MIRO') {
    return (
      <span className="im-logo" title={label}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <rect width="24" height="24" rx="5" fill="#FFD02F" />
          <path d="M15.9 5.5h-2.2l1.9 3.4-4.2-3.4H9.2l2.1 3.9-4.4-3.9H4.7l2.2 5L4.7 18.5h2.2l4.4-8.2-2.1 8.2h2.2l4.2-8.6-1.9 8.6h2.2l3.4-9.8z" fill="#050038" />
        </svg>
      </span>
    )
  }
  if (tag === 'LOOM') {
    return (
      <span className="im-logo" title={label}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="12" cy="12" r="12" fill="#625DF5" />
          <g fill="#fff">
            {[0, 45, 90, 135].map((g) => (
              <rect key={g} x="10.6" y="3.6" width="2.8" height="16.8" rx="1.4" transform={`rotate(${g} 12 12)`} />
            ))}
          </g>
          <circle cx="12" cy="12" r="3.1" fill="#625DF5" />
        </svg>
      </span>
    )
  }
  if (tag === 'LINK') {
    return (
      <span className="im-logo im-logo--clip" title={label}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
        </svg>
      </span>
    )
  }
  return <span>{tag}</span>
}
