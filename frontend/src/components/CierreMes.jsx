import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ACCION, fetchCierrePendiente, responderCierre, tasasDe } from '../api/cierre'
import '../styles/cierre.css'

const CADA = 3 // con el cierre vencido, el cartel vuelve cada 3 acciones
const AVISO_CERRADO = 'atv-cierre-aviso-cerrado'
const CONTENIDO = [
  ['reels', 'Reels publicados'],
  ['historias', 'Secuencias de historias'],
  ['youtube', 'Videos de YouTube'],
  ['cta_historias', 'CTAs en historias'],
  ['cta_reels', 'CTAs en reels'],
]
const EMBUDO = [
  ['conversaciones', 'Conversaciones generadas'],
  ['agendas', 'Agendas'],
  ['llamadas', 'Llamadas tomadas'],
  ['ventas', 'Ventas cerradas'],
]
const PLATA = [
  ['cash', 'Cash collected (USD)'],
  ['facturacion', 'Facturación (USD)'],
]
const LOOM_CONVERSACIONES = 'https://www.loom.com/share/ae2a90ec3ff740c3af81ca09fc7129fe'
const VACIO = Object.fromEntries([...CONTENIDO, ...EMBUDO, ...PLATA].map(([k]) => [k, '']))

const dia = (iso) => new Date(iso).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

function Numero({ campo, nombre, valores, poner }) {
  return (
    <label className="cm-num">
      <span>{nombre}</span>
      <input type="number" inputMode="decimal" min="0" step="any" value={valores[campo]} onChange={(e) => poner(campo, e.target.value)} placeholder="0" required />
    </label>
  )
}

function Formulario({ pendiente, alCerrar, alTerminar }) {
  const anterior = pendiente.anterior
  const [v, setV] = useState({ ...VACIO, cambios: [], oferta: anterior?.oferta || '', avatar: anterior?.avatar || '', cuello: '', cuello_por_que: '', satisfaccion: 0, satisfaccion_por_que: '' })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState(null)
  const poner = (k, x) => setV((s) => ({ ...s, [k]: x }))
  const cambia = (k) => !anterior || v.cambios.includes(k)
  const alternar = (k) => setV((s) => ({ ...s, cambios: s.cambios.includes(k) ? s.cambios.filter((c) => c !== k) : [...s.cambios, k] }))
  const t = tasasDe(v)

  async function enviar(e) {
    e.preventDefault()
    if (!v.cuello) return setError('Elegí tu principal cuello de botella.')
    if (!v.satisfaccion) return setError('Calificá el servicio del 1 al 10.')
    setError('')
    setEnviando(true)
    try {
      const r = await responderCierre(pendiente.periodo, v)
      setHecho(r.tasas)
    } catch (err) {
      setError(err.message || 'No se pudo enviar. Probá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  if (hecho) {
    return (
      <div className="cm-hoja cm-hoja--fin">
        <div className="cm-fin">
          <span className="cm-fin__ok" aria-hidden="true">✓</span>
          <h2>¡Listo! Cerraste {pendiente.mes}</h2>
          <p>Gracias. Con esto tu coach prepara lo que sigue.</p>
          <button type="button" className="cm-boton" onClick={alTerminar}>Volver al classroom</button>
        </div>
      </div>
    )
  }

  return (
    <form className="cm-hoja" onSubmit={enviar}>
      <header className="cm-cabeza">
        <div>
          <small>Cierre de mes</small>
          <h2>¿Cómo te fue en {pendiente.mes}?</h2>
        </div>
        <button type="button" className="cm-x" onClick={alCerrar} aria-label="Cerrar">×</button>
      </header>

      <section className="cm-seccion">
        <h3>Tu negocio</h3>
        {anterior ? (
          <>
            <p className="cm-ayuda">¿Cambió algo este mes? Si sigue igual, no hace falta escribir nada.</p>
            <div className="cm-chips">
              <button type="button" className={v.cambios.includes('oferta') ? 'is-on' : ''} onClick={() => alternar('oferta')}>Cambió mi oferta</button>
              <button type="button" className={v.cambios.includes('avatar') ? 'is-on' : ''} onClick={() => alternar('avatar')}>Cambió mi avatar</button>
              <button type="button" className={!v.cambios.length ? 'is-on' : ''} onClick={() => poner('cambios', [])}>Nada, sigue igual</button>
            </div>
          </>
        ) : (
          <p className="cm-ayuda">Es tu primer cierre: contanos tu oferta y tu avatar. Los próximos meses solo si cambian.</p>
        )}
        {[['oferta', 'Tu oferta', 'Ayudo a dueños de negocio estancados en $10k/mes a llegar a $100k/mes en 6 meses con 1 a 1, acompañamiento y clases grabadas'], ['avatar', 'Tu avatar', '¿A quién le vendiste este mes?']].map(([k, nombre, ej]) =>
          cambia(k) ? (
            <label key={k} className="cm-texto">
              <span>{nombre}</span>
              <textarea value={v[k]} onChange={(e) => poner(k, e.target.value)} placeholder={ej} rows={3} required />
            </label>
          ) : (
            <p key={k} className="cm-previo"><b>{nombre}:</b> {anterior[k] || '—'}</p>
          ),
        )}
      </section>

      <section className="cm-seccion">
        <h3>Contenido</h3>
        <div className="cm-grilla">{CONTENIDO.map(([k, n]) => <Numero key={k} campo={k} nombre={n} valores={v} poner={poner} />)}</div>
      </section>

      <section className="cm-seccion">
        <h3>Ventas</h3>
        <p className="cm-ayuda">
          Las tasas se calculan solas. ¿No sabés cómo contar las conversaciones? <a href={LOOM_CONVERSACIONES} target="_blank" rel="noopener noreferrer">Mirá este Loom</a>.
        </p>
        <div className="cm-grilla">{EMBUDO.map(([k, n]) => <Numero key={k} campo={k} nombre={n} valores={v} poner={poner} />)}</div>
        <div className="cm-tasas">
          {[['Agendamiento', t.agendamiento], ['Asistencia', t.asistencia], ['Cierre', t.cierre]].map(([n, x]) => (
            <span key={n}><small>{n}</small><b>{x === null ? '—' : `${x}%`}</b></span>
          ))}
        </div>
        <div className="cm-grilla">{PLATA.map(([k, n]) => <Numero key={k} campo={k} nombre={n} valores={v} poner={poner} />)}</div>
      </section>

      <section className="cm-seccion">
        <h3>¿Dónde está tu principal cuello de botella hoy?</h3>
        <div className="cm-chips">
          {pendiente.cuellos.map((c) => (
            <button key={c} type="button" className={v.cuello === c ? 'is-on' : ''} onClick={() => poner('cuello', c)}>{c}</button>
          ))}
        </div>
        <label className="cm-texto">
          <span>¿Por qué y cómo te podemos ayudar?</span>
          <textarea value={v.cuello_por_que} onChange={(e) => poner('cuello_por_que', e.target.value)} rows={3} required />
        </label>
      </section>

      <section className="cm-seccion">
        <h3>Del 1 al 10, ¿qué tan conforme estás con ATV este mes?</h3>
        <div className="cm-nota" role="radiogroup" aria-label="Calificación del 1 al 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={v.satisfaccion === n} className={v.satisfaccion === n ? 'is-on' : ''} onClick={() => poner('satisfaccion', n)}>{n}</button>
          ))}
        </div>
        <label className="cm-texto">
          <span>¿Por qué esa nota?</span>
          <textarea value={v.satisfaccion_por_que} onChange={(e) => poner('satisfaccion_por_que', e.target.value)} rows={3} required />
        </label>
      </section>

      <footer className="cm-pie">
        {error ? <p className="cm-error" role="alert">{error}</p> : null}
        <button type="submit" className="cm-boton" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar cierre'}</button>
      </footer>
    </form>
  )
}

// Para clientes: el aviso durante los 3 días, el cartel que insiste después y el formulario.
export function CierreSync() {
  const { isAuthenticated, isEquipo } = useAuth()
  const cliente = isAuthenticated && !isEquipo
  const { pathname } = useLocation()
  const [pendiente, setPendiente] = useState(null)
  const [cartel, setCartel] = useState(false)
  const [formulario, setFormulario] = useState(false)
  const [aviso, setAviso] = useState(true)
  const acciones = useRef(0)

  const refrescar = useCallback(async () => {
    try {
      const r = await fetchCierrePendiente()
      setPendiente(r.pendiente)
      return r.pendiente
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    if (!cliente) return undefined
    try {
      setAviso(sessionStorage.getItem(AVISO_CERRADO) !== '1')
    } catch {
      /* sin almacenamiento: se muestra */
    }
    refrescar().then((p) => p?.vencido && setCartel(true))
    const cada = setInterval(refrescar, 10 * 60 * 1000)
    return () => clearInterval(cada)
  }, [cliente, refrescar])

  // Vencido: cada CADA acciones (mandar un mensaje, cambiar de pantalla) vuelve el cartel.
  const sumar = useCallback(() => {
    if (!pendiente?.vencido || formulario) return
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

  if (!cliente || !pendiente) return null

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
      {!pendiente.vencido && aviso && !formulario ? (
        <div className="cm-aviso" role="status">
          <span><b>Cierre de {pendiente.mes}</b> · tenés hasta el {dia(pendiente.vence_en)}. Son 3 minutos.</span>
          <button type="button" className="cm-aviso__si" onClick={completar}>Completar</button>
          <button type="button" className="cm-aviso__x" onClick={cerrarAviso} aria-label="Cerrar aviso">×</button>
        </div>
      ) : null}
      {cartel && !formulario ? (
        <div className="pausa-fondo" onClick={(e) => e.target === e.currentTarget && setCartel(false)}>
          <div className="pausa-tarjeta cm-cartel" role="dialog" aria-modal="true" aria-labelledby="cm-cartel-titulo">
            <span className="cm-cartel__icono" aria-hidden="true">!</span>
            <h2 id="cm-cartel-titulo">Te falta el cierre de {pendiente.mes}</h2>
            <p>Se venció el {dia(pendiente.vence_en)}. Sin tu cierre tu coach no puede preparar lo que sigue. Son 3 minutos.</p>
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
            pendiente={pendiente}
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
