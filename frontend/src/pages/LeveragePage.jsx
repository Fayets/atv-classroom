import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { autorizarLeverage } from '../api/leverage'
import { useAuth } from '../context/AuthContext'
import '../styles/leverage.css'

// "Entrar con el classroom" desde ATV Leverage: la persona del equipo acepta y su Leverage queda con su clave
// personal (solo lectura). Si no tenía la sesión abierta, entra y vuelve sola acá.
export const VOLVER_A = 'atv-volver-a'
const VUELTA = /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}\/classroom\/vuelta$/

export default function LeveragePage() {
  const { isAuthenticated, isEquipo, user } = useAuth()
  const { search, pathname } = useLocation()
  const params = new URLSearchParams(search)
  const vuelta = params.get('vuelta') || ''
  const estado = params.get('estado') || ''
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [cancelado, setCancelado] = useState(false)

  if (!isAuthenticated) {
    try {
      sessionStorage.setItem(VOLVER_A, `${pathname}${search}`)
    } catch {
      /* sin almacenamiento: vuelve a la bandeja y hay que tocar de nuevo en Leverage */
    }
    return <Navigate to="/login" replace />
  }

  const valido = VUELTA.test(vuelta) && estado.length >= 16
  let cuerpo
  if (!isEquipo) {
    cuerpo = <p className="lv-texto">ATV Leverage lo conecta solo el equipo de ATV.</p>
  } else if (!valido) {
    cuerpo = <p className="lv-texto">Este pedido no vino de ATV Leverage en esta compu. Abrilo de nuevo desde Leverage, en Ajustes.</p>
  } else if (cancelado) {
    cuerpo = <p className="lv-texto">No se conectó. Podés cerrar esta pestaña.</p>
  } else {
    cuerpo = (
      <>
        <p className="lv-texto">
          Tu ATV Leverage va a poder leer el classroom como vos: tus pendientes, los chats de clientes, lo que aprendió el cerebro y tu voz. Solo lee: no manda nada a nadie.
        </p>
        <p className="lv-texto lv-texto--suave">Lo podés desconectar cuando quieras desde Leverage.</p>
        {error && <p className="lv-error" role="alert">{error}</p>}
        <div className="lv-botones">
          <button
            type="button"
            className="lv-boton lv-boton--si"
            disabled={enviando}
            onClick={async () => {
              setEnviando(true)
              setError('')
              try {
                const r = await autorizarLeverage(vuelta, estado)
                window.location.assign(r.url)
              } catch (e) {
                setError(e instanceof Error ? e.message : 'No se pudo conectar. Probá de nuevo.')
                setEnviando(false)
              }
            }}
          >
            {enviando ? 'Conectando…' : 'Conectar'}
          </button>
          <button type="button" className="lv-boton" disabled={enviando} onClick={() => setCancelado(true)}>
            Cancelar
          </button>
        </div>
      </>
    )
  }

  return (
    <main className="lv-root">
      <section className="lv-tarjeta" aria-labelledby="lv-titulo">
        <p className="lv-meta">ATV Classroom · {user?.nombre || 'Equipo'}</p>
        <h1 id="lv-titulo" className="lv-titulo">Conectar ATV Leverage</h1>
        {cuerpo}
      </section>
    </main>
  )
}
