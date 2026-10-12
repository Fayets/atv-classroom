import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from './Avatar'

// Notificación como las de macOS (arriba a la derecha) cuando alguien te etiqueta. Se va sola a los 8 s.
export default function AvisoMencion({ aviso, onCerrar }) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!aviso) return undefined
    const t = setTimeout(onCerrar, 8000)
    return () => clearTimeout(t)
  }, [aviso, onCerrar])

  if (!aviso) return null
  const { mensaje, canal_id: canalId } = aviso
  return (
    <div className="msj-noti" role="status" aria-live="polite">
      <button
        type="button"
        className="msj-noti__cuerpo"
        onClick={() => {
          onCerrar()
          navigate(`/mensajes?c=${canalId}`)
        }}
      >
        <Avatar persona={mensaje.autor} size={36} />
        <span className="msj-noti__txt">
          <span className="msj-noti__app">Mensajes · ahora</span>
          <b>{mensaje.autor.nombre} te etiquetó</b>
          <span>{mensaje.texto}</span>
        </span>
      </button>
      <button type="button" className="msj-noti__x" onClick={onCerrar} aria-label="Cerrar notificación">
        ✕
      </button>
    </div>
  )
}
