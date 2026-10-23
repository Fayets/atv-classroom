import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMenciones, resolverMencion } from '../../api/mensajes'
import { useMensajeria } from '../../context/MensajeriaContext'
import { duracion, haceCuanto, urgencia } from '../../utils/mensajes'
import Avatar from './Avatar'

// Lo que ve el coach: solo los mensajes donde lo etiquetaron, como alertas con la demora en responder.
export default function Alertas({ activo, onAbrir }) {
  const { suscribir, refrescarResumen, esMio } = useMensajeria()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [, setReloj] = useState(0)
  const recarga = useRef(null)

  const cargar = useCallback(() => {
    fetchMenciones()
      .then(setDatos)
      .catch((err) => setError(err.message || 'No se pudieron cargar las alertas.'))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Una etiqueta nueva o una respuesta propia cambian las alertas: se recargan agrupando ráfagas.
  // Los mensajes de los demás no (antes cada uno recargaba las alertas de todo el equipo).
  useEffect(
    () =>
      suscribir((ev) => {
        if (ev.tipo === 'mensaje' ? !esMio(ev.mensaje) : !['mencion', 'borrado', 'reconectado'].includes(ev.tipo)) return
        clearTimeout(recarga.current)
        recarga.current = setTimeout(cargar, 500)
      }),
    [suscribir, cargar, esMio],
  )

  // Las demoras corren aunque no llegue nada nuevo.
  useEffect(() => {
    const t = setInterval(() => setReloj((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  async function resolver(e, alerta) {
    e.stopPropagation()
    await resolverMencion(alerta.id).catch(() => null)
    cargar()
    refrescarResumen()
  }

  if (error) return <p className="msj-error">{error}</p>
  if (!datos) return <p className="msj-vacio">Cargando…</p>

  const pendientes = datos.alertas.filter((a) => a.estado === 'pendiente')
  const respondidas = datos.alertas.filter((a) => a.estado === 'respondida').slice(0, 15)

  return (
    <div className="msj-alertas">
      <div className="msj-kpis">
        <div className={`msj-kpi${datos.pendientes ? ' is-alerta' : ''}`}>
          <b>{datos.pendientes}</b>
          <span>{datos.pendientes === 1 ? 'Sin responder' : 'Sin responder'}</span>
        </div>
        <div className="msj-kpi">
          <b>{datos.promedio_minutos == null ? '—' : duracion(datos.promedio_minutos)}</b>
          <span>Tu tiempo de respuesta · 7 días</span>
        </div>
      </div>

      {!datos.alertas.length ? (
        <p className="msj-vacio msj-vacio--alertas">
          Cuando alguien te etiquete con @ en un canal, te aparece acá con el tiempo que lleva esperando.
        </p>
      ) : null}

      {pendientes.length ? <p className="msj-seccion">Te etiquetaron — {pendientes.length}</p> : null}
      {pendientes.map((a) => {
        // Los minutos del servidor se corrigen con el tiempo que pasó desde que se cargaron.
        const minutos = Math.max(a.minutos, Math.round((Date.now() - new Date(a.creado_en)) / 60000))
        return (
          <button
            key={a.id}
            type="button"
            className={`msj-alerta-item is-${urgencia(minutos)}${activo === a.canal_id ? ' is-on' : ''}`}
            onClick={() => onAbrir(a.canal_id)}
          >
            <Avatar persona={a.autor} size={34} />
            <span className="msj-alerta-item__txt">
              <span className="msj-alerta-item__fila">
                <b>{a.autor.nombre}</b>
                <span className="msj-alerta-item__en">en #{a.canal_nombre}</span>
              </span>
              <span className="msj-alerta-item__msg">{a.texto}</span>
              <span className="msj-alerta-item__pie">
                <span className="msj-demora">{minutos < 1 ? 'Recién llegada' : `Esperando ${duracion(minutos)}`}</span>
                <span role="button" tabIndex={0} className="msj-alerta-item__ok" onClick={(e) => resolver(e, a)} onKeyDown={(e) => e.key === 'Enter' && resolver(e, a)}>
                  Marcar resuelta
                </span>
              </span>
            </span>
          </button>
        )
      })}

      {respondidas.length ? <p className="msj-seccion">Respondidas</p> : null}
      {respondidas.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`msj-alerta-item is-respondida${activo === a.canal_id ? ' is-on' : ''}`}
          onClick={() => onAbrir(a.canal_id)}
        >
          <Avatar persona={a.autor} size={34} />
          <span className="msj-alerta-item__txt">
            <span className="msj-alerta-item__fila">
              <b>{a.autor.nombre}</b>
              <span className="msj-alerta-item__en">{haceCuanto(a.creado_en)}</span>
            </span>
            <span className="msj-alerta-item__msg">{a.texto}</span>
            <span className="msj-alerta-item__pie">
              <span className="msj-demora">Respondiste en {duracion(a.minutos)}</span>
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
