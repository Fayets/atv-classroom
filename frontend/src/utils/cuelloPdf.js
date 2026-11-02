// El PDF del diagnóstico de cuello de botella: sobrio, como pidió Franco. Hoja hueso de la marca de ATV, el isotipo
// arriba y el texto en carbón, en Poppins y con el estilo del Google Doc de Juan (Diagnóstico HAR PROGRAM): títulos
// grandes en negrita, subtítulos en negrita, texto con aire. Sale de la versión final que aprobó Juan.
import { bloques, partir, SECCIONES, TITULOS, tramos } from './docCuello'
import { loadPdfMake } from './onboardingPdf'

const C = { hueso: '#F3F0E9', carbon: '#242321', piedra: '#8A847C' }

// Poppins, la tipografía de todo lo que ve el cliente (public/fonts, de Google Fonts, licencia OFL).
function poppins(pdfMake) {
  const url = (f) => `${window.location.origin}/fonts/${f}.ttf`
  const fuentes = { Poppins: { normal: url('Poppins-Regular'), bold: url('Poppins-Bold'), italics: url('Poppins-Italic'), bolditalics: url('Poppins-Bold') } }
  if (typeof pdfMake.addFonts === 'function') pdfMake.addFonts(fuentes)
  else pdfMake.fonts = { ...(pdfMake.fonts || {}), ...fuentes }
}
const ANCHO = 595.28
const ALTO = 841.89

async function isotipo() {
  try {
    const r = await fetch('/atv-logo-negro.png')
    if (!r.ok) return null
    const blob = await r.blob()
    return await new Promise((ok) => {
      const fr = new FileReader()
      fr.onloadend = () => ok(typeof fr.result === 'string' ? fr.result : null)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

const slug = (t) => (t || 'cliente').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cliente'

// Un renglón con **negrita** → los tramos de pdfmake. Si quedó alguna fuente "[chat 22-10]", va en gris chico.
function enLinea(texto) {
  const salida = []
  for (const t of tramos(texto)) {
    const partes = t.texto.split(/(\s*\[[^\]]+\])/)
    for (const p of partes) {
      if (!p) continue
      if (/^\s*\[[^\]]+\]$/.test(p)) salida.push({ text: ` ${p.trim().slice(1, -1)}`, color: C.piedra, fontSize: 8.5 })
      else salida.push(t.negrita ? { text: p, bold: true } : { text: p })
    }
  }
  return salida
}

// Las capturas del Loom que marca el documento, ya bajadas: { segundos: dataURL }.
async function capturas(base, texto) {
  const salida = {}
  if (!base) return salida
  const segs = [...new Set(bloques(texto.replace(/^#.*$/gm, '')).filter((b) => b.tipo === 'captura').map((b) => b.seg))]
  await Promise.all(segs.map(async (seg) => {
    try {
      const r = await fetch(`${base}/${seg}.jpg`)
      if (!r.ok) return
      const blob = await r.blob()
      salida[seg] = await new Promise((ok) => {
        const fr = new FileReader()
        fr.onloadend = () => ok(typeof fr.result === 'string' ? fr.result : null)
        fr.readAsDataURL(blob)
      })
    } catch { /* sin esa captura */ }
  }))
  return salida
}

// Los bloques de una sección (subtítulo, párrafo, viñeta, ejemplo, captura) en pdfmake.
function cuerpo(texto, imgs = {}) {
  const salida = []
  // Poppins no trae "●": el punto de la viñeta se dibuja.
  const punto = () => ({ canvas: [{ type: 'ellipse', x: 2, y: 7.5, r1: 1.9, r2: 1.9, color: C.carbon }], width: 16 })
  let previo = null
  for (const b of bloques(texto)) {
    const despuesDeLista = previo === 'item' && b.tipo !== 'item' ? 6 : 0
    if (b.tipo === 'captura') {
      if (imgs[b.seg]) salida.push({ image: imgs[b.seg], width: ANCHO - 128, margin: [0, 2 + despuesDeLista, 0, 12] })
    } else if (b.tipo === 'sub') salida.push({ text: enLinea(b.texto), bold: true, fontSize: 12.5, margin: [0, 8 + despuesDeLista, 0, 6] })
    else if (b.tipo === 'item') salida.push({ columns: [punto(), { text: enLinea(b.texto), width: '*', lineHeight: 1.2 }], margin: [16, 0, 0, 4] })
    else if (b.tipo === 'cita') salida.push({ text: enLinea(b.texto), lineHeight: 1.2, margin: [24, 2 + despuesDeLista, 0, 10] })
    else salida.push({ text: enLinea(b.texto), lineHeight: 1.2, margin: [0, despuesDeLista, 0, 10] })
    previo = b.tipo
  }
  return salida
}

// Los títulos como en el Doc de Juan: "2. Causas" grande y en negrita.
const titulo = (s) => ({ text: TITULOS[s], bold: true, fontSize: 16.5, margin: [0, 10, 0, 8] })

export async function pdfCuello({ cliente, texto, fecha = new Date(), capturas: base = null }) {
  const pdfMake = await loadPdfMake()
  poppins(pdfMake)
  const [logo, imgs] = await Promise.all([isotipo(), capturas(base, texto || '')])
  const p = partir(texto)
  const contenido = [{ text: `Diagnóstico ${cliente}`, fontSize: 21, bold: true, margin: [0, 0, 0, 12] }]
  for (const s of SECCIONES) {
    if (!p[s]) continue
    // El título y el primer bloque van juntos: un título nunca queda solo al pie de la página.
    const [primero, ...resto] = cuerpo(p[s], imgs)
    contenido.push({ stack: [...(TITULOS[s] ? [titulo(s)] : [{ text: '', margin: [0, 10, 0, 0] }]), ...(primero ? [primero] : [])], unbreakable: true }, ...resto)
  }

  const doc = {
    pageSize: 'A4',
    pageMargins: [64, 80, 64, 60],
    background: () => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: ANCHO, h: ALTO, color: C.hueso }] }),
    header: () => (logo ? { image: logo, width: 15, margin: [64, 36, 0, 0] } : { text: '' }),
    footer: (pagina, total) => (total > 1 ? { text: `${pagina} / ${total}`, fontSize: 7.5, color: C.piedra, alignment: 'right', margin: [64, 20, 64, 0] } : { text: '' }),
    content: contenido,
    defaultStyle: { font: 'Poppins', fontSize: 10.5, color: C.carbon },
    info: { title: `Cuello de botella · ${cliente}`, author: 'ATV — Aumenta Tu Valor' },
  }
  const blob = await pdfMake.createPdf(doc).getBlob()
  return { blob, nombre: `cuello-de-botella-${slug(cliente)}-${fecha.toISOString().slice(0, 10)}.pdf` }
}

export async function descargarPdfCuello(datos) {
  const { blob, nombre } = await pdfCuello(datos)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
