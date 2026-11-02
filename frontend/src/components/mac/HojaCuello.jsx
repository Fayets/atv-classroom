import { useMemo } from 'react'
import { bloques, SECCIONES, TITULOS, tramos } from '../../utils/docCuello'

// El diagnóstico tal como sale en el PDF (sobrio: hoja hueso, el logo y el texto), con el formato del documento de Juan, y editable ahí mismo: cada
// sección es un bloque editable con subtítulos, párrafos, viñetas, ejemplos y negritas. Al escribir se lee de
// vuelta como texto ("### ", "- ", "> ", "**"), así lo que se guarda y lo que mide la neurona no cambia.
// Los bloques no se vuelven a dibujar con cada tecla (perderían el cursor): se arman con el texto inicial.

function Tramos({ texto }) {
  return tramos(texto).map((t, i) => (t.negrita ? <strong key={i}>{t.texto}</strong> : <span key={i}>{t.texto}</span>))
}

// Texto → elementos (las viñetas seguidas van en una misma lista).
function Contenido({ texto }) {
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
    if (b.tipo === 'sub') salida.push(<h4 key={i}><Tramos texto={b.texto} /></h4>)
    else if (b.tipo === 'cita') salida.push(<blockquote key={i}><Tramos texto={b.texto} /></blockquote>)
    else salida.push(<p key={i}><Tramos texto={b.texto} /></p>)
  })
  return salida.length ? salida : <p><br /></p>
}

// Elementos → texto con marcas.
function enLinea(nodo) {
  let t = ''
  nodo.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) t += n.textContent
    else if (n.nodeName === 'BR') t += ' '
    else if (n.nodeName === 'STRONG' || n.nodeName === 'B') {
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
    if (tag === 'UL' || tag === 'OL') n.querySelectorAll('li').forEach((li) => { const t = enLinea(li).trim(); if (t) lineas.push(`- ${t}`) })
    else if (/^H[1-6]$/.test(tag)) { const t = enLinea(n).trim(); if (t) lineas.push(`### ${t}`) }
    else if (tag === 'BLOCKQUOTE') { const t = enLinea(n).trim(); if (t) lineas.push(`> ${t}`) }
    else if ((tag === 'DIV' || tag === 'P') && n.querySelector('ul,ol,h1,h2,h3,h4,h5,h6,blockquote,p,div')) lineas.push(leer(n))
    else { const t = enLinea(n).trim(); if (t) lineas.push(t) }
  })
  return lineas.filter(Boolean).join('\n')
}

function Seccion({ texto, alCambiar }) {
  const inicial = useMemo(() => texto || '', []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="hc-editable hc-rico" contentEditable suppressContentEditableWarning spellCheck onInput={(e) => alCambiar(leer(e.currentTarget))}>
      <Contenido texto={inicial} />
    </div>
  )
}

// Barra de formato: usa los comandos del navegador sobre lo que está seleccionado en la hoja.
function Barra() {
  const hacer = (comando, valor) => (e) => {
    e.preventDefault()
    document.execCommand(comando, false, valor)
  }
  return (
    <div className="hc-barra" role="toolbar" aria-label="Formato">
      <button type="button" onMouseDown={hacer('bold')} title="Negrita (⌘B)"><b>B</b></button>
      <button type="button" onMouseDown={hacer('formatBlock', 'h4')}>Subtítulo</button>
      <button type="button" onMouseDown={hacer('formatBlock', 'p')}>Texto</button>
      <button type="button" onMouseDown={hacer('insertUnorderedList')}>Viñetas</button>
      <button type="button" onMouseDown={hacer('formatBlock', 'blockquote')}>Ejemplo</button>
    </div>
  )
}

export default function HojaCuello({ cliente, partes, original, alCambiar }) {
  const cambio = (s) => (v) => alCambiar({ ...partes, [s]: v })
  const marca = (s) => ((partes[s] || '').trim() !== (original[s] || '').trim() ? <em className="hc-corregida">corregida</em> : null)
  return (
    <div className="hc-marco">
      <Barra />
      <article className="hc-hoja" aria-label={`Diagnóstico de ${cliente}`}>
        <img className="hc-logo" src="/atv-logo-negro.png" alt="ATV" />
        <h2 className="hc-cliente">Diagnóstico {cliente}</h2>
        {SECCIONES.map((s) => (
          <section key={s} className="hc-seccion">
            {TITULOS[s] ? <h3 className="hc-titulo"><span>{TITULOS[s].split('. ')[0]}</span>{TITULOS[s].split('. ').slice(1).join('. ')} {marca(s)}</h3> : marca(s)}
            <Seccion texto={partes[s]} alCambiar={cambio(s)} />
          </section>
        ))}
      </article>
    </div>
  )
}
