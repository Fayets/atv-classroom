import { useState } from 'react'
import { getYoutubeThumbnail } from '../../utils/video'
import { tituloLindo } from '../../utils/frentes'
import Isotipo from '../marca/Isotipo'

// A class thumbnail, always 16:9. It uses the original image when there is one (an assigned
// miniatura_url, or the YouTube frame of the video). Otherwise it shows a provisional card with the
// class title over the module's drawing, to be replaced once the class gets its own image.
export default function Miniatura({ titulo, portada, clase, className = '' }) {
  const original = clase?.miniatura_url || getYoutubeThumbnail(clase?.video_url)
  const [failed, setFailed] = useState(null)

  if (original && failed !== original) {
    return (
      <span className={`mini ${className}`} aria-hidden="true">
        <img className="mini__img" src={original} alt="" loading="lazy" decoding="async" onError={() => setFailed(original)} />
      </span>
    )
  }
  return (
    <span className={`mini mini--provisional ${className}`} aria-hidden="true">
      {portada ? <span className="mini__dibujo" style={{ backgroundImage: `url(${portada})` }} /> : null}
      <b className="mini__titulo">{tituloLindo(titulo)}</b>
      <Isotipo className="mini__sello" />
    </span>
  )
}
