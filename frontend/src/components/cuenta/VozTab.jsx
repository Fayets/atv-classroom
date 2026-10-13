import { useEffect, useRef, useState } from 'react'
import { elegirVoz, fetchVoz } from '../../api/cuenta'
import { useAuth } from '../../context/AuthContext'
import { getUserInitials } from '../../utils/user'

function Cara({ p, size = 26 }) {
  return p?.foto_url ? (
    <img className="voz-cara" src={p.foto_url} alt="" width={size} height={size} referrerPolicy="no-referrer" />
  ) : (
    <span className="voz-cara voz-cara--ini" style={{ width: size, height: size }}>{getUserInitials(p?.nombre || '?')}</span>
  )
}

// Selector "con la voz de quién te sugiere el Tab": foto, nombre y flechita, como un selector de cuenta.
export default function VozTab() {
  const { user } = useAuth()
  const [datos, setDatos] = useState(null)
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState('')
  const caja = useRef(null)

  useEffect(() => {
    fetchVoz()
      .then(setDatos)
      .catch((e) => setError(e.message || 'No se pudo cargar.'))
  }, [])

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

  async function elegir(id) {
    setAbierto(false)
    setError('')
    const antes = datos
    setDatos({ ...datos, elegida: id })
    try {
      setDatos(await elegirVoz(id))
    } catch (e) {
      setDatos(antes)
      setError(e.message || 'No se pudo cambiar.')
    }
  }

  if (!datos) return <p className="cuenta__cargando">{error || 'Cargando…'}</p>
  const elegida = datos.opciones.find((o) => o.id === datos.elegida)
  const propia = datos.opciones.find((o) => o.id === datos.propia)

  return (
    <div className="voz-tab">
      <p className="cuenta-equipo__ayuda">El Tab te sugiere las respuestas a los clientes con el tono de esta persona: sus palabras, mayúsculas y largo de mensaje.</p>
      <div className="voz-tab__caja" ref={caja}>
        <button type="button" className="voz-tab__boton" onClick={() => setAbierto((a) => !a)} aria-haspopup="listbox" aria-expanded={abierto}>
          <Cara p={elegida || propia || { nombre: user?.nombre }} />
          <span>{elegida ? elegida.nombre : 'Mi voz'}{datos.elegida === datos.propia ? ' (vos)' : ''}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {abierto ? (
          <ul className="voz-tab__menu" role="listbox" aria-label="Voz del Tab">
            {!propia ? (
              <li role="option" aria-selected={datos.elegida === datos.propia}>
                <button type="button" onClick={() => elegir(null)}>
                  <span className="voz-cara voz-cara--ini">Yo</span>
                  <span className="voz-tab__quien"><b>Mi voz</b><small>Todavía aprendiendo cómo escribís</small></span>
                </button>
              </li>
            ) : null}
            {datos.opciones.map((o) => (
              <li key={o.id} role="option" aria-selected={o.id === datos.elegida}>
                <button type="button" onClick={() => elegir(o.propia ? null : o.id)} className={o.id === datos.elegida ? 'is-on' : ''}>
                  <Cara p={o} />
                  <span className="voz-tab__quien">
                    <b>{o.nombre}{o.propia ? ' (vos)' : ''}</b>
                    <small>{o.mensajes.toLocaleString('es-AR')} mensajes aprendidos</small>
                  </span>
                  {o.id === datos.elegida ? <i aria-hidden="true">✓</i> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {error ? <p className="cuenta-equipo__error" role="alert">{error}</p> : null}
    </div>
  )
}
