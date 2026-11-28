// Nombres de canales de grupo: se guardan con emoji y separador ("🏠┊general"); en la barra lateral
// se muestran limpios, con un ícono de línea (components/mensajes/IconoCanal.jsx).

/** El nombre a la vista: sin el emoji ni el separador del principio ("🏠┊general" → "general"). */
export function nombreVisible(nombre = '') {
  const partes = nombre.split(/[┊|│]/)
  return partes.length > 1 ? partes.slice(1).join('┊').trim() || nombre : nombre.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '') || nombre
}

/** The channels where members share achievements ("wins", "wins-personales"): they get their own look. */
export const esCanalWins = (nombre = '') => /\bwins?\b|logros?/i.test(nombre)
