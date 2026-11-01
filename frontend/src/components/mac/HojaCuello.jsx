import { useMemo, useRef } from 'react'

// El diagnóstico tal como sale en el PDF (hoja hueso, recuadro carbón, viñetas, roadmap por semana, meta en
// rojo) y editable ahí mismo: Juan escribe sobre el documento. Cada sección se lee de vuelta como el texto
// con "# Sección", así lo que se guarda y lo que mide la neurona no cambia.
// Los bloques editables no se vuelven a dibujar con cada tecla (perderían el cursor): se arman con el texto
// inicial y se leen del DOM al escribir.

const lineas = (t) => (t || '').split('\n').map((l) => l.trim()).filter(Boolean)
const sinGuion = (l) => l.replace(/^[-•*]\s*/, '')

function semanasDe(texto) {
  const semanas = []
  for (const l of lineas(texto)) {
    const m = l.match(/^#{2,}\s*(.+)$/)
    if (m) semanas.push({ titulo: m[1], tareas: [] })
    else if (semanas.length) semanas[semanas.length - 1].tareas.push(sinGuion(l))
    else semanas.push({ titulo: 'Semana 1', tareas: [sinGuion(l)] })
  }
  return semanas.length ? semanas : [{ titulo: 'Semana 1', tareas: [''] }]
}

const textoDe = (el) => (el?.innerText || '').replace(/ /g, ' ').trim()

function leerLista(ul) {
  const items = [...ul.querySelectorAll('li')].map(textoDe)
  // Si borró todas las viñetas y escribió suelto, cada renglón es un ítem.
  const crudos = items.length ? items : textoDe(ul).split('\n')
  return crudos.map((t) => t.trim()).filter(Boolean).map((t) => `- ${t}`).join('\n')
}

function Lista({ texto, alCambiar, marca }) {
  const inicial = useMemo(() => lineas(texto).map(sinGuion), []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ul className={`hc-lista${marca === 'x' ? ' is-no' : ''}`} contentEditable suppressContentEditableWarning spellCheck onInput={(e) => alCambiar(leerLista(e.currentTarget))}>
      {(inicial.length ? inicial : ['']).map((l, i) => <li key={i}>{l}</li>)}
    </ul>
  )
}

function Parrafo({ texto, alCambiar, className = '' }) {
  const inicial = useMemo(() => texto || '', []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`hc-editable ${className}`} contentEditable suppressContentEditableWarning spellCheck onInput={(e) => alCambiar(textoDe(e.currentTarget))}>
      {inicial}
    </div>
  )
}

function Roadmap({ texto, alCambiar }) {
  const caja = useRef(null)
  const inicial = useMemo(() => semanasDe(texto), []) // eslint-disable-line react-hooks/exhaustive-deps
  const leer = () => {
    const bloques = [...caja.current.querySelectorAll('.hc-semana')]
    alCambiar(bloques.map((b) => {
      const titulo = textoDe(b.querySelector('.hc-semana__titulo'))
      const tareas = leerLista(b.querySelector('ul'))
      return [titulo ? `## ${titulo}` : '', tareas].filter(Boolean).join('\n')
    }).filter(Boolean).join('\n'))
  }
  return (
    <div className="hc-roadmap" ref={caja} onInput={leer}>
      {inicial.map((s, i) => (
        <div key={i} className="hc-semana">
          <div className="hc-semana__titulo" contentEditable suppressContentEditableWarning>{s.titulo}</div>
          <ul className="hc-lista is-tareas" contentEditable suppressContentEditableWarning spellCheck>
            {(s.tareas.length ? s.tareas : ['']).map((t, j) => <li key={j}>{t}</li>)}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default function HojaCuello({ cliente, partes, original, alCambiar }) {
  const cambio = (s) => (v) => alCambiar({ ...partes, [s]: v })
  const marca = (s) => ((partes[s] || '').trim() !== (original[s] || '').trim() ? <em className="hc-corregida">corregida</em> : null)
  return (
    <article className="hc-hoja" aria-label={`Diagnóstico de ${cliente}`}>
      <header className="hc-cab">
        <span>ATV — AUMENTA TU VALOR</span>
        <span>CUELLO DE BOTELLA</span>
      </header>
      <p className="hc-rotulo">Diagnóstico de cuello de botella</p>
      <h2 className="hc-cliente">{cliente}</h2>
      <i className="hc-raya" aria-hidden="true" />

      <section className="hc-caja is-carbon">
        <p className="hc-rotulo">El cuello de botella {marca('Diagnóstico')}</p>
        <Parrafo texto={partes['Diagnóstico']} alCambiar={cambio('Diagnóstico')} className="is-grande" />
      </section>

      <p className="hc-rotulo">Por qué pasa {marca('Causas')}</p>
      <Lista texto={partes.Causas} alCambiar={cambio('Causas')} />

      <p className="hc-rotulo">Qué no hacer ahora {marca('Qué no hacer')}</p>
      <Lista texto={partes['Qué no hacer']} alCambiar={cambio('Qué no hacer')} marca="x" />

      <p className="hc-rotulo">La solución {marca('Solución')}</p>
      <Parrafo texto={partes['Solución']} alCambiar={cambio('Solución')} />

      <p className="hc-rotulo">Roadmap {marca('Roadmap')}</p>
      <Roadmap texto={partes.Roadmap} alCambiar={cambio('Roadmap')} />

      <section className="hc-caja is-rojo">
        <p className="hc-rotulo">La meta {marca('Meta')}</p>
        <Parrafo texto={partes.Meta} alCambiar={cambio('Meta')} className="is-meta" />
      </section>

      <footer className="hc-pie">Preparado por el equipo de ATV</footer>
    </article>
  )
}
