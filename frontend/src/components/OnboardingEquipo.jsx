import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ACCION } from '../api/cierre'
import { fetchOnboardingPendiente, responderOnboarding } from '../api/onboardingEquipo'
import { BLOQUES_ONBOARDING } from '../constants/onboardingPreguntas'
import '../styles/cierre.css'

// El onboarding de alguien del equipo del cliente (un socio que maneja otro creador): el coach se lo pide y
// le aparece el cartel como en el cierre de mes, al entrar y cada 3 acciones, hasta que lo completa.
const CADA = 3
const AVISO_CERRADO = 'atv-onboarding-equipo-aviso-cerrado'
const borrador = (id) => `atv-onboarding-equipo-${id}`

function Opciones({ pregunta, valor, poner, varias }) {
  const elegidas = varias ? (valor ? valor.split(', ').filter(Boolean) : []) : [valor].filter(Boolean)
  const tocar = (o) => {
    if (!varias) return poner(o)
    poner((elegidas.includes(o) ? elegidas.filter((x) => x !== o) : [...elegidas, o]).join(', '))
  }
  return (
    <div className="cm-chips">
      {pregunta.options.map((o) => (
        <button key={o.key} type="button" className={elegidas.includes(o.label) ? 'is-on' : ''} onClick={() => tocar(o.label)} aria-pressed={elegidas.includes(o.label)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Formulario({ clave, alCerrar, alTerminar }) {
  const [v, setV] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(borrador(clave)) || '{}')
    } catch {
      return {}
    }
  })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState(false)
  const poner = (id, x) => setV((s) => ({ ...s, [id]: x }))
  useEffect(() => {
    try {
      localStorage.setItem(borrador(clave), JSON.stringify(v))
    } catch {
      /* sin almacenamiento: no se guarda el borrador */
    }
  }, [clave, v])
  const respondidas = Object.values(v).filter((x) => String(x || '').trim()).length
  const total = BLOQUES_ONBOARDING.reduce((n, b) => n + b.questions.length, 0)

  async function enviar(e) {
    e.preventDefault()
    if (!respondidas) return setError('Respondé al menos una pregunta.')
    setError('')
    setEnviando(true)
    try {
      await responderOnboarding(v)
      try {
        localStorage.removeItem(borrador(clave))
      } catch {
        /* nada */
      }
      setHecho(true)
    } catch (err) {
      setError(err.message || 'No se pudo enviar. Probá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  if (hecho) {
    return (
      <div className="cm-hoja cm-hoja--fin">
        <h2>¡Listo, gracias!</h2>
        <p className="cm-ayuda">Tu coach ya tiene tu onboarding para preparar tu plan.</p>
        <button type="button" className="cm-boton" onClick={alTerminar}>Volver al classroom</button>
      </div>
    )
  }

  return (
    <form className="cm-hoja" onSubmit={enviar}>
      <div className="cm-cabeza">
        <div>
          <small>Onboarding · {respondidas} de {total}</small>
          <h2>Contanos de tu negocio</h2>
        </div>
        <button type="button" className="cm-x" onClick={alCerrar} aria-label="Cerrar">×</button>
      </div>
      <p className="cm-ayuda cm-seccion">Respondé sobre el creador o el negocio que manejás vos. Lo que escribas se guarda en este navegador hasta que lo envíes.</p>
      {BLOQUES_ONBOARDING.map((b) => (
        <section key={b.title} className="cm-seccion">
          <h3>{b.title}</h3>
          {b.questions.map((q) => (
            <div key={q.id} className="cm-texto">
              <span>{q.id}. {q.label}</span>
              {q.type === 'radio' || q.type === 'checkbox' ? (
                <Opciones pregunta={q} valor={v[q.id] || ''} poner={(x) => poner(q.id, x)} varias={q.type === 'checkbox'} />
              ) : q.type === 'number' ? (
                <div className="cm-nota">
                  {Array.from({ length: (q.max || 10) - (q.min || 1) + 1 }, (_, i) => String((q.min || 1) + i)).map((n) => (
                    <button key={n} type="button" className={v[q.id] === n ? 'is-on' : ''} onClick={() => poner(q.id, n)}>{n}</button>
                  ))}
                </div>
              ) : (
                <textarea rows={q.rows || 3} value={v[q.id] || ''} onChange={(e) => poner(q.id, e.target.value)} placeholder={q.placeholder || ''} />
              )}
            </div>
          ))}
        </section>
      ))}
      <div className="cm-pie">
        {error ? <p className="cm-error">{error}</p> : null}
        <button type="submit" className="cm-boton" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar onboarding'}</button>
      </div>
    </form>
  )
}

export function OnboardingEquipoSync() {
  const { isAuthenticated, isEquipo, user } = useAuth()
  const miembro = isAuthenticated && !isEquipo && Boolean(user?.miembro)
  const { pathname } = useLocation()
  const [pendiente, setPendiente] = useState(null)
  const [cartel, setCartel] = useState(false)
  const [formulario, setFormulario] = useState(false)
  const [aviso, setAviso] = useState(true)
  const acciones = useRef(0)

  const refrescar = useCallback(async () => {
    try {
      const r = await fetchOnboardingPendiente()
      setPendiente(r.pendiente)
      return r.pendiente
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    if (!miembro) return undefined
    try {
      setAviso(sessionStorage.getItem(AVISO_CERRADO) !== '1')
    } catch {
      /* sin almacenamiento: se muestra */
    }
    refrescar().then((p) => p && setCartel(true))
    const cada = setInterval(refrescar, 10 * 60 * 1000)
    return () => clearInterval(cada)
  }, [miembro, refrescar])

  const sumar = useCallback(() => {
    if (!pendiente || formulario) return
    acciones.current += 1
    if (acciones.current >= CADA) {
      acciones.current = 0
      setCartel(true)
    }
  }, [pendiente, formulario])
  useEffect(() => {
    window.addEventListener(ACCION, sumar)
    return () => window.removeEventListener(ACCION, sumar)
  }, [sumar])
  const primera = useRef(true)
  useEffect(() => {
    if (primera.current) {
      primera.current = false
      return
    }
    sumar()
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!miembro || !pendiente) return null
  const completar = () => {
    setCartel(false)
    setFormulario(true)
  }
  const cerrarAviso = () => {
    setAviso(false)
    try {
      sessionStorage.setItem(AVISO_CERRADO, '1')
    } catch {
      /* nada */
    }
  }

  return createPortal(
    <>
      {aviso && !cartel && !formulario ? (
        <div className="cm-aviso" role="status">
          <span><b>Tu onboarding</b> · tu coach te pidió que lo completes con los datos de tu negocio.</span>
          <button type="button" className="cm-aviso__si" onClick={completar}>Completar</button>
          <button type="button" className="cm-aviso__x" onClick={cerrarAviso} aria-label="Cerrar aviso">×</button>
        </div>
      ) : null}
      {cartel && !formulario ? (
        <div className="pausa-fondo" onClick={(e) => e.target === e.currentTarget && setCartel(false)}>
          <div className="pausa-tarjeta cm-cartel" role="dialog" aria-modal="true" aria-labelledby="oe-cartel-titulo">
            <span className="cm-cartel__icono" aria-hidden="true">!</span>
            <h2 id="oe-cartel-titulo">Te falta tu onboarding</h2>
            <p>Tu coach necesita conocer tu negocio para armar tu plan. Respondé sobre el creador o el negocio que manejás vos.</p>
            <div className="pausa-acciones">
              <button type="button" className="pausa-boton cm-cartel__si" onClick={completar}>Completarlo ahora</button>
            </div>
            <button type="button" className="pausa-cerrar" onClick={() => setCartel(false)}>Más tarde</button>
          </div>
        </div>
      ) : null}
      {formulario ? (
        <div className="cm-fondo">
          <Formulario
            clave={user?.miembro?.id ?? user?.email ?? 'yo'}
            alCerrar={() => setFormulario(false)}
            alTerminar={() => {
              setFormulario(false)
              setPendiente(null)
              refrescar()
            }}
          />
        </div>
      ) : null}
    </>,
    document.body,
  )
}
