import { peso } from '../../utils/mensajes'

function extension(nombre) {
  return (nombre.split('.').pop() || '').slice(0, 4).toUpperCase()
}

// Cómo se ve cada archivo dentro de un mensaje: imágenes en grilla, audio y video con reproductor,
// el resto como tarjeta para abrir o descargar.
export default function Adjuntos({ adjuntos, alCargar }) {
  if (!adjuntos?.length) return null
  const imagenes = adjuntos.filter((a) => a.tipo_mime.startsWith('image/') && a.tipo_mime !== 'image/heic')
  const resto = adjuntos.filter((a) => !imagenes.includes(a))
  return (
    <div className="msj-adj">
      {imagenes.length ? (
        <div className={`msj-adj__imgs${imagenes.length > 1 ? ' is-grilla' : ''}`}>
          {imagenes.map((a) => (
            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="msj-adj__img" title={a.nombre}>
              <img src={a.url} alt={a.nombre} onLoad={alCargar} />
            </a>
          ))}
        </div>
      ) : null}
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
