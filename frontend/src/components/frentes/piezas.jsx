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
