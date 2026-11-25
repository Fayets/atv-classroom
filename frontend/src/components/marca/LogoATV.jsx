// El logo de ATV (la "A/V" de public/atv-logo-negro.png), para la barra lateral y la barra de arriba.
// Se usa el PNG como máscara y se pinta con currentColor: así toma el color del texto en claro y en oscuro,
// igual que un ícono. (El Isotipo "Ø" del Brand System sigue en el login y en el cartel de "Estamos mejorando".)
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
