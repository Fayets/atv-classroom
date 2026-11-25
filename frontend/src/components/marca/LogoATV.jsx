// El logo de ATV (los íconos de public/icons) para la barra lateral y la barra de arriba. Cuál de los dos grises
// usa (claro u oscuro) lo decide styles/logo-atv.css según el fondo y el modo de color.
import '../../styles/logo-atv.css'

export default function LogoATV({ className = '', titulo = '' }) {
  return (
    <span
      className={`logo-atv ${className}`.trim()}
      role={titulo ? 'img' : undefined}
      aria-label={titulo || undefined}
      aria-hidden={titulo ? undefined : true}
    />
  )
}
