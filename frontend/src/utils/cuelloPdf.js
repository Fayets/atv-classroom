// El PDF del diagnóstico de cuello de botella: sobrio, como pidió Franco. Hoja hueso de la marca de ATV, el isotipo
// arriba y el texto en carbón, en Poppins y con el diseño A (Memo); el contenido sigue el documento de Juan. Sale de la versión final que aprobó Juan.
import { bloques, partir, SECCIONES, TITULOS, tramos } from './docCuello'
import { loadPdfMake } from './onboardingPdf'

const C = { hueso: '#F3F0E9', carbon: '#242321', piedra: '#8A847C', linea: '#D9D3C8', cita: '#4A4642' }

// Poppins, la tipografía de todo lo que ve el cliente (public/fonts, de Google Fonts, licencia OFL).
function poppins(pdfMake) {
  const url = (f) => `${window.location.origin}/fonts/${f}.ttf`
  const fuentes = { Poppins: { normal: url('Poppins-Regular'), bold: url('Poppins-SemiBold'), italics: url('Poppins-Italic'), bolditalics: url('Poppins-SemiBold') } }
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

// Los bloques de una sección (subtítulo, párrafo, viñeta, ejemplo) en pdfmake.
function cuerpo(texto) {
  const salida = []
  for (const b of bloques(texto)) {
    if (b.tipo === 'sub') salida.push({ text: enLinea(b.texto), bold: true, margin: [0, 7, 0, 2] })
    else if (b.tipo === 'item') salida.push({ columns: [{ text: '•', width: 11 }, { text: enLinea(b.texto), width: '*', lineHeight: 1.3 }], margin: [0, 0, 0, 3] })
    else if (b.tipo === 'cita') salida.push({ text: enLinea(b.texto), italics: true, color: C.cita, lineHeight: 1.3, margin: [12, 1, 0, 7] })
    else salida.push({ text: enLinea(b.texto), lineHeight: 1.35, margin: [0, 0, 0, 6] })
  }
  return salida
}

// Diseño A ("Memo", elegido por Franco el 01-11-2026): línea fina entre secciones y el número en gris.
const separador = () => ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 499, y2: 0, lineWidth: 0.6, lineColor: C.linea }], margin: [0, 14, 0, 9] })
function titulo(s) {
  const [num, ...resto] = TITULOS[s].split('. ')
  return { text: [{ text: `${num}   `, color: C.piedra, bold: false }, { text: resto.join('. ') }], bold: true, fontSize: 12, margin: [0, 0, 0, 6] }
}

export async function pdfCuello({ cliente, texto, fecha = new Date() }) {
  const pdfMake = await loadPdfMake()
  poppins(pdfMake)
  const logo = await isotipo()
  const p = partir(texto)
  const contenido = [{ text: `Diagnóstico ${cliente}`, fontSize: 21, bold: true, characterSpacing: -0.3, margin: [0, 0, 0, 6] }]
  for (const s of SECCIONES) {
    if (!p[s]) continue
    // La línea, el título y el primer bloque van juntos: un título nunca queda solo al pie de la página.
    const [primero, ...resto] = cuerpo(p[s])
    contenido.push({ stack: [separador(), ...(TITULOS[s] ? [titulo(s)] : []), ...(primero ? [primero] : [])], unbreakable: true }, ...resto)
  }

  const doc = {
    pageSize: 'A4',
    pageMargins: [48, 78, 48, 56],
    background: () => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: ANCHO, h: ALTO, color: C.hueso }] }),
    header: () => (logo ? { image: logo, width: 15, margin: [48, 34, 0, 0] } : { text: '' }),
    footer: (pagina, total) => (total > 1 ? { text: `${pagina} / ${total}`, fontSize: 7.5, color: C.piedra, alignment: 'right', margin: [48, 18, 48, 0] } : { text: '' }),
    content: contenido,
    defaultStyle: { font: 'Poppins', fontSize: 9.5, color: C.carbon },
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
