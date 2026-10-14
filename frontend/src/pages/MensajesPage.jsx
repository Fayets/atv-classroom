import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { fetchSenas } from '../api/altas'
import { fetchCanales, marcarInactivo } from '../api/mensajes'
import NuevoCanal from '../components/mensajes/NuevoCanal'
import AppHeader from '../components/AppHeader'
import Alertas from '../components/mensajes/Alertas'
import AccionesRapidas from '../components/mensajes/AccionesRapidas'
import Avatar from '../components/mensajes/Avatar'
import RoadmapCliente from '../components/mensajes/RoadmapCliente'
import Conversacion from '../components/mensajes/Conversacion'
import { useEscritorio } from '../context/EscritorioContext'
import NuevoCliente from '../components/mensajes/NuevoCliente'
import { useAuth } from '../context/AuthContext'
import { useMensajeria } from '../context/MensajeriaContext'
import { cuandoCorto, haceCuanto } from '../utils/mensajes'
import '../styles/mensajes.css'

// Como las categorías de Discord: un grupo por plan, en este orden.
const GRUPOS = [
  { id: 'high', nombre: 'High Level', planes: ['high', 'advantage'] },
  { id: 'boost', nombre: 'Boost', planes: ['boost'] },
  { id: 'mid', nombre: 'Mid level', planes: ['mid'] },
  { id: 'entry', nombre: 'Entry level', planes: ['entry'] },
  { id: 'mentoria', nombre: 'Mentoria', planes: ['mentoria'] },
]
function agrupar(lista) {
  const grupos = GRUPOS.map((g) => ({ ...g, canales: [] }))
  const sinPlan = { id: 'otros', nombre: 'Sin plan', canales: [] }
  // Los que el equipo arrastró a Inactivos van ahí, sea cual sea su plan. El grupo está siempre
  // (aunque vacío) para poder soltar chats encima.
  const inactivos = { id: 'inactivos', nombre: 'Inactivos', canales: [], fijo: true }
  for (const c of lista) {
    const plan = (c.cliente?.plan || '').toLowerCase()
    if (c.inactivo) inactivos.canales.push(c)
    else (grupos.find((g) => g.planes.includes(plan)) || sinPlan).canales.push(c)
  }
  return [...grupos, sinPlan].filter((g) => g.canales.length).concat(inactivos)
}

// Fila como un canal de Discord: el nombre; en negrita con un punto si hay mensajes sin leer,
// y un círculo rojo con la cantidad si te etiquetaron.
function FilaCanal({ c, activo, onAbrir, escribe, hash = false, onEditar, arrastrable = false }) {
  const nuevo = c.no_leidos > 0 && !activo
  const ultimo = c.ultimo ? `${c.ultimo.autor_nombre}: ${c.ultimo.texto}` : 'Sin mensajes todavía'
  // Lo que antes era la sección "Esperan respuesta" ahora va en el tooltip, sin sacar el chat de su grupo.
  const titulo = c.esperando_desde ? `Espera respuesta · ${haceCuanto(c.esperando_desde)}\n${ultimo}` : ultimo
  return (
    <button
      type="button"
      className={`msj-fila${activo ? ' is-activo' : ''}${nuevo ? ' is-nuevo' : ''}`}
      onClick={() => onAbrir(c.id)}
      title={arrastrable ? `${titulo}\n\nArrastralo a Inactivos para archivarlo` : titulo}
      draggable={arrastrable}
      onDragStart={arrastrable ? (e) => {
        e.dataTransfer.setData('application/x-atv-canal', String(c.id))
        e.dataTransfer.effectAllowed = 'move'
      } : undefined}
    >
      {nuevo ? <i className="msj-fila__punto" aria-label="Mensajes sin leer" /> : null}
      <span className="msj-fila__nombre">
        {hash ? <em className="msj-fila__hash">#</em> : null}
        {c.nombre}
      </span>
      {escribe ? <span className="msj-fila__escribe" aria-label={`${escribe} está escribiendo`}><i /><i /><i /></span> : null}
      {onEditar && c.puede_administrar ? (
        <span
          role="button"
          tabIndex={0}
          className="msj-fila__editar"
          title="Editar canal"
          aria-label={`Editar #${c.nombre}`}
          onClick={(e) => {
            e.stopPropagation()
            onEditar(c)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              onEditar(c)
            }
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm6.2 1.6-1.3-.3a5 5 0 0 0-.5-1.2l.7-1.1-1.4-1.4-1.1.7a5 5 0 0 0-1.2-.5L9.1 1.8H6.9l-.3 1.3a5 5 0 0 0-1.2.5l-1.1-.7-1.4 1.4.7 1.1a5 5 0 0 0-.5 1.2l-1.3.3v2.2l1.3.3c.1.4.3.8.5 1.2l-.7 1.1 1.4 1.4 1.1-.7c.4.2.8.4 1.2.5l.3 1.3h2.2l.3-1.3c.4-.1.8-.3 1.2-.5l1.1.7 1.4-1.4-.7-1.1c.2-.4.4-.8.5-1.2l1.3-.3z" fill="currentColor" />
          </svg>
        </span>
      ) : null}
      {c.menciones > 0 ? (
        <b className="msj-fila__menciones" aria-label={`Te etiquetaron ${c.menciones} ${c.menciones === 1 ? 'vez' : 'veces'}`}>
          {c.menciones > 99 ? '99+' : c.menciones}
        </b>
      ) : null}
    </button>
  )
}

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

// Señas: quienes pagaron la seña y todavía no tienen onboarding. No tienen chat (no tienen mail ni
// clave): son pendientes. Desde acá se arranca su onboarding con la seña ya elegida.
const DIAS_ALERTA = 7
const usd = (n) => `USD ${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
const hace = (d) => (d == null ? '' : d === 0 ? 'hoy' : d === 1 ? 'hace 1 día' : `hace ${d} días`)

function SeccionSenas({ senas, abierta, alAlternar, activa, alAbrir }) {
  if (!senas?.length) return null
  const atrasadas = senas.filter((x) => (x.dias ?? 0) > DIAS_ALERTA).length
  const visibles = abierta ? senas : senas.filter((x) => x.id === activa)
  return (
    <section className="msj-grupo is-senas" aria-label="Señas">
      <button type="button" className={`msj-grupo__titulo${abierta ? ' is-abierto' : ''}${!abierta && atrasadas ? ' con-novedades' : ''}`} onClick={alAlternar} aria-expanded={abierta}>
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M3 2l4 3-4 3z" fill="currentColor" />
        </svg>
        <span>Señas</span>
        <small>{senas.length}</small>
      </button>
      {visibles.map((x) => (
        <button
          key={x.id}
          type="button"
          className={`msj-fila msj-sena${x.id === activa ? ' is-activo' : ''}${(x.dias ?? 0) > DIAS_ALERTA ? ' is-atrasada' : ''}`}
          onClick={() => alAbrir(x.id)}
          title={`${x.nombre} · ${x.plan || 'sin programa'}${x.monto ? ` · ${usd(x.monto)}` : ''} · seña ${hace(x.dias)}`}
        >
          <span className="msj-fila__nombre">{x.nombre}</span>
          <small className="msj-sena__dias">{x.monto ? `${usd(x.monto)} · ` : ''}{hace(x.dias)}</small>
        </button>
      ))}
    </section>
  )
}

function PanelSena({ sena, alHacerOnboarding }) {
  if (!sena) return <div className="msj-vacio">Esa seña ya no está pendiente.</div>
  const atrasada = (sena.dias ?? 0) > DIAS_ALERTA
  return (
    <div className="msj-sena-panel">
      <p className="msj-sena-panel__eyebrow">Seña sin onboarding</p>
      <h2>{sena.nombre}</h2>
      <dl>
        <div><dt>Programa</dt><dd>{sena.plan || '—'}</dd></div>
        <div><dt>Seña</dt><dd>{sena.monto ? usd(sena.monto) : '—'}</dd></div>
        <div><dt>Cobrada</dt><dd className={atrasada ? 'is-atrasada' : ''}>{sena.fecha ? new Date(`${sena.fecha}T00:00:00`).toLocaleDateString('es-AR') : '—'} · {hace(sena.dias)}</dd></div>
      </dl>
      {sena.notas ? (
        <div className="msj-sena-panel__notas">
          <span>Notas de la caja</span>
          <p>{sena.notas}</p>
        </div>
      ) : null}
      <p className="msj-sena-panel__ayuda">Todavía no tiene chat ni acceso: los recibe cuando le hagas el onboarding. Completás su mail real y la modalidad de pago; la seña ya queda elegida.</p>
      <button type="button" className="msj-sena-panel__boton" onClick={alHacerOnboarding}>Hacer onboarding</button>
    </div>
  )
}

function PanelCliente({ item, alVerFicha }) {
  const [pedidoRoadmap, setPedidoRoadmap] = useState(0)
  const cliente = item?.cliente
  if (!cliente) return null
  const vence = cliente.vence ? new Date(`${cliente.vence}T00:00:00`).toLocaleDateString('es-AR') : 'Sin fecha'
  return (
    <aside className="msj-panel" aria-label="Datos del cliente">
      <p className="msj-seccion">Cliente</p>
      {alVerFicha ? (
        <button type="button" className="msj-panel__quien is-link" onClick={() => alVerFicha(cliente.id)} title="Ver su ficha en la carpeta Clientes">
          <Avatar persona={{ tipo: 'cliente', nombre: cliente.nombre }} size={44} />
          <b>{cliente.nombre}</b>
          <small>Ver ficha →</small>
        </button>
      ) : (
        <div className="msj-panel__quien">
          <Avatar persona={{ tipo: 'cliente', nombre: cliente.nombre }} size={44} />
          <b>{cliente.nombre}</b>
        </div>
      )}
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
      <AccionesRapidas canalId={item.id} cliente={cliente.nombre} alCrearRoadmap={() => setPedidoRoadmap((n) => n + 1)} />
      <RoadmapCliente key={cliente.id} clienteId={cliente.id} canalId={item.id} cliente={cliente.nombre.split(' ')[0]} pedido={pedidoRoadmap} />
    </aside>
  )
}

export default function MensajesPage() {
  const { isEquipo, isAdmin } = useAuth()
  const escritorio = useEscritorio()
  const { suscribir, conectado } = useMensajeria()
  const [params, setParams] = useSearchParams()
  const [canales, setCanales] = useState(null)
  const [error, setError] = useState('')
  const [buscar, setBuscar] = useState('')
  const recarga = useRef(null)
  const { user } = useAuth()
  const [escriben, setEscriben] = useState({})
  // En el escritorio esta página queda armada aunque estés en otra app: ahí no lee ni toca la URL.
  const { pathname } = useLocation()
  const enMensajes = pathname.startsWith('/mensajes')
  const activoUrl = Number(params.get('c')) || null
  const vistaUrl = params.get('v')
  const guardado = useRef({ activo: activoUrl, vista: vistaUrl })
  if (enMensajes) guardado.current = { activo: activoUrl, vista: vistaUrl }
  const activo = enMensajes ? activoUrl : guardado.current.activo
  // El coach solo trabaja con alertas (donde lo etiquetaron); el admin elige entre la bandeja y sus alertas.
  const esCoach = isEquipo && !isAdmin
  const vista = esCoach ? 'alertas' : (enMensajes ? vistaUrl : guardado.current.vista) === 'alertas' ? 'alertas' : 'bandeja'

  const [senas, setSenas] = useState(null)
  const [senasAbiertas, setSenasAbiertas] = useState(false)
  const [onboardingDe, setOnboardingDe] = useState(null)
  const senaActiva = enMensajes ? Number(params.get('s')) || null : null
  const cargar = useCallback(() => {
    fetchCanales()
      .then(setCanales)
      .catch((err) => setError(err.message || 'No se pudieron cargar los canales.'))
    if (isEquipo) fetchSenas().then(setSenas).catch(() => null)
  }, [isEquipo])

  useEffect(() => {
    cargar()
  }, [cargar])

  // La lista se reordena con cada novedad, agrupando ráfagas en una sola recarga.
  useEffect(
    () =>
      suscribir((ev) => {
        if (!['mensaje', 'leido', 'borrado', 'reconectado', 'mencion', 'canal'].includes(ev.tipo)) return
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
    if (!enMensajes || activo || senaActiva || !canales?.length) return
    if (!isEquipo) {
      const propio = canales.find((c) => c.tipo === 'cliente')
      if (propio) setParams({ c: String(propio.id) }, { replace: true })
    } else if (vista === 'bandeja' && window.matchMedia('(min-width: 900px)').matches) {
      const primero = canales.find((c) => c.tipo === 'cliente') || canales[0]
      setParams({ c: String(primero.id) }, { replace: true })
    }
  }, [enMensajes, activo, canales, isEquipo, vista, setParams, senaActiva])

  const filtrados = useMemo(() => {
    if (!canales) return []
    const q = buscar.trim().toLowerCase()
    if (!q) return canales
    return canales.filter((c) => `${c.nombre} ${c.cliente?.nombre || ''}`.toLowerCase().includes(q))
  }, [canales, buscar])

  const canalesGrupo = filtrados.filter((c) => c.tipo === 'anuncios' || c.tipo === 'grupo')
  // Como en Discord: todo cliente vive en su grupo; lo urgente se ve por el punto y el contador.
  const resto = filtrados.filter((c) => c.tipo === 'cliente')
  const grupos = useMemo(() => (isEquipo ? agrupar(resto) : []), [isEquipo, resto])
  // Como en Discord: los grupos arrancan cerrados; cerrados igual muestran lo que tiene novedades.
  const [abiertos, setAbiertos] = useState([])
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState(null)

  // Si otro borra el canal que estás mirando, salís de él (como en Discord).
  useEffect(
    () =>
      suscribir((ev) => {
        if (ev.tipo === 'canal' && ev.borrado && String(ev.canal_id) === params.get('c')) setParams({})
      }),
    [suscribir, params, setParams],
  )
  const alternarGrupo = (id) => setAbiertos((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))
  // Arrastrar un chat a "Inactivos" lo archiva; soltarlo en cualquier otro grupo lo devuelve.
  const [soltandoEn, setSoltandoEn] = useState(null)
  async function soltar(e, grupoId) {
    e.preventDefault()
    setSoltandoEn(null)
    const id = Number(e.dataTransfer.getData('application/x-atv-canal'))
    const canal = canales?.find((c) => c.id === id)
    const inactivo = grupoId === 'inactivos'
    if (!canal || Boolean(canal.inactivo) === inactivo) return
    setCanales((l) => l.map((c) => (c.id === id ? { ...c, inactivo } : c)))
    try {
      await marcarInactivo(id, inactivo)
    } catch (err) {
      setCanales((l) => l.map((c) => (c.id === id ? { ...c, inactivo: !inactivo } : c)))
      setError(err.message || 'No se pudo mover el chat.')
    }
  }
  const zonaDeSoltar = (grupoId) => ({
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes('application/x-atv-canal')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (soltandoEn !== grupoId) setSoltandoEn(grupoId)
    },
    onDragLeave: (e) => !e.currentTarget.contains(e.relatedTarget) && setSoltandoEn(null),
    onDrop: (e) => soltar(e, grupoId),
  })
  const item = canales?.find((c) => c.id === activo)
  const abrir = (id) => setParams(vista === 'alertas' && !esCoach ? { v: 'alertas', c: String(id) } : { c: String(id) })
  const cambiarVista = (v) => setParams(v === 'alertas' ? { v: 'alertas' } : {})

  // Un grupo de clientes de la bandeja (por plan, o Inactivos), con su zona para soltar chats.
  const grupoDe = (g) => {
    const abierto = Boolean(buscar.trim()) || abiertos.includes(g.id)
    const visibles = abierto ? g.canales : g.canales.filter((c) => c.id === activo || c.no_leidos > 0 || c.menciones > 0 || escriben[c.id])
    const novedades = g.canales.filter((c) => c.no_leidos > 0).length
    return (
      <section key={g.id} className={`msj-grupo${g.id === 'inactivos' ? ' is-inactivos' : ''}${soltandoEn === g.id ? ' is-soltar' : ''}`} aria-label={g.nombre} {...zonaDeSoltar(g.id)}>
        <button type="button" className={`msj-grupo__titulo${abierto ? ' is-abierto' : ''}${!abierto && novedades ? ' con-novedades' : ''}`} onClick={() => alternarGrupo(g.id)} aria-expanded={abierto}>
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M3 2l4 3-4 3z" fill="currentColor" />
          </svg>
          <span>{g.nombre}</span>
          <small>{g.canales.length || ''}</small>
        </button>
        {visibles.map((c) => (
          <FilaCanal key={c.id} c={c} activo={c.id === activo} onAbrir={abrir} escribe={escriben[c.id]?.nombre} arrastrable />
        ))}
        {g.id === 'inactivos' && !g.canales.length && soltandoEn === g.id ? <p className="msj-grupo__vacio">Soltalo acá para archivarlo</p> : null}
      </section>
    )
  }

  const abrirSena = (id) => setParams({ s: String(id) })
  const seccionSenas = isEquipo ? (
    <SeccionSenas key="senas" senas={buscar.trim() ? senas?.filter((x) => x.nombre.toLowerCase().includes(buscar.trim().toLowerCase())) : senas} abierta={senasAbiertas || Boolean(buscar.trim())} alAlternar={() => setSenasAbiertas((a) => !a)} activa={senaActiva} alAbrir={abrirSena} />
  ) : null
  const sena = senas?.find((x) => x.id === senaActiva)

  // Canales grupales (y anuncios), arriba de todo como en Discord. El equipo los crea con el +.
  const seccionCanales =
    canales && (isEquipo || canalesGrupo.length) ? (
      <section className="msj-grupo" aria-label="Canales">
        <div className="msj-grupo__titulo is-abierto is-fijo">
          <span>Canales</span>
          {isEquipo ? (
            <button type="button" className="msj-grupo__mas" onClick={() => setCreando(true)} aria-label="Crear canal" title="Crear canal">
              +
            </button>
          ) : null}
        </div>
        {canalesGrupo.map((c) => (
          <FilaCanal key={c.id} c={c} activo={c.id === activo} onAbrir={abrir} escribe={escriben[c.id]?.nombre} hash onEditar={setEditando} />
        ))}
        {isEquipo && !canalesGrupo.length ? <p className="msj-grupo__vacio">Todavía no hay canales. Creá uno con el +.</p> : null}
      </section>
    ) : null

  return (
    <div className={`app-shell msj-root${isEquipo ? ' is-mac' : ''}`}>
      <AppHeader />
      <div className={`msj-layout${activo || senaActiva ? ' ver-conv' : ' ver-lista'}${isEquipo && item?.cliente ? ' con-panel' : ''}`}>
        <aside className="msj-lateral" aria-label="Canales">
          <div className="msj-lateral__head">
            <h1>Mensajes</h1>
            <span className={`msj-estado${conectado ? ' is-on' : ''}`} title={conectado ? 'En vivo' : 'Reconectando…'}>
              {conectado ? 'En vivo' : 'Reconectando…'}
            </span>
          </div>

          {isEquipo && !esCoach ? (
            <div className="msj-segmento" role="tablist" aria-label="Vista">
              <button type="button" role="tab" aria-selected={vista === 'bandeja'} className={vista === 'bandeja' ? 'is-on' : ''} onClick={() => cambiarVista('bandeja')}>
                Clientes
              </button>
              <button type="button" role="tab" aria-selected={vista === 'alertas'} className={vista === 'alertas' ? 'is-on' : ''} onClick={() => cambiarVista('alertas')}>
                Mis alertas
              </button>
            </div>
          ) : null}
          {vista === 'alertas' && esCoach ? seccionCanales : null}
          {vista === 'alertas' && esCoach ? seccionSenas : null}
          {vista === 'alertas' ? <Alertas activo={activo} onAbrir={abrir} /> : null}
          {vista === 'bandeja' && isEquipo ? (
            <input
              className="msj-buscar"
              type="search"
              placeholder="Buscar cliente"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              aria-label="Buscar cliente"
            />
          ) : null}
          {vista === 'bandeja' ? (
          <>
          {error ? <p className="msj-error">{error}</p> : null}
          {!canales ? <p className="msj-vacio">Cargando…</p> : null}

          {seccionCanales}

          {isEquipo
            ? grupos.flatMap((g) => (g.id === 'inactivos' ? [seccionSenas, grupoDe(g)] : [grupoDe(g)]))
            : null}
          {!isEquipo && resto.length ? <p className="msj-seccion">Tu canal</p> : null}
          {!isEquipo
            ? resto.map((c) => (
                <ItemCanal key={c.id} c={c} activo={c.id === activo} onAbrir={abrir} isEquipo={isEquipo} escribe={escriben[c.id]?.nombre} />
              ))
            : null}

          </>
          ) : null}
          {editando ? (
            <NuevoCanal
              canal={editando}
              onCerrar={() => setEditando(null)}
              onCreado={() => {
                setEditando(null)
                cargar()
              }}
              onBorrado={(c) => {
                setEditando(null)
                if (activo === c.id) setParams({})
                cargar()
              }}
            />
          ) : null}
          {creando ? (
            <NuevoCanal
              onCerrar={() => setCreando(false)}
              onCreado={(c) => {
                setCreando(false)
                cargar()
                abrir(c.id)
              }}
            />
          ) : null}
        </aside>

        <main className="msj-centro">
          {senaActiva && isEquipo ? (
            <PanelSena sena={sena} alHacerOnboarding={() => setOnboardingDe(sena)} />
          ) : activo ? (
            <Conversacion key={activo} canalId={activo} item={item} oculta={!enMensajes} onVolver={() => setParams(vista === 'alertas' && !esCoach ? { v: 'alertas' } : {})} />
          ) : (
            <div className="msj-vacio">
              {vista === 'alertas' ? 'Elegí una alerta para ir a la conversación.' : 'Elegí un canal para ver la conversación.'}
            </div>
          )}
        </main>

        {isEquipo && item?.cliente && !senaActiva ? <PanelCliente item={item} alVerFicha={isAdmin && escritorio ? escritorio.verFicha : null} /> : null}
        {onboardingDe ? (
          <NuevoCliente
            sena={onboardingDe}
            onCerrar={() => {
              setOnboardingDe(null)
              cargar()
            }}
            onAbrirChat={(canalId) => {
              setOnboardingDe(null)
              cargar()
              if (canalId) setParams({ c: String(canalId) })
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
