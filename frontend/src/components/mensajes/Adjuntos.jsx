import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { peso } from '../../utils/mensajes'

function extension(nombre) {
  return (nombre.split('.').pop() || '').slice(0, 4).toUpperCase()
}

// La imagen en grande, encima del chat (no en otra pestaña). Esc o clic afuera la cierra; con varias,
// las flechas pasan de una a otra.
function Visor({ imagenes, inicial, alCerrar }) {
  const [i, setI] = useState(inicial)
  const a = imagenes[i]
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') alCerrar()
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, imagenes.length - 1))
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0))
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [alCerrar, imagenes.length])
  return createPortal(
    <div className="msj-visor" role="dialog" aria-modal="true" aria-label={a.nombre} onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className="msj-visor__barra">
        <span>{a.nombre}{imagenes.length > 1 ? ` · ${i + 1} de ${imagenes.length}` : ''}</span>
        <a href={a.url} download={a.nombre} target="_blank" rel="noopener noreferrer">Descargar</a>
        <button type="button" onClick={alCerrar} aria-label="Cerrar">✕</button>
      </div>
      {i > 0 ? <button type="button" className="msj-visor__flecha is-izq" onClick={() => setI(i - 1)} aria-label="Anterior">‹</button> : null}
      <img src={a.url} alt={a.nombre} onMouseDown={(e) => e.stopPropagation()} />
      {i < imagenes.length - 1 ? <button type="button" className="msj-visor__flecha is-der" onClick={() => setI(i + 1)} aria-label="Siguiente">›</button> : null}
    </div>,
    document.body,
  )
}

// Cómo se ve cada archivo dentro de un mensaje: imágenes en grilla (se abren en grande encima del chat),
// audio y video con reproductor, el resto como tarjeta para abrir o descargar.
export default function Adjuntos({ adjuntos, alCargar }) {
  const [viendo, setViendo] = useState(null)
  if (!adjuntos?.length) return null
  const imagenes = adjuntos.filter((a) => a.tipo_mime.startsWith('image/') && a.tipo_mime !== 'image/heic')
  const resto = adjuntos.filter((a) => !imagenes.includes(a))
  return (
    <div className="msj-adj">
      {imagenes.length ? (
        <div className={`msj-adj__imgs${imagenes.length > 1 ? ' is-grilla' : ''}`}>
          {imagenes.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="msj-adj__img"
              title={a.nombre}
              onClick={(e) => {
                // Cmd/Ctrl + clic sigue abriéndola en otra pestaña.
                if (e.metaKey || e.ctrlKey || e.shiftKey) return
                e.preventDefault()
                setViendo(imagenes.indexOf(a))
              }}
            >
              <img src={a.url} alt={a.nombre} onLoad={alCargar} />
            </a>
          ))}
        </div>
      ) : null}
      {viendo !== null ? <Visor imagenes={imagenes} inicial={viendo} alCerrar={() => setViendo(null)} /> : null}
      {resto.map((a) =>
        a.tipo_mime.startsWith('audio/') ? (
          <div key={a.id} className="msj-adj__media">
            <audio controls preload="metadata" src={a.url} />
            <span>{/^nota-de-voz/.test(a.nombre) ? '🎙️ Nota de voz' : a.nombre}</span>
          </div>
        ) : a.tipo_mime.startsWith('video/') ? (
          <div key={a.id} className="msj-adj__media">
            <video controls preload="metadata" src={a.url} onLoadedMetadata={alCargar} />
          </div>
        ) : (
          <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="msj-adj__archivo">
            <span className={`msj-adj__ext${a.tipo_mime === 'application/pdf' ? ' is-pdf' : ''}`}>{extension(a.nombre)}</span>
            <span className="msj-adj__info">
              <b>{a.nombre}</b>
              <small>{peso(a.tamano)} · {a.tipo_mime === 'application/pdf' ? 'Abrir' : 'Descargar'}</small>
            </span>
          </a>
        ),
      )}
    </div>
  )
}
