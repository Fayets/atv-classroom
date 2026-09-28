import { useRef, useState } from 'react'
import { solicitarSop } from '../../api/frentes'

const AREAS = [
  ['marketing', 'Marketing'],
  ['ventas', 'Ventas'],
  ['sistemas', 'Sistemas'],
  ['equipo', 'Equipo'],
  ['fulfillment', 'Fulfillment'],
  ['mentalidad', 'Mentalidad'],
]

// El área que sugiere el coach al que la guía derivó; el cliente la puede cambiar.
const AREA_DE_COACH = { 'juan-cruz': 'marketing', juampi: 'marketing', lucas: 'ventas', nick: 'ventas', franco: 'sistemas' }

function fecha(iso) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

// Cuando no hay material: el cliente pide el SOP y el pedido cae en Discord.
export default function SolicitudSop({ consulta, coach }) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [area, setArea] = useState(AREA_DE_COACH[coach?.clave] ?? '')
  const [problema, setProblema] = useState('')
  const [estado, setEstado] = useState('idle')
  const [enviada, setEnviada] = useState(null)
  const nombreRef = useRef(null)

  function abrir() {
    setAbierto(true)
    requestAnimationFrame(() => nombreRef.current?.focus({ preventScroll: true }))
  }

  const listo = nombre.trim().length >= 3 && area && problema.trim().length >= 3

  async function enviar(e) {
    e.preventDefault()
    if (!listo || estado === 'enviando') return
    setEstado('enviando')
    try {
      const r = await solicitarSop({ nombre: nombre.trim(), area, problema: problema.trim(), consulta })
      setEnviada(r)
      setEstado('enviada')
    } catch {
      setEstado('error')
    }
  }

  if (enviada) {
    return (
      <div className="im-sol im-sol--ok" role="status">
        <b>Solicitud enviada: {nombre.trim().toUpperCase()}</b>
        <span>
          Te lo entregamos entre el {fecha(enviada.entrega_desde)} y el {fecha(enviada.entrega_hasta)}. Si se resuelve más rápido, te
          mandamos un Loom.
        </span>
      </div>
    )
  }

  return (
    <div className="im-sol">
      <div className="im-sol__head">
        <div>
          <b>¿Lo necesitás documentado?</b>
          <span>Pedinos el SOP: si no lo tenemos, te lo entregamos en 5 a 7 días o lo resolvemos con un Loom.</span>
        </div>
        {abierto ? null : (
          <button type="button" className="pc-btn pc-btn--light" onClick={abrir}>
            Solicitar SOP
          </button>
        )}
      </div>

      <div className={`im-reveal im-sol__reveal${abierto ? ' is-open' : ''}`}>
        <div className="im-reveal__inner">
          <form className="im-sol__form" onSubmit={enviar} inert={!abierto}>
            <label className="im-sol__field">
              <span>Nombre del SOP</span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Proceso de onboarding de clientes nuevos"
                maxLength={160}
                ref={nombreRef}
              />
            </label>

            <fieldset className="im-sol__field">
              <legend>Área</legend>
              <div className="im-sol__areas">
                {AREAS.map(([clave, label]) => (
                  <label key={clave} className={area === clave ? 'is-on' : ''}>
                    <input type="radio" name="area" value={clave} checked={area === clave} onChange={() => setArea(clave)} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="im-sol__field">
              <span>Contanos brevemente tu problema</span>
              <textarea
                value={problema}
                onChange={(e) => setProblema(e.target.value)}
                placeholder="Qué está pasando, desde cuándo y qué probaste hasta ahora"
                rows={3}
                maxLength={1500}
              />
            </label>

            <div className="im-sol__actions">
              {estado === 'error' ? <p className="im-error">No se pudo enviar. Probá de nuevo.</p> : <span />}
              <button type="button" className="pc-btn pc-btn--ghost" onClick={() => setAbierto(false)} disabled={estado === 'enviando'}>
                Cancelar
              </button>
              <button type="submit" className="pc-btn pc-complete" disabled={!listo || estado === 'enviando'}>
                {estado === 'enviando' ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
