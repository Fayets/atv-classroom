import { useEffect, useState } from 'react'
import { getVideoEmbedInfo } from '../../utils/video'

const URL = /https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g

// Servicios que los clientes comparten seguido: se muestran como tarjeta con su tipo.
const SERVICIOS = [
  { re: /docs\.google\.com\/document/i, tipo: 'Documento de Google', marca: 'Docs', clase: 'docs' },
  { re: /docs\.google\.com\/spreadsheets/i, tipo: 'Hoja de cálculo de Google', marca: 'Sheets', clase: 'sheets' },
  { re: /docs\.google\.com\/presentation/i, tipo: 'Presentación de Google', marca: 'Slides', clase: 'slides' },
  { re: /docs\.google\.com\/forms|forms\.gle/i, tipo: 'Formulario de Google', marca: 'Forms', clase: 'forms' },
  { re: /drive\.google\.com/i, tipo: 'Archivo de Google Drive', marca: 'Drive', clase: 'drive' },
  { re: /notion\.(so|site)/i, tipo: 'Página de Notion', marca: 'N', clase: 'notion' },
  { re: /miro\.com/i, tipo: 'Tablero de Miro', marca: 'Miro', clase: 'miro' },
  { re: /canva\.com/i, tipo: 'Diseño de Canva', marca: 'Canva', clase: 'canva' },
  { re: /figma\.com/i, tipo: 'Archivo de Figma', marca: 'Figma', clase: 'figma' },
]

function corto(url) {
  try {
    const u = new window.URL(url)
    const camino = u.pathname.length > 32 ? `${u.pathname.slice(0, 31)}…` : u.pathname
    return `${u.hostname.replace(/^www\./, '')}${camino === '/' ? '' : camino}`
  } catch {
    return url
  }
}

// Portada y título de cada video, una vez por link (el chat se vuelve a pintar seguido).
const portadas = new Map()

function servicioDeVideo(src) {
  if (/youtube\.com/.test(src)) return 'YouTube'
  if (/loom\.com/.test(src)) return 'Loom'
  if (/fathom\.video/.test(src)) return 'Fathom'
  if (/vimeo\.com/.test(src)) return 'Vimeo'
  if (/drive\.google\.com/.test(src)) return 'Drive'
  return 'Video'
}

function buscarPortada(url, src) {
  if (!portadas.has(url)) {
    const yt = src.match(/youtube\.com\/embed\/([\w-]{11})/)
    const loom = src.match(/loom\.com\/embed\/([a-zA-Z0-9]+)/)
    portadas.set(
      url,
      yt
        ? Promise.resolve({ imagen: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg` })
        : loom
          ? fetch(`https://www.loom.com/v1/oembed?url=${encodeURIComponent(`https://www.loom.com/share/${loom[1]}`)}`)
              .then((r) => (r.ok ? r.json() : {}))
              // La portada en jpg pesa ~20 KB; el gif animado, cientos.
              .then((d) => ({ imagen: d.thumbnail_url?.replace(/\.gif$/, '.jpg'), titulo: d.title }))
              .catch(() => ({}))
          : Promise.resolve({}),
    )
  }
  return portadas.get(url)
}

// El reproductor de Loom/YouTube pesa varios MB: hasta que no tocan play, solo se muestra la portada.
function VideoEnlace({ url, src }) {
  const [abierto, setAbierto] = useState(false)
  const [portada, setPortada] = useState(null)
  useEffect(() => {
    let vivo = true
    buscarPortada(url, src).then((p) => vivo && setPortada(p))
    return () => {
      vivo = false
    }
  }, [url, src])
  if (abierto) {
    const conPlay = /youtube\.com|loom\.com|vimeo\.com/.test(src) ? `${src}${src.includes('?') ? '&' : '?'}autoplay=1` : src
    return (
      <div className="msj-link-video is-portada">
        {portada?.imagen && <img src={portada.imagen} alt="" />}
        <iframe src={conPlay} title={portada?.titulo || 'Video compartido'} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
      </div>
    )
  }
  return (
    <button type="button" className="msj-link-video is-portada" onClick={() => setAbierto(true)} aria-label={`Reproducir ${portada?.titulo || 'video'}`}>
      {portada?.imagen && <img src={portada.imagen} alt="" loading="lazy" decoding="async" />}
      <span className="msj-link-video__play" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
      </span>
      <span className="msj-link-video__pie">
        <b>{servicioDeVideo(src)}</b>
        {portada?.titulo && <span>{portada.titulo}</span>}
      </span>
    </button>
  )
}

/** Vista previa de los links del mensaje: video que se reproduce adentro o tarjeta del servicio. */
export default function Enlaces({ texto }) {
  if (!texto) return null
  const urls = [...new Set(texto.match(URL) || [])].slice(0, 4)
  const piezas = []
  urls.forEach((url) => {
    const video = getVideoEmbedInfo(url)
    if (video?.type === 'iframe') {
      piezas.push(<VideoEnlace key={url} url={url} src={video.src} />)
      return
    }
    const servicio = SERVICIOS.find((s) => s.re.test(url))
    if (servicio) {
      piezas.push(
        <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="msj-link-card">
          <span className={`msj-link-card__marca is-${servicio.clase}`}>{servicio.marca}</span>
          <span className="msj-link-card__txt">
            <b>{servicio.tipo}</b>
            <small>{corto(url)}</small>
          </span>
          <span className="msj-link-card__abrir">Abrir</span>
        </a>,
      )
    }
  })
  return piezas.length ? <div className="msj-links">{piezas}</div> : null
}
