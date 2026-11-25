// La campanita de notificaciones, al lado del avión de papel de Mensajes: todo lo de la app que no son chats
// (roadmap, cierre de mes, acceso, notificaciones del celular). Las publica cada fuente en utils/alertasApp.js.
// El punto rojo marca lo nuevo; al abrir el panel lo nuevo queda resaltado esa vez y pasa a visto.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dispararAlerta, esNueva, marcarVistas, useAlertasApp } from '../../utils/alertasApp'

const ICONOS = {
  cierre: <><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M4 10h16M9 15l2 2 4-4" /></>,
  roadmap: <><path d="M5 19c3-1 3-6 7-7s4-6 7-7" /><circle cx="5" cy="19" r="1.6" /><circle cx="19" cy="5" r="1.6" /></>,
  paso: <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12.2 2.4 2.4 4.6-4.8" /></>,
  acceso: <><circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2.5 1.5M9.5 3h5" /></>,
  avisos: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /><path d="M3 3l18 18" /></>,
}

function haceCuanto(fecha) {
  if (!fecha) return ''
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000)
  if (min < 60) return min <= 1 ? 'Recién' : `Hace ${min} min`
  const horas = Math.round(min / 60)
  if (horas < 24) return `Hace ${horas} h`
  const dias = Math.round(horas / 24)
  if (dias === 1) return 'Ayer'
  if (dias < 7) return `Hace ${dias} días`
  return new Date(fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export default function CampanaAlertas() {
  const { alertas, nuevas } = useAlertasApp()
  const navigate = useNavigate()
  const [abierta, setAbierta] = useState(false)
  const [lugar, setLugar] = useState(null)
  const [resaltar, setResaltar] = useState(() => new Set()) // lo que era nuevo al abrir
  const caja = useRef(null)

  useEffect(() => {
    if (!abierta) return undefined
    const fuera = (e) => !caja.current?.contains(e.target) && setAbierta(false)
    const tecla = (e) => e.key === 'Escape' && setAbierta(false)
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierta])

  function alternar(e) {
    // El panel va fijo en la pantalla (la columna de chats recorta lo que sobresale): arranca debajo del botón y
    // se corre para no salirse por ningún costado.
    const r = e.currentTarget.getBoundingClientRect()
    const ancho = Math.min(340, window.innerWidth - 24)
    setLugar({ top: r.bottom + 8, left: Math.max(12, Math.min(r.left - 12, window.innerWidth - ancho - 12)), width: ancho })
    if (!abierta) {
      setResaltar(new Set(alertas.filter(esNueva).map((a) => a.id)))
      marcarVistas()
    }
    setAbierta(!abierta)
  }

  function ir(a) {
    setAbierta(false)
    if (a.ruta) navigate(a.ruta)
    else dispararAlerta(a)
  }

  const urgente = alertas.some((a) => a.urgente)
  const etiqueta = nuevas ? `Notificaciones: ${nuevas} ${nuevas === 1 ? 'nueva' : 'nuevas'}` : 'Notificaciones'

  return (
    <div className="msj-alertas-app" ref={caja}>
      <button
        type="button"
        className={`msj-lateral__directos${abierta ? ' is-on' : ''}`}
        onClick={alternar}
        aria-expanded={abierta}
        aria-haspopup="dialog"
        title={etiqueta}
        aria-label={etiqueta}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {nuevas ? <i className={`msj-lateral__punto${urgente ? ' is-urgente' : ''}`} aria-hidden="true" /> : null}
      </button>

      {abierta ? (
        <div className="msj-alertas-app__panel" role="dialog" aria-label="Notificaciones" style={lugar || undefined}>
          <header className="msj-alertas-app__cab">
            <p>Notificaciones</p>
            <small>Los chats y las menciones están en Mensajes</small>
          </header>
          {alertas.length ? (
            <ul>
              {alertas.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className={`msj-alertas-app__item${a.urgente ? ' is-urgente' : ''}${resaltar.has(a.id) ? ' is-nueva' : ''}`}
                    onClick={() => ir(a)}
                  >
                    <span className={`msj-alertas-app__icono is-${a.tipo}`} aria-hidden="true">
                      <svg viewBox="0 0 24 24">{ICONOS[a.tipo] || ICONOS.avisos}</svg>
                    </span>
                    <span className="msj-alertas-app__txt">
                      <b>{a.titulo}</b>
                      <small>{a.texto}</small>
                      <em>
                        {a.fecha ? <span>{haceCuanto(a.fecha)}</span> : null}
                        <span className="msj-alertas-app__accion">{a.accion} ›</span>
                      </em>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="msj-alertas-app__vacio">Todo al día. Acá te avisamos de tu roadmap, tu cierre de mes y tu acceso.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
