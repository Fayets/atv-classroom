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

/** Vista previa de los links del mensaje: video que se reproduce adentro o tarjeta del servicio. */
export default function Enlaces({ texto }) {
  if (!texto) return null
  const urls = [...new Set(texto.match(URL) || [])].slice(0, 4)
  const piezas = []
  urls.forEach((url) => {
    const video = getVideoEmbedInfo(url)
    if (video?.type === 'iframe') {
      piezas.push(
        <div key={url} className="msj-link-video">
          <iframe src={video.src} title="Video compartido" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
        </div>,
      )
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
