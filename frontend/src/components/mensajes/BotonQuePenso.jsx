import { useEffect, useRef, useState } from 'react'
import QuePenso from './QuePenso'

// "Qué pensó" arriba del chat: un botón que aparece cuando el Tab tiene una sugerencia y abre, en un
// panel, lo que entendió y cómo corregirlo (components/mensajes/QuePenso, sin cambios en su lógica).
// Se marca con un punto cuando llega una sugerencia nueva que todavía no miraste. La sugerencia se
// reconoce por su texto final: lo que llega acá (alPensar en Conversacion) no trae su id.
export default function BotonQuePenso({ info }) {
  const [abierto, setAbierto] = useState(false)
  const [vista, setVista] = useState(null) // texto de la última sugerencia que abriste
  const caja = useRef(null)
  // Al corregir, el Tab pide otra sugerencia y "info" queda vacío un instante: con el panel abierto se
  // sigue viendo lo último (como "escribiendo…") en vez de cerrarse en la cara de quien corrigió.
  // Al cambiar de chat no hace falta limpiarlo: este botón vive dentro de la conversación, que se
  // vuelve a armar con cada chat.
  const ultima = useRef(null)
  if (info) ultima.current = info

  useEffect(() => {
    if (!abierto) return undefined
    const fuera = (e) => !caja.current?.contains(e.target) && setAbierto(false)
    const esc = (e) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', esc)
    }
  }, [abierto])

  const mostrada = info || (abierto && ultima.current ? { ...ultima.current, cargando: true } : null)
  if (!mostrada) return null
  const clave = mostrada.cargando ? null : mostrada.sugerencia || mostrada.que || null
  const nueva = clave != null && clave !== vista && !abierto

  return (
    <span className="qp-boton" ref={caja}>
      <button
        type="button"
        className={`qp-boton__abrir${abierto ? ' is-on' : ''}`}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        onClick={() => {
          setAbierto((a) => !a)
          setVista(clave)
        }}
        title="Qué entendió el Tab antes de sugerirte la respuesta"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />
          <path d="M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
        </svg>
        <span>Qué pensó</span>
        {mostrada.cargando ? <i className="qp-boton__cargando" aria-label="Escribiendo la sugerencia" /> : nueva ? <i className="qp-boton__nuevo" aria-label="Sugerencia nueva" /> : null}
      </button>
      {abierto ? (
        <div className="qp-boton__panel" role="dialog" aria-label="Qué pensó el Tab">
          <QuePenso info={mostrada} />
        </div>
      ) : null}
    </span>
  )
}
