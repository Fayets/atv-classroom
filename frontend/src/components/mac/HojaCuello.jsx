import { useMemo } from 'react'
import { bloques, marcaCaptura, minuto, tituloDocumento, tituloSeccion, tramos } from '../../utils/docCuello'

// El diagnóstico tal como sale en el PDF (sobrio: hoja hueso, el logo y el texto), con el formato y el estilo del documento de Juan, y editable ahí mismo: cada
// sección es un bloque editable con subtítulos, párrafos, viñetas, ejemplos y negritas. Al escribir se lee de
// vuelta como texto ("### ", "- ", "> ", "**"), así lo que se guarda y lo que mide la neurona no cambia.
// Los bloques no se vuelven a dibujar con cada tecla (perderían el cursor): se arman con el texto inicial.

function Tramos({ texto }) {
  return tramos(texto).map((t, i) => (t.negrita ? <strong key={i}>{t.texto}</strong> : <span key={i}>{t.texto}</span>))
}

// Una captura del Loom: no se edita por dentro (se borra entera o se agrega otra con la barra).
function Captura({ seg, base }) {
  return (
    <figure className="hc-captura" contentEditable={false} data-captura={seg}>
      <img src={`${base}/${seg}.jpg`} alt={`Loom en el minuto ${minuto(seg)}`} loading="lazy"
        onError={(e) => { e.currentTarget.replaceWith(Object.assign(document.createElement('div'), { className: 'hc-captura-falla', textContent: 'No se pudo sacar esta captura del Loom.' })) }} />
    </figure>
  )
}

// Texto → elementos (las viñetas seguidas van en una misma lista).
function Contenido({ texto, base }) {
  const salida = []
  let lista = null
  bloques(texto).forEach((b, i) => {
    if (b.tipo === 'item') {
      if (!lista) {
        lista = []
        salida.push(<ul key={`u${i}`}>{lista}</ul>)
      }
      lista.push(<li key={i}><Tramos texto={b.texto} /></li>)
      return
    }
    lista = null
    if (b.tipo === 'captura') {
      if (base) salida.push(<Captura key={i} seg={b.seg} base={base} />)
    } else if (b.tipo === 'sub') salida.push(<h4 key={i}><Tramos texto={b.texto} /></h4>)
    else if (b.tipo === 'cita') salida.push(<blockquote key={i}><Tramos texto={b.texto} /></blockquote>)
    else salida.push(<p key={i}><Tramos texto={b.texto} /></p>)
  })
  return salida.length ? salida : <p><br /></p>
}

// Lo pegado de Google Docs trae la negrita como estilo (font-weight: 700) y envuelve todo en un <b> con
// font-weight normal: cuenta lo que se ve, no la etiqueta.
function esNegrita(n) {
  const peso = n.style?.fontWeight
  if (peso) return peso === 'bold' || Number(peso) >= 600
  return n.nodeName === 'STRONG' || n.nodeName === 'B'
}

// Elementos → texto con marcas.
function enLinea(nodo) {
  let t = ''
  nodo.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) t += n.textContent
    else if (n.nodeName === 'BR') t += ' '
    else if (esNegrita(n)) {
      const adentro = enLinea(n).trim()
      if (adentro) t += `**${adentro}**`
    } else t += enLinea(n)
  })
  return t.replace(/ /g, ' ').replace(/\s+/g, ' ')
}

function leer(raiz) {
  const lineas = []
  raiz.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      if (n.textContent.trim()) lineas.push(n.textContent.trim())
      return
    }
    const tag = n.nodeName
    if (n.dataset?.captura) lineas.push(marcaCaptura(Number(n.dataset.captura)))
    else if (tag === 'UL' || tag === 'OL') n.querySelectorAll('li').forEach((li) => { const t = enLinea(li).trim(); if (t) lineas.push(`- ${t}`) })
    else if (/^H[1-6]$/.test(tag)) { const t = enLinea(n).trim(); if (t) lineas.push(`### ${t}`) }
    else if (tag === 'BLOCKQUOTE') { const t = enLinea(n).trim(); if (t) lineas.push(`> ${t}`) }
    else if (n.querySelector?.('ul,ol,h1,h2,h3,h4,h5,h6,blockquote,p,div,figure')) lineas.push(leer(n)) // un envoltorio (el <b> de Google Docs, un div) con bloques adentro
    else { const t = enLinea(n).trim(); if (t) lineas.push(t) }
  })
  return lineas.filter(Boolean).join('\n')
}

function Seccion({ texto, alCambiar, base }) {
  const inicial = useMemo(() => texto || '', []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="hc-editable hc-rico" contentEditable suppressContentEditableWarning spellCheck onInput={(e) => alCambiar(leer(e.currentTarget))}>
      <Contenido texto={inicial} base={base} />
    </div>
  )
}

// Barra de formato: usa los comandos del navegador sobre lo que está seleccionado en la hoja.
function Barra({ base }) {
  const hacer = (comando, valor) => (e) => {
    e.preventDefault()
    document.execCommand(comando, false, valor)
  }
  // Otra captura donde está el cursor: se pide el minuto del Loom.
  const captura = (e) => {
    e.preventDefault()
    const sel = window.getSelection()
    const rango = sel?.rangeCount ? sel.getRangeAt(0) : null
    if (!rango || !rango.startContainer.parentElement?.closest('.hc-editable')) return
    const m = (window.prompt('¿En qué minuto del Loom? (por ejemplo 3:12)') || '').trim().match(/^(\d{1,3}):(\d{2})$/)
    if (!m) return
    sel.removeAllRanges()
    sel.addRange(rango)
    const seg = Number(m[1]) * 60 + Number(m[2])
    document.execCommand('insertHTML', false,
      `<figure class="hc-captura" contenteditable="false" data-captura="${seg}"><img src="${base}/${seg}.jpg" alt="Loom en el minuto ${minuto(seg)}"></figure><p><br></p>`)
  }
  return (
    <div className="hc-barra" role="toolbar" aria-label="Formato">
      <button type="button" onMouseDown={hacer('bold')} title="Negrita (⌘B)"><b>B</b></button>
      <button type="button" onMouseDown={hacer('formatBlock', 'h4')}>Subtítulo</button>
      <button type="button" onMouseDown={hacer('formatBlock', 'p')}>Texto</button>
      <button type="button" onMouseDown={hacer('insertUnorderedList')}>Viñetas</button>
      <button type="button" onMouseDown={hacer('formatBlock', 'blockquote')}>Ejemplo</button>
      {base && <button type="button" onMouseDown={captura}>Captura</button>}
    </div>
  )
}

export default function HojaCuello({ cliente, partes, original, alCambiar, capturas }) {
  // Sobre la versión más nueva: si cambian dos secciones antes de redibujar (pegar, deshacer), no se pisan.
  const cambio = (s) => (v) => alCambiar((prev) => ({ ...prev, [s]: v }))
  const marca = (s) => ((partes[s] || '').trim() !== (original[s] || '').trim() ? <em className="hc-corregida">corregida</em> : null)
  return (
    <div className="hc-marco">
      <Barra base={capturas} />
      <article className="hc-hoja" aria-label={`${tituloDocumento(partes)} de ${cliente}`}>
        <h2 className="hc-cliente">{tituloDocumento(partes)} {cliente}</h2>
        {Object.keys(partes).map((s) => (
          <section key={s} className="hc-seccion">
            {tituloSeccion(s, partes) ? <h3 className="hc-titulo">{tituloSeccion(s, partes)} {marca(s)}</h3> : marca(s)}
            <Seccion texto={partes[s]} alCambiar={cambio(s)} base={capturas} />
          </section>
        ))}
      </article>
    </div>
  )
}
