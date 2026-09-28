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

// Muchas descripciones son el pedido del mentor de etiquetarlo en Instagram:
// se separa para no mostrarlo como si fuera el contenido de la clase.
// Gente que ya no está en ATV: no se muestra ni se linkea su Instagram.
const EX_EQUIPO = { handles: ['naza_gamero'], nombres: /^naza$/i }
const NOMBRE_DE_HANDLE = { juanxcarrizo: 'Juan', lucasruarte7: 'Lucas' }

function esPromo(texto) {
  return /instagram|etiquet/i.test(texto) && texto.length < 480
}

// La firma es la última línea que arranca con guión ("-Naza", "– Lucho y Juan").
function firmaDe(lineas) {
  for (let i = lineas.length - 1; i >= 0; i--) {
    const m = lineas[i].match(/^[-–—]\s*([^@():]{2,23})$/)
    if (m) return m[1].trim()
  }
  const ultima = lineas[lineas.length - 1] ?? ''
  return /^[^@():]{2,23}$/.test(ultima) ? ultima : null
}

function mentorDe(promo) {
  const handles = [...promo.matchAll(/@([\w.]+)/g)]
    .map((m) => m[1].replace(/\.+$/, ''))
    .filter((h) => !EX_EQUIPO.handles.includes(h.toLowerCase()))
  let nombre = firmaDe(promo.trim().split('\n').map((l) => l.trim()).filter(Boolean))
  if (!nombre || EX_EQUIPO.nombres.test(nombre)) {
    nombre = handles.map((h) => NOMBRE_DE_HANDLE[h.toLowerCase()]).find(Boolean) ?? null
  }
  return nombre || handles.length ? { nombre, handles } : null
}

// Donde arranca el pedido de etiquetar cuando viene pegado al final del contenido.
const INICIO_PROMO = /\n[ \t]*(?:⸻\s*\n)?[ \t]*(?:si la clase te (?:gust|sirvi)|si te gust[óo] la clase)/i

function sinExEquipo(cuerpo) {
  return cuerpo.replace(/\bcon Naza\b/gi, 'con el equipo')
}

export function partirDescripcion(texto) {
  if (!texto?.trim()) return { cuerpo: '', mentor: null }
  const limpio = texto.trim()
  const m = limpio.match(INICIO_PROMO)
  const cola = m ? limpio.slice(m.index) : ''
  if (cola && /instagram|etiquet/i.test(cola) && cola.length < 600) {
    return { cuerpo: sinExEquipo(limpio.slice(0, m.index).replace(/\s*⸻\s*$/, '').trim()), mentor: mentorDe(cola) }
  }
  if (esPromo(limpio)) return { cuerpo: '', mentor: mentorDe(limpio) }
  return { cuerpo: sinExEquipo(limpio), mentor: null }
}
