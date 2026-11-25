// Íconos de línea para los canales de grupo (estilo Lucide: trazo 1.8, puntas redondas). El ícono sale
// de la palabra del nombre ("🔔┊updates" → campana); si no hay una conocida, queda el numeral.
// El nombre guardado no cambia: solo se muestra sin el emoji ni el separador.

const TRAZOS = {
  campana: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  megafono: <><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>,
  mano: <><path d="M18 11V6a2 2 0 0 0-4 0v5" /><path d="M14 10V4a2 2 0 0 0-4 0v6" /><path d="M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></>,
  libro: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>,
  personas: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  casa: <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></>,
  rayo: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  medalla: <><circle cx="12" cy="8" r="6" /><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11" /></>,
  trofeo: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></>,
  celular: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></>,
  pulso: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  numeral: <><path d="M4 9h16" /><path d="M4 15h16" /><path d="M10 3 8 21" /><path d="M16 3l-2 18" /></>,
}

// El orden importa: "wins-personales" tiene que ganarle a "wins".
const PALABRAS = [
  ['update', 'campana'],
  ['anuncio', 'megafono'],
  ['presenta', 'mano'],
  ['bienvenid', 'mano'],
  ['clase', 'libro'],
  ['equipo', 'personas'],
  ['general', 'casa'],
  ['boost', 'rayo'],
  ['personal', 'medalla'],
  ['win', 'trofeo'],
  ['logro', 'trofeo'],
  ['plataforma', 'celular'],
  ['seguimiento', 'pulso'],
]

const sinAcentos = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function IconoCanal({ nombre = '', className = 'msj-fila__icono' }) {
  const limpio = sinAcentos(nombre)
  const clave = PALABRAS.find(([palabra]) => limpio.includes(palabra))?.[1] || 'numeral'
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {TRAZOS[clave]}
    </svg>
  )
}
