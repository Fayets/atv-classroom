import { useEffect, useRef, useState } from 'react'
import LaserFlow from '../efectos/LaserFlow'

// El haz de luz del inicio: cae desde la barra de arriba y se derrama sobre el campo de la guía, justo antes
// del botón de enviar. Va detrás del contenido (no tapa el título ni el texto) y sin eventos del mouse.
//   - Claro / oscuro: sigue a <html data-modo="azul"> (lo cambia el menú del avatar).
//   - Celular: menos resolución, niebla y polvo, para no gastar batería.
//   - Movimiento reducido: LaserFlow ya lo respeta (queda quieto, sin la caída inicial).

// Cuántos píxeles antes del borde derecho del campo cae el haz (a la izquierda del botón de enviar).
const ANTES_DEL_BOTON = 84

function useModoOscuro() {
  const [oscuro, setOscuro] = useState(() => document.documentElement.dataset.modo === 'azul')
  useEffect(() => {
    const html = document.documentElement
    const mirar = new MutationObserver(() => setOscuro(html.dataset.modo === 'azul'))
    mirar.observe(html, { attributes: true, attributeFilter: ['data-modo'] })
    return () => mirar.disconnect()
  }, [])
  return oscuro
}

export default function HazGuia({ campoRef }) {
  const marco = useRef(null)
  const oscuro = useModoOscuro()
  const [posicion, setPosicion] = useState(0.7)
  const [angosto, setAngosto] = useState(() => window.matchMedia('(max-width: 640px)').matches)

  // La posición del haz es una fracción del ancho del marco: se recalcula cuando cambia el tamaño del marco
  // o del campo (y cuando el título se pliega al abrir el chat de la guía).
  useEffect(() => {
    const calcular = () => {
      const m = marco.current?.getBoundingClientRect()
      const c = campoRef.current?.getBoundingClientRect()
      if (!m?.width || !c?.width) return
      const x = c.right - Math.min(ANTES_DEL_BOTON, c.width * 0.25) - m.left
      setPosicion(Math.min(1, Math.max(0, x / m.width)))
      setAngosto(window.innerWidth <= 640)
    }
    calcular()
    const ro = new ResizeObserver(calcular)
    if (marco.current) ro.observe(marco.current)
    if (campoRef.current) ro.observe(campoRef.current)
    window.addEventListener('resize', calcular)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', calcular)
    }
  }, [campoRef])

  return (
    <div className="in-haz" ref={marco} aria-hidden="true">
      <LaserFlow
        surfaceRef={campoRef}
        beamPosition={posicion}
        theme={oscuro ? 'dark' : 'light'}
        color={oscuro ? '#e4685b' : '#d14a3a'}
        intensity={oscuro ? 0.95 : 1.45}
        flare={angosto ? 1.1 : 1.6}
        spread={angosto ? 0.9 : 1.35}
        // Sin "derrame" por los costados: caía desde la mitad del campo con un borde recto sobre la lista.
        spill={0}
        fog={angosto ? 0.1 : oscuro ? 0.2 : 0.14}
        dust={angosto ? 0.8 : 1.6}
        beamWidth={angosto ? 0.7 : 0.85}
        streaks={0.7}
        dots={oscuro ? 1 : 0.6}
        pulse={1.3}
        speed={0.5}
        seed={3}
        dpr={angosto ? 1 : undefined}
        mouseInteraction={!angosto}
        intro
      />
    </div>
  )
}
