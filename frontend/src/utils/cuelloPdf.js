// El PDF del diagnóstico de cuello de botella: sobrio, como pidió Franco. Hoja hueso de la marca de ATV, el isotipo
// arriba y el texto en carbón, con el formato del documento de Juan. Sale de la versión final que aprobó Juan.
import { bloques, partir, SECCIONES, TITULOS, tramos } from './docCuello'
import { loadPdfMake } from './onboardingPdf'

const C = { hueso: '#F3F0E9', carbon: '#242321', piedra: '#8A847C' }
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
    if (b.tipo === 'sub') salida.push({ text: enLinea(b.texto), bold: true, fontSize: 11, margin: [0, 8, 0, 4] })
    else if (b.tipo === 'item') salida.push({ columns: [{ text: '•', width: 12 }, { text: enLinea(b.texto), width: '*', lineHeight: 1.3 }], margin: [0, 0, 0, 5] })
    else if (b.tipo === 'cita') salida.push({ text: enLinea(b.texto), italics: true, lineHeight: 1.3, margin: [14, 2, 0, 8] })
    else salida.push({ text: enLinea(b.texto), lineHeight: 1.35, margin: [0, 0, 0, 7] })
  }
  return salida
}

export async function pdfCuello({ cliente, texto, fecha = new Date() }) {
  const pdfMake = await loadPdfMake()
  const logo = await isotipo()
  const p = partir(texto)
  const contenido = [{ text: `Diagnóstico ${cliente}`, fontSize: 22, bold: true, margin: [0, 0, 0, 14] }]
  for (const s of SECCIONES) {
    if (!p[s]) continue
    if (TITULOS[s]) contenido.push({ text: TITULOS[s], fontSize: 14, bold: true, margin: [0, 14, 0, 7] })
    else contenido.push({ text: '', margin: [0, 10, 0, 0] })
    contenido.push(...cuerpo(p[s]))
  }

  const doc = {
    pageSize: 'A4',
    pageMargins: [48, 74, 48, 60],
    background: () => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: ANCHO, h: ALTO, color: C.hueso }] }),
    header: () => (logo ? { image: logo, width: 14, margin: [48, 30, 0, 0] } : { text: '' }),
    footer: (pagina, total) => (total > 1 ? { text: `${pagina} / ${total}`, fontSize: 7.5, color: C.piedra, alignment: 'right', margin: [48, 18, 48, 0] } : { text: '' }),
    content: contenido,
    defaultStyle: { font: 'Roboto', fontSize: 10.5, color: C.carbon },
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
