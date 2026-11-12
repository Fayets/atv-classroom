// El documento del cuello de botella (y de los formatos de feedback) con el formato de Juan (Diagnóstico HAR PROGRAM): secciones "# ", subtítulos
// "### ", viñetas "- ", ejemplos "> ", **negrita** y capturas del Loom "[captura 03:12]". Lo usan la hoja editable, el PDF y el texto para el chat.
// Las mismas secciones y alias que cuellos_service.py.

export const SECCIONES = ['Diagnóstico', 'Causas', 'Causa vs potenciadores', 'Qué no hacer', 'Solución', 'Métricas a mirar', 'Expectativas', 'Cierre']
// Cómo se titulan en el documento (Juan los numera).
export const TITULOS = {
  'Diagnóstico': '1. Diagnóstico',
  Causas: '2. Causas',
  'Causa vs potenciadores': '3. Causa vs potenciadores',
  'Qué no hacer': '4. Qué NO hacer',
  'Solución': '5. Solución',
  'Métricas a mirar': '6. Métricas a mirar',
  Expectativas: '7. Expectativas',
  Cierre: '',
}

// Los formatos (los mismos de cuellos_service.FORMATOS). El de cada documento se reconoce por sus secciones, así
// la hoja, el PDF y el Doc no necesitan que se lo pasen.
export const FORMATOS = {
  cuello: { titulo: 'Diagnóstico', secciones: SECCIONES },
  historias: { titulo: 'Feedback de historias', secciones: ['Lo que ya funciona', 'Story por story', 'Los 3 cambios que más mueven', 'Próxima secuencia', 'Qué mirar'] },
  reels: { titulo: 'Feedback de contenido', secciones: ['Lo que ya funciona', 'Pieza por pieza', 'El patrón que se repite', 'Guion del próximo', 'Qué mirar'] },
  llamada: { titulo: 'Revisión de llamada', secciones: ['Cómo fue la llamada', 'Momentos clave', 'Objeciones y respuesta', 'Lo que hay que sostener', 'Guion de la próxima', 'Cómo quedó'] },
  setting: { titulo: 'Revisión de setting', secciones: ['Dónde se cae la conversación', 'Chat por chat', 'Mensajes listos para usar', 'Qué medir'] },
  embudo: { titulo: 'Revisión de embudo', secciones: ['El recorrido hoy', 'Dónde se pierde la gente', 'Cambios en orden', 'Qué no tocar', 'Qué medir'] },
}
const TODAS = [...new Set(Object.values(FORMATOS).flatMap((f) => f.secciones))]

const normal = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const ALIAS = {
  roadmap: 'Expectativas', meta: 'Expectativas', 'frame: causa vs potenciadores': 'Causa vs potenciadores', frame: 'Causa vs potenciadores',
  metricas: 'Métricas a mirar', 'que no hacer ahora': 'Qué no hacer',
}
const CLAVES = { ...Object.fromEntries(TODAS.map((s) => [normal(s), s])), ...ALIAS }
const clave = (titulo) => CLAVES[normal(titulo).replace(/^\d+(\.\d+)*[.)]?\s*/, '').replace(/:$/, '').trim()] || null

function trozos(texto) {
  const salida = {}
  let actual = null
  for (const linea of (texto || '').split('\n')) {
    const m = linea.match(/^\s*#\s+(?!#)(.+?)\s*$/)
    if (m) {
      actual = clave(m[1])
      if (actual) salida[actual] = salida[actual] || []
      continue
    }
    if (actual) salida[actual].push(linea)
  }
  return salida
}

// El formato cuyas secciones aparecen más en el texto (sin secciones: el del cuello de botella).
export function formatoDe(texto) {
  const hay = Object.keys(trozos(texto))
  let mejor = 'cuello'
  let puntos = 0
  for (const [id, f] of Object.entries(FORMATOS)) {
    const n = f.secciones.filter((s) => hay.includes(s)).length
    if (n > puntos) { mejor = id; puntos = n }
  }
  return mejor
}

// Las secciones del formato del documento, en su orden (vacías si no están): las claves del objeto son el orden.
export function partir(texto, formato = null) {
  const salida = trozos(texto)
  return Object.fromEntries(FORMATOS[formato || formatoDe(texto)].secciones.map((s) => [s, (salida[s] || []).join('\n').trim()]))
}

export const unir = (partes) => Object.keys(partes).map((s) => `# ${s}\n${(partes[s] || '').trim()}`).join('\n\n')

const formatoDePartes = (partes) => Object.entries(FORMATOS).find(([, f]) => f.secciones.join('|') === Object.keys(partes || {}).join('|'))?.[0] || 'cuello'
// El título de una sección en el documento: los del cuello como los escribe Juan; los demás numerados.
export function tituloSeccion(s, partes) {
  if (formatoDePartes(partes) === 'cuello') return TITULOS[s] ?? s
  return `${Object.keys(partes).indexOf(s) + 1}. ${s}`
}
// "Diagnóstico Alvaro Larraz", "Feedback de historias Alvaro Larraz"…
export const tituloDocumento = (partes) => FORMATOS[formatoDePartes(partes)].titulo

// "[captura 03:12]" → segundos (lo mismo que cuellos_capturas.py).
const MARCA = /^\[captura\s+(\d{1,3}):(\d{2})\]$/i
// Jeremy a veces la deja pegada al final de una viñeta o en medio de un párrafo: la captura va debajo de ese bloque.
const EN_LINEA = /\s*\[captura\s+(\d{1,3}):(\d{2})\]/gi
export const segundosCaptura = (linea) => {
  const m = (linea || '').trim().match(MARCA)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}
export const minuto = (seg) => `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`
export const marcaCaptura = (seg) => `[captura ${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}]`

// Los renglones de una sección como bloques: subtítulo, párrafo, viñeta, ejemplo o captura del Loom.
export function bloques(texto) {
  const salida = []
  for (const crudo of (texto || '').split('\n')) {
    const pegadas = segundosCaptura(crudo) === null ? [...crudo.matchAll(EN_LINEA)].map((x) => Number(x[1]) * 60 + Number(x[2])) : []
    const l = (pegadas.length ? crudo.replace(EN_LINEA, '') : crudo).trim()
    const despues = pegadas.map((seg) => ({ tipo: 'captura', seg, texto: minuto(seg) }))
    if (!l) { salida.push(...despues); continue }
    let m
    const seg = segundosCaptura(l)
    if (seg !== null) salida.push({ tipo: 'captura', seg, texto: minuto(seg) })
    else if ((m = l.match(/^#{2,}\s*(.+)$/))) salida.push({ tipo: 'sub', texto: m[1] })
    else if ((m = l.match(/^[-•*]\s+(.+)$/))) salida.push({ tipo: 'item', texto: m[1] })
    else if ((m = l.match(/^>\s*(.+)$/))) salida.push({ tipo: 'cita', texto: m[1] })
    else salida.push({ tipo: 'p', texto: l })
    salida.push(...despues)
  }
  return salida
}

// "**negrita** resto" → [{ texto, negrita }]
export function tramos(texto) {
  const salida = []
  const re = /\*\*(.+?)\*\*/g
  let desde = 0
  let m
  while ((m = re.exec(texto))) {
    if (m.index > desde) salida.push({ texto: texto.slice(desde, m.index), negrita: false })
    salida.push({ texto: m[1], negrita: true })
    desde = m.index + m[0].length
  }
  if (desde < texto.length) salida.push({ texto: texto.slice(desde), negrita: false })
  return salida.length ? salida : [{ texto, negrita: false }]
}

// Para mandarlo por el chat o copiarlo: títulos numerados, sin marcas.
export function paraChat(texto) {
  const p = partir(texto)
  return Object.keys(p).filter((s) => p[s]).map((s) => {
    const cuerpo = bloques(p[s]).filter((b) => b.tipo !== 'captura').map((b) => {
      const t = b.texto.replace(/\*\*(.+?)\*\*/g, '$1')
      return b.tipo === 'sub' ? `\n${t}` : b.tipo === 'item' ? `• ${t}` : b.tipo === 'cita' ? `   ${t}` : t
    }).join('\n')
    const t = tituloSeccion(s, p)
    return t ? `${t.toUpperCase()}\n${cuerpo.trim()}` : cuerpo.trim()
  }).join('\n\n')
}
