// El documento del cuello de botella con el formato de Juan (Diagnóstico HAR PROGRAM): secciones "# ", subtítulos
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

const normal = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const ALIAS = {
  roadmap: 'Expectativas', meta: 'Expectativas', 'frame: causa vs potenciadores': 'Causa vs potenciadores', frame: 'Causa vs potenciadores',
  metricas: 'Métricas a mirar', 'que no hacer ahora': 'Qué no hacer',
}
const CLAVES = { ...Object.fromEntries(SECCIONES.map((s) => [normal(s), s])), ...ALIAS }
const clave = (titulo) => CLAVES[normal(titulo).replace(/^\d+(\.\d+)*[.)]?\s*/, '').replace(/:$/, '').trim()] || null

export function partir(texto) {
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
  return Object.fromEntries(SECCIONES.map((s) => [s, (salida[s] || []).join('\n').trim()]))
}

export const unir = (partes) => SECCIONES.map((s) => `# ${s}\n${(partes[s] || '').trim()}`).join('\n\n')

// "[captura 03:12]" → segundos (lo mismo que cuellos_capturas.py).
const MARCA = /^\[captura\s+(\d{1,3}):(\d{2})\]$/i
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
    const l = crudo.trim()
    if (!l) continue
    let m
    const seg = segundosCaptura(l)
    if (seg !== null) salida.push({ tipo: 'captura', seg, texto: minuto(seg) })
    else if ((m = l.match(/^#{2,}\s*(.+)$/))) salida.push({ tipo: 'sub', texto: m[1] })
    else if ((m = l.match(/^[-•*]\s+(.+)$/))) salida.push({ tipo: 'item', texto: m[1] })
    else if ((m = l.match(/^>\s*(.+)$/))) salida.push({ tipo: 'cita', texto: m[1] })
    else salida.push({ tipo: 'p', texto: l })
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
  return SECCIONES.filter((s) => p[s]).map((s) => {
    const cuerpo = bloques(p[s]).filter((b) => b.tipo !== 'captura').map((b) => {
      const t = b.texto.replace(/\*\*(.+?)\*\*/g, '$1')
      return b.tipo === 'sub' ? `\n${t}` : b.tipo === 'item' ? `• ${t}` : b.tipo === 'cita' ? `   ${t}` : t
    }).join('\n')
    return TITULOS[s] ? `${TITULOS[s].toUpperCase()}\n${cuerpo.trim()}` : cuerpo.trim()
  }).join('\n\n')
}
