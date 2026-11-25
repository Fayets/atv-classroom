import { useLayoutEffect, useRef, useState } from 'react'
import TechText from './TechText'
import './NombreTech.css'

// Una palabra de un título con el efecto TechText (el nombre en "Alan, ¿qué está trabando…" y en Mi cuenta,
// y "Scrolleá" del inicio). La palabra real queda en su lugar, invisible, para que el título no se mueva y
// se lea igual; el lienzo va encima, un poco más grande (TechText achica el texto si no le entra), y dibuja
// con la misma fuente, tamaño, peso y espaciado que mide de la palabra. La tinta es la del título
// (currentColor) y el acento, el rojo de ATV de cada modo.
const ACENTO = { claro: '#c0392b', oscuro: '#ff6b5c' }

const esOscuro = () => document.documentElement.dataset.modo === 'azul'

export default function NombreTech({ texto, etiquetas = true, motas = 12, arrastrable = true, className = '' }) {
  const palabra = useRef(null)
  const [medida, setMedida] = useState(null) // { tamano, peso, espacio, mayusculas }
  const [oscuro, setOscuro] = useState(esOscuro)

  useLayoutEffect(() => {
    const el = palabra.current
    if (!el) return undefined
    const medir = () => {
      const cs = getComputedStyle(el)
      const tamano = parseFloat(cs.fontSize) || 16
      const espacio = cs.letterSpacing === 'normal' ? 0 : (parseFloat(cs.letterSpacing) || 0) / tamano
      const siguiente = { tamano, peso: Number(cs.fontWeight) || 600, espacio, mayusculas: cs.textTransform === 'uppercase' }
      setMedida((m) =>
        m && m.tamano === siguiente.tamano && m.peso === siguiente.peso && m.espacio === siguiente.espacio && m.mayusculas === siguiente.mayusculas
          ? m
          : siguiente,
      )
    }
    medir()
    const tamanos = new ResizeObserver(medir)
    tamanos.observe(el)
    const modo = new MutationObserver(() => setOscuro(esOscuro()))
    modo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-modo'] })
    return () => {
      tamanos.disconnect()
      modo.disconnect()
    }
  }, [])

  return (
    <span className={`nombre-tech ${className}`.trim()}>
      <span ref={palabra} className="nombre-tech__palabra" aria-hidden="true">
        {texto}
      </span>
      {medida ? (
        <TechText
          className="nombre-tech__lienzo"
          text={medida.mayusculas ? texto.toLocaleUpperCase('es') : texto}
          fontSize={medida.tamano}
          fontWeight={medida.peso}
          letterSpacing={medida.espacio}
          color="currentColor"
          accentColor={oscuro ? ACENTO.oscuro : ACENTO.claro}
          reveal="letter"
          dashLength={4}
          dashGap={2}
          strokeWidth={1.5}
          lineStyle="dashed"
          specks={motas}
          labels={etiquetas}
          selection
          draggable={arrastrable}
          clickKick={arrastrable}
          bounce={0.25}
          sweep
          speed={1}
          intro="none"
          guides={false}
          align="center"
        />
      ) : null}
    </span>
  )
}
