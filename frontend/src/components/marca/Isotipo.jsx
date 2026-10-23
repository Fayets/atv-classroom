// Isotipo "Ø" del Brand System de ATV (Cáscara): dos piezas en L inclinadas. Toma el color del texto
// (currentColor): en carbón sobre fondos claros, en hueso sobre oscuros.
export default function Isotipo({ className = '', titulo = '' }) {
  return (
    <svg className={className} viewBox="0 0 205 281" role={titulo ? 'img' : undefined} aria-label={titulo || undefined} aria-hidden={titulo ? undefined : true} fill="currentColor">
      <path d="M0 71 L80 0 L185 0 L130 59 L69 103 L69 220 L9 281 L0 281 Z" />
      <path d="M191 0 L205 0 L205 211 L127 281 L15 281 L75 222 L136 183 L136 61 Z" />
    </svg>
  )
}
