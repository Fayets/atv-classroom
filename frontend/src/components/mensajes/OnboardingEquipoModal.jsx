import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cancelarOnboarding, pedirOnboarding } from '../../api/onboardingEquipo'
import { BLOQUES_ONBOARDING } from '../../constants/onboardingPreguntas'

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '')

function Respuestas({ m, alVolver }) {
  return (
    <>
      <h2 id="oem-titulo">Onboarding de {m.nombre}</h2>
      <p className="msj-modal__ayuda">Completado el {fecha(m.completado_en)} · {m.email}</p>
      <div className="oem-respuestas">
        {BLOQUES_ONBOARDING.map((b) => {
          const qs = b.questions.filter((q) => (m.respuestas?.[q.id] || '').trim())
          if (!qs.length) return null
          return (
            <section key={b.title}>
              <h3>{b.title}</h3>
              {qs.map((q) => (
                <div key={q.id} className="oem-par">
                  <b>{q.id}. {q.label}</b>
                  <p>{m.respuestas[q.id]}</p>
                </div>
              ))}
            </section>
          )
        })}
      </div>
      <div className="msj-modal__botones">
        <button type="button" onClick={alVolver}>Volver</button>
      </div>
    </>
  )
}

// Acción rápida del chat del cliente: a quién de su equipo pedirle su propio onboarding (un socio que maneja
// otro creador). Al pedido le sale el cartel como en el cierre de mes; acá se ve quién lo completó.
export default function OnboardingEquipoModal({ miembros, alCambiar, alCerrar }) {
  const [viendo, setViendo] = useState(null)
  const [ocupado, setOcupado] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && alCerrar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [alCerrar])

  async function hacer(m, accion) {
    setOcupado(m.id)
    setError('')
    try {
      alCambiar((await accion(m.id)).miembros)
    } catch (e) {
      setError(e.message || 'No se pudo.')
    } finally {
      setOcupado(null)
    }
  }

  const m = miembros.find((x) => x.id === viendo)
  return createPortal(
    <div className="msj-modal__fondo" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className={`msj-modal oem${m ? ' is-respuestas' : ''}`} role="dialog" aria-modal="true" aria-labelledby="oem-titulo">
        {m ? (
          <Respuestas m={m} alVolver={() => setViendo(null)} />
        ) : (
          <>
            <h2 id="oem-titulo">Onboarding del equipo</h2>
            <p className="msj-modal__ayuda">Si alguien del equipo maneja otro creador o negocio, pedile su propio onboarding: le aparece el cartel hasta que lo complete.</p>
            {error ? <p className="msj-modal__error" role="alert">{error}</p> : null}
            <ul className="oem-lista">
              {miembros.map((x) => (
                <li key={x.id}>
                  <span>
                    <b>{x.nombre}</b>
                    <small>{x.rol} · {x.email}</small>
                  </span>
                  {x.estado === 'completado' ? (
                    <button type="button" className="oem-ver" onClick={() => setViendo(x.id)}>Ver respuestas</button>
                  ) : x.estado === 'pedido' ? (
                    <span className="oem-pedido">
                      Pedido el {fecha(x.pedido_en)}
                      <button type="button" onClick={() => hacer(x, cancelarOnboarding)} disabled={ocupado === x.id}>Cancelar</button>
                    </span>
                  ) : (
                    <button type="button" className="oem-pedir" onClick={() => hacer(x, pedirOnboarding)} disabled={ocupado === x.id}>
                      {ocupado === x.id ? 'Pidiendo…' : 'Pedir onboarding'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="msj-modal__botones">
              <button type="button" onClick={alCerrar}>Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
