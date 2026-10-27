// Piezas compartidas entre Mi cuenta (el cliente) y la ficha de la carpeta Clientes (el equipo).
import '../../styles/dispositivos.css'
const TEL = 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2'
const COMPU = 'M3 5h18v11H3zM8 20h8M12 16v4'

export function Equipo({ d }) {
  const tel = ['iPhone', 'Android', 'iPad'].includes(d.equipo)
  return (
    <svg className="disp-icono" viewBox="0 0 24 24" aria-hidden="true">
      <path d={tel ? TEL : COMPU} />
    </svg>
  )
}

export function cuandoFue(iso) {
  if (!iso) return '—'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 10) return 'ahora'
  if (min < 60) return `hace ${min} min`
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`
  const d = Math.round(min / 1440)
  return d === 1 ? 'ayer' : `hace ${d} días`
}
