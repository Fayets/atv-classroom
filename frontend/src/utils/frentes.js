// Helpers de presentación para las pantallas de frentes.

export function tipoRecurso(recurso) {
  const url = recurso.url || ''
  if (recurso.tipo === 'pdf' || url.startsWith('/uploads/')) return { tag: 'PDF', label: 'Descargar PDF' }
  if (/docs\.google\.com\/spreadsheets/.test(url)) return { tag: 'SHEET', label: 'Planilla de Google' }
  if (/docs\.google\.com\/forms/.test(url)) return { tag: 'FORM', label: 'Formulario de Google' }
  if (/docs\.google\.com/.test(url)) return { tag: 'DOC', label: 'Documento de Google' }
  if (/miro\.com/.test(url)) return { tag: 'MIRO', label: 'Tablero de Miro' }
  if (/loom\.com/.test(url)) return { tag: 'LOOM', label: 'Video en Loom' }
  if (/wa\.me|whatsapp/.test(url)) return { tag: 'WA', label: 'WhatsApp' }
  return { tag: 'LINK', label: new URL(url, location.origin).hostname.replace('www.', '') }
}

export function tituloLindo(titulo) {
  // Los títulos vienen en mayúsculas: se pasan a oración respetando siglas cortas.
  if (!titulo) return ''
  const siglas = new Set(['ATV', 'B2B', 'B2C', 'IA', 'AI', 'CRM', 'SOP', 'SOPS', 'ROI', 'VSL', 'KPI', 'KPIS', 'CTA', 'DM', 'DMS', 'UGC'])
  const palabras = titulo.split(/(\s+)/).map((p) => {
    const limpio = p.replace(/[^\p{L}\p{N}]/gu, '')
    if (siglas.has(limpio) || /\d/.test(p)) return p
    return p.toLocaleLowerCase('es')
  })
  const texto = palabras.join('')
  const i = texto.search(/\p{L}/u)
  return i < 0 ? texto : texto.slice(0, i) + texto.charAt(i).toLocaleUpperCase('es') + texto.slice(i + 1)
}

export function proximoPaso(paso) {
  return ['Mirá y aplicá las clases', 'Armá tu SOP', 'Automatizalo', 'Implementado'][paso] ?? ''
}
