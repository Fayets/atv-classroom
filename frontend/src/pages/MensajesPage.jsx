import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchCanales } from '../api/mensajes'
import AppHeader from '../components/AppHeader'
import Avatar from '../components/mensajes/Avatar'
import Conversacion from '../components/mensajes/Conversacion'
import { useAuth } from '../context/AuthContext'
import { useMensajeria } from '../context/MensajeriaContext'
import { cuandoCorto, haceCuanto } from '../utils/mensajes'
import '../styles/mensajes.css'

function ItemCanal({ c, activo, onAbrir, isEquipo, escribe }) {
  const privado = c.tipo === 'cliente'
  const titulo = privado && isEquipo ? c.cliente?.nombre || c.nombre : privado ? 'Mi canal' : c.nombre
  return (
    <button type="button" className={`msj-item${activo ? ' is-on' : ''}${c.no_leidos ? ' is-nuevo' : ''}`} onClick={() => onAbrir(c.id)}>
      {privado && isEquipo ? (
        <Avatar persona={{ tipo: 'cliente', nombre: titulo }} size={34} />
      ) : (
        <span className="msj-item__hash" aria-hidden="true">
          #
        </span>
      )}
      <span className="msj-item__txt">
        <span className="msj-item__fila">
          <b>{titulo}</b>
          <time>{c.ultimo ? cuandoCorto(c.ultimo.creado_en) : ''}</time>
        </span>
        <span className="msj-item__sub">
          {escribe ? (
            <em className="is-escribiendo">{isEquipo ? `${escribe.split(' ')[0]} está escribiendo…` : 'escribiendo…'}</em>
          ) : isEquipo && c.esperando_desde ? (
            <em>Espera respuesta · {haceCuanto(c.esperando_desde)}</em>
          ) : c.ultimo ? (
            `${c.ultimo.autor_nombre.split(' ')[0]}: ${c.ultimo.texto}`
          ) : (
            'Sin mensajes todavía'
          )}
        </span>
      </span>
      {c.no_leidos ? <span className="msj-cuenta">{c.no_leidos > 99 ? '99+' : c.no_leidos}</span> : null}
    </button>
  )
}

function PanelCliente({ item }) {
  const cliente = item?.cliente
  if (!cliente) return null
  const vence = cliente.vence ? new Date(`${cliente.vence}T00:00:00`).toLocaleDateString('es-AR') : 'Sin fecha'
  return (
    <aside className="msj-panel" aria-label="Datos del cliente">
      <p className="msj-seccion">Cliente</p>
      <div className="msj-panel__quien">
        <Avatar persona={{ tipo: 'cliente', nombre: cliente.nombre }} size={44} />
        <b>{cliente.nombre}</b>
      </div>
      <dl className="msj-panel__datos">
        <div>
          <dt>Plan</dt>
          <dd>{cliente.plan || '—'}</dd>
        </div>
        <div>
          <dt>Acceso hasta</dt>
          <dd>{vence}</dd>
        </div>
        <div>
          <dt>Responsable</dt>
          <dd>{cliente.responsable || '—'}</dd>
        </div>
        {item.esperando_desde ? (
          <div>
            <dt>Espera respuesta</dt>
            <dd className="is-alerta">{haceCuanto(item.esperando_desde)}</dd>
          </div>
        ) : null}
      </dl>
    </aside>
  )
}

export default function MensajesPage() {
  const { isEquipo } = useAuth()
  const { suscribir, conectado } = useMensajeria()
  const [params, setParams] = useSearchParams()
  const [canales, setCanales] = useState(null)
  const [error, setError] = useState('')
  const [buscar, setBuscar] = useState('')
  const recarga = useRef(null)
  const { user } = useAuth()
  const [escriben, setEscriben] = useState({})
  const activo = Number(params.get('c')) || null

  const cargar = useCallback(() => {
    fetchCanales()
      .then(setCanales)
      .catch((err) => setError(err.message || 'No se pudieron cargar los canales.'))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  // La lista se reordena con cada novedad, agrupando ráfagas en una sola recarga.
  useEffect(
    () =>
      suscribir((ev) => {
        if (!['mensaje', 'leido', 'borrado', 'reconectado'].includes(ev.tipo)) return
        clearTimeout(recarga.current)
        recarga.current = setTimeout(cargar, 600)
      }),
    [suscribir, cargar],
  )

  // "escribiendo…" en la lista de chats, como en WhatsApp: se apaga a los 5 s o cuando llega el mensaje.
  useEffect(
    () =>
      suscribir((ev) => {
        if (ev.tipo === 'escribiendo' && ev.nombre !== user?.nombre) {
          setEscriben((e) => {
            const copia = { ...e }
            if (ev.activo === false) delete copia[ev.canal_id]
            else copia[ev.canal_id] = { nombre: ev.nombre, cuando: Date.now() }
            return copia
          })
        } else if (ev.tipo === 'mensaje') {
          setEscriben((e) => {
            if (!e[ev.mensaje.canal_id]) return e
            const copia = { ...e }
            delete copia[ev.mensaje.canal_id]
            return copia
          })
        }
      }),
    [suscribir, user],
  )

  useEffect(() => {
    if (!Object.keys(escriben).length) return undefined
    const t = setInterval(() => {
      setEscriben((e) => {
        const vigentes = Object.fromEntries(Object.entries(e).filter(([, v]) => Date.now() - v.cuando < 5000))
        return Object.keys(vigentes).length === Object.keys(e).length ? e : vigentes
      })
    }, 1000)
    return () => clearInterval(t)
  }, [escriben])

  // Sin conexión en vivo, la bandeja se refresca sola cada 30 segundos.
  useEffect(() => {
    if (conectado) return undefined
    const t = setInterval(cargar, 30000)
    return () => clearInterval(t)
  }, [conectado, cargar])

  // El cliente entra directo a su canal; en escritorio el equipo abre el primero de la bandeja.
  useEffect(() => {
    if (activo || !canales?.length) return
    if (!isEquipo) {
      const propio = canales.find((c) => c.tipo === 'cliente')
      if (propio) setParams({ c: String(propio.id) }, { replace: true })
    } else if (window.matchMedia('(min-width: 900px)').matches) {
      const primero = canales.find((c) => c.tipo === 'cliente') || canales[0]
      setParams({ c: String(primero.id) }, { replace: true })
    }
  }, [activo, canales, isEquipo, setParams])

  const filtrados = useMemo(() => {
    if (!canales) return []
    const q = buscar.trim().toLowerCase()
    if (!q) return canales
    return canales.filter((c) => `${c.nombre} ${c.cliente?.nombre || ''}`.toLowerCase().includes(q))
  }, [canales, buscar])

  const anuncios = filtrados.filter((c) => c.tipo === 'anuncios')
  const esperando = filtrados.filter((c) => c.tipo === 'cliente' && c.esperando_desde && isEquipo)
  const resto = filtrados.filter((c) => c.tipo === 'cliente' && !(c.esperando_desde && isEquipo))
  const item = canales?.find((c) => c.id === activo)
  const abrir = (id) => setParams({ c: String(id) })

  return (
    <div className="app-shell msj-root">
      <AppHeader />
      <div className={`msj-layout${activo ? ' ver-conv' : ' ver-lista'}${isEquipo ? ' con-panel' : ''}`}>
        <aside className="msj-lateral" aria-label="Canales">
          <div className="msj-lateral__head">
            <h1>Mensajes</h1>
            <span className={`msj-estado${conectado ? ' is-on' : ''}`} title={conectado ? 'En vivo' : 'Reconectando…'}>
              {conectado ? 'En vivo' : 'Reconectando…'}
            </span>
          </div>
          {isEquipo ? (
            <input
              className="msj-buscar"
              type="search"
              placeholder="Buscar cliente"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              aria-label="Buscar cliente"
            />
          ) : null}
          {error ? <p className="msj-error">{error}</p> : null}
          {!canales ? <p className="msj-vacio">Cargando…</p> : null}

          {isEquipo && esperando.length ? <p className="msj-seccion">Esperan respuesta — {esperando.length}</p> : null}
          {esperando.map((c) => (
            <ItemCanal key={c.id} c={c} activo={c.id === activo} onAbrir={abrir} isEquipo={isEquipo} escribe={escriben[c.id]?.nombre} />
          ))}

          {resto.length ? <p className="msj-seccion">{isEquipo ? `Clientes — ${resto.length}` : 'Tu canal'}</p> : null}
          {resto.map((c) => (
            <ItemCanal key={c.id} c={c} activo={c.id === activo} onAbrir={abrir} isEquipo={isEquipo} escribe={escriben[c.id]?.nombre} />
          ))}

          {anuncios.length ? <p className="msj-seccion">Comunidad ATV</p> : null}
          {anuncios.map((c) => (
            <ItemCanal key={c.id} c={c} activo={c.id === activo} onAbrir={abrir} isEquipo={isEquipo} escribe={escriben[c.id]?.nombre} />
          ))}
        </aside>

        <main className="msj-centro">
          {activo ? (
            <Conversacion key={activo} canalId={activo} item={item} onVolver={() => setParams({})} />
          ) : (
            <div className="msj-vacio">Elegí un canal para ver la conversación.</div>
          )}
        </main>

        {isEquipo && item?.cliente ? <PanelCliente item={item} /> : null}
      </div>
    </div>
  )
}
