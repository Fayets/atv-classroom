import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { EVENTO_BLOQUEO } from '../utils/modoMiembro'
import '../styles/modo-miembro.css'

// Mientras el admin está en Modo Miembro: un borde fino alrededor de la pantalla (como cuando compartís
// pantalla) y una píldora abajo con la salida. Si algo intentó guardarse, la píldora lo dice un momento.
export default function ModoMiembroAviso() {
  const { modoMiembro, cambiarModoMiembro } = useAuth()
  const [bloqueo, setBloqueo] = useState(0)

  useEffect(() => {
    if (!modoMiembro) return undefined
    let reloj = null
    const alBloquear = () => {
      setBloqueo((n) => n + 1)
      clearTimeout(reloj)
      reloj = setTimeout(() => setBloqueo(0), 2600)
    }
    window.addEventListener(EVENTO_BLOQUEO, alBloquear)
    return () => {
      window.removeEventListener(EVENTO_BLOQUEO, alBloquear)
      clearTimeout(reloj)
    }
  }, [modoMiembro])

  if (!modoMiembro) return null
  return (
    <>
      <div className="mm-marco" aria-hidden="true" />
      <div className={`mm-pildora${bloqueo ? ' is-bloqueo' : ''}`} role="status" key={bloqueo || 'quieta'}>
        <span className="mm-pildora__punto" aria-hidden="true" />
        <span className="mm-pildora__texto">
          {bloqueo ? (
            <>
              <b>No se guardó</b>
              <span>En Modo Miembro solo se mira</span>
            </>
          ) : (
            <>
              <b>Viendo como miembro</b>
              <span>Nada de lo que hagas se guarda</span>
            </>
          )}
        </span>
        <button type="button" className="mm-pildora__salir" onClick={() => cambiarModoMiembro(false)}>
          Volver a admin
        </button>
      </div>
    </>
  )
}
