// El PDF del diagnóstico de cuello de botella, con la marca de ATV (Brand System Cáscara): fondo hueso, texto
// carbón, rojo vivo de acento y el isotipo. Sale de la versión final que aprobó Juan.
import { partir } from '../components/mac/CuellosCarpeta'
import { loadPdfMake } from './onboardingPdf'

const C = { hueso: '#F3F0E9', carbon: '#242321', rojo: '#FF2518', piedra: '#8A847C', linea: '#DDD7CC', blanco: '#FFFFFF' }
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
const lineas = (t) => (t || '').split('\n').map((l) => l.trim()).filter(Boolean)
const sinGuion = (l) => l.replace(/^[-•*]\s*/, '')

// "[Loom 07:40]" y similares van en gris chico: es de dónde salió, no parte de la frase.
function conFuentes(texto) {
  const partes = []
  const re = /\s*\[([^\]]+)\]/g
  let m
  let desde = 0
  while ((m = re.exec(texto))) {
    if (m.index > desde) partes.push({ text: texto.slice(desde, m.index) })
    partes.push({ text: `  ${m[1]}`, color: C.piedra, fontSize: 8.5 })
    desde = m.index + m[0].length
  }
  const resto = texto.slice(desde)
  if (resto) partes.push({ text: resto })
  return partes.length ? partes : [{ text: texto }]
}

const rotulo = (t) => ({ text: t.toUpperCase(), fontSize: 8, bold: true, color: C.rojo, characterSpacing: 1.6, margin: [0, 22, 0, 8] })

function lista(texto, marca = '•') {
  const items = lineas(texto)
  return {
    table: {
      widths: [12, '*'],
      body: items.map((l) => [
        { text: marca, color: C.rojo, bold: true, margin: [0, 1, 0, 0] },
        { text: conFuentes(sinGuion(l)), lineHeight: 1.3, margin: [0, 0, 0, 6] },
      ]),
    },
    layout: 'noBorders',
  }
}

function roadmap(texto) {
  const semanas = []
  for (const l of lineas(texto)) {
    const m = l.match(/^#{2,}\s*(.+)$/)
    if (m) {
      const [titulo, fecha] = m[1].split(/\s+[—–-]\s+/)
      semanas.push({ titulo: titulo || m[1], fecha: fecha || '', tareas: [] })
    } else if (semanas.length) {
      semanas[semanas.length - 1].tareas.push(sinGuion(l))
    } else {
      semanas.push({ titulo: '', fecha: '', tareas: [sinGuion(l)] })
    }
  }
  return {
    table: {
      widths: [92, '*'],
      body: semanas.map((s) => [
        { stack: [{ text: s.titulo.toUpperCase(), bold: true, fontSize: 9, characterSpacing: 1.2, color: C.carbon }, { text: s.fecha, fontSize: 8.5, color: C.piedra, margin: [0, 2, 0, 0] }], margin: [0, 8, 0, 8] },
        { stack: s.tareas.map((t) => ({ text: [{ text: '–  ', color: C.rojo, bold: true }, ...conFuentes(t)], lineHeight: 1.3, margin: [0, 0, 0, 5] })), margin: [0, 8, 0, 4] },
      ]),
    },
    layout: {
      hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.6),
      vLineWidth: () => 0,
      hLineColor: () => C.linea,
      paddingLeft: () => 0,
      paddingRight: () => 0,
    },
  }
}

function caja(contenido, fondo, color) {
  return {
    table: { widths: ['*'], body: [[{ stack: contenido, color, margin: [16, 14, 16, 14] }]] },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => fondo, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
  }
}

export async function pdfCuello({ cliente, texto, fecha = new Date() }) {
  const pdfMake = await loadPdfMake()
  const logo = await isotipo()
  const p = partir(texto)
  const dia = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const contenido = [
    { text: 'DIAGNÓSTICO DE CUELLO DE BOTELLA', fontSize: 8, bold: true, color: C.rojo, characterSpacing: 1.8 },
    { text: cliente, fontSize: 28, bold: true, color: C.carbon, margin: [0, 6, 0, 0] },
    { canvas: [{ type: 'rect', x: 0, y: 0, w: 44, h: 3, color: C.rojo }], margin: [0, 12, 0, 18] },
  ]
  if (p['Diagnóstico']) {
    contenido.push(caja([
      { text: 'EL CUELLO DE BOTELLA', fontSize: 8, bold: true, color: C.rojo, characterSpacing: 1.6, margin: [0, 0, 0, 8] },
      { text: conFuentes(p['Diagnóstico']), fontSize: 13, lineHeight: 1.35, color: C.hueso },
    ], C.carbon, C.hueso))
  }
  if (p.Causas) contenido.push(rotulo('Por qué pasa'), lista(p.Causas))
  if (p['Qué no hacer']) contenido.push(rotulo('Qué no hacer ahora'), lista(p['Qué no hacer'], '×'))
  if (p['Solución']) contenido.push(rotulo('La solución'), { text: conFuentes(p['Solución']), lineHeight: 1.35 })
  if (p.Roadmap) contenido.push(rotulo('Roadmap'), roadmap(p.Roadmap))
  if (p.Meta) {
    contenido.push({ text: '', margin: [0, 18, 0, 0] }, caja([
      { text: 'LA META', fontSize: 8, bold: true, characterSpacing: 1.6, margin: [0, 0, 0, 6] },
      { text: p.Meta, fontSize: 14, bold: true, lineHeight: 1.25 },
    ], C.rojo, C.blanco))
  }

  const doc = {
    pageSize: 'A4',
    pageMargins: [48, 74, 48, 60],
    background: () => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: ANCHO, h: ALTO, color: C.hueso }] }),
    header: () => ({
      margin: [48, 30, 48, 0],
      columns: [
        logo ? { image: logo, width: 11, margin: [0, -2, 0, 0] } : { text: '', width: 0 },
        { text: 'ATV — AUMENTA TU VALOR', fontSize: 7.5, bold: true, characterSpacing: 1.8, color: C.carbon, width: '*' },
        { text: `CUELLO DE BOTELLA · ${dia}`, fontSize: 7.5, characterSpacing: 1.4, color: C.piedra, alignment: 'right', width: 'auto' },
      ],
      columnGap: 8,
    }),
    footer: (pagina, total) => ({
      margin: [48, 18, 48, 0],
      columns: [
        { text: 'Preparado por el equipo de ATV', fontSize: 7.5, characterSpacing: 1, color: C.piedra },
        { text: `${pagina} / ${total}`, fontSize: 7.5, color: C.piedra, alignment: 'right' },
      ],
    }),
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
