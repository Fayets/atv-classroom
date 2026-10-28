import { conEmojis } from '../utils/emojis'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { fetchSenas } from '../api/altas'
import { pedirCartelPausa } from '../components/Pausa'
import { NotificacionesCartel } from '../components/Notificaciones'
import { abrirDirecto, abrirPrivado, fetchCanales, fetchDirectorio, fetchEquipoChat, marcarInactivo, marcarPausa, marcarVencido, ordenarCanales } from '../api/mensajes'
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
import ContextoCliente from '../components/mensajes/ContextoCliente'
import '../styles/contexto.css'

// "martin zuniga" encuentra "Martín Zúñiga": sin tildes, sin ñ y sin mayúsculas.
const sinTildes = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Como las categorías de Discord: un grupo por plan, en este orden.
const GRUPOS = [
  { id: 'high', nombre: 'High Level', planes: ['high', 'advantage'] },
  { id: 'boost', nombre: 'Boost', planes: ['boost'] },
  { id: 'mid', nombre: 'Mid level', planes: ['mid'] },
  { id: 'entry', nombre: 'Entry level', planes: ['entry'] },
  { id: 'mentoria', nombre: 'Mentoria', planes: ['mentoria'] },
  { id: '2k', nombre: '2K', planes: ['2k'] },
]
function agrupar(lista) {
  const grupos = GRUPOS.map((g) => ({ ...g, canales: [] }))
  const sinPlan = { id: 'otros', nombre: 'Sin plan', canales: [] }
  // Los que el equipo arrastró a Inactivos van ahí, sea cual sea su plan. El grupo está siempre
  // (aunque vacío) para poder soltar chats encima.
  const inactivos = { id: 'inactivos', nombre: 'Inactivos', canales: [], fijo: true }
  // Pausa: como Inactivos, pero corta el acceso del cliente (solo lee su canal) hasta que lo reanuden.
  const pausa = { id: 'pausa', nombre: 'Pausa', canales: [], fijo: true }
  // Vencidos: solo ordena la bandeja (el acceso lo decide la fecha de la ficha en atv-clients).
  const vencidos = { id: 'vencidos', nombre: 'Vencidos', canales: [], fijo: true }
  for (const c of lista) {
    const plan = (c.cliente?.plan || '').toLowerCase()
    if (c.pausa) pausa.canales.push(c)
    else if (c.vencido) vencidos.canales.push(c)
    else if (c.inactivo) inactivos.canales.push(c)
    else (grupos.find((g) => g.planes.includes(plan)) || sinPlan).canales.push(c)
  }
  return [...grupos, sinPlan].filter((g) => g.canales.length).concat(pausa, vencidos, inactivos)
}

const comparar = (x, y) => (x < y ? -1 : x > y ? 1 : 0)
const fechaUltimo = (c) => c.ultimo?.creado_en || ''

function recorte(texto, largo) {
  const t = texto.split(/\s+/).filter(Boolean).join(' ')
  return t.length <= largo ? t : `${t.slice(0, largo - 1)}…`
}

// El mismo orden que arma el servidor (listar_canales): anuncios y grupos como estén, los directos
// con movimiento arriba, quien espera respuesta (el que más espera primero) y después lo más reciente.
function ordenarBandeja(lista) {
  const anuncios = lista.filter((c) => c.tipo === 'anuncios' || c.tipo === 'grupo')
  const directos = lista.filter((c) => c.tipo === 'directo').sort((a, b) => comparar(fechaUltimo(b), fechaUltimo(a)))
  const esperando = lista
    .filter((c) => c.tipo === 'cliente' && c.esperando_desde)
    .sort((a, b) => comparar(a.esperando_desde, b.esperando_desde))
  const resto = lista
    .filter((c) => c.tipo === 'cliente' && !c.esperando_desde)
    .sort((a, b) => comparar(fechaUltimo(b), fechaUltimo(a)) || comparar(a.nombre.toLowerCase(), b.nombre.toLowerCase()))
  return [...anuncios, ...directos, ...esperando, ...resto]
}

// Un mensaje nuevo cambia su fila (último mensaje, sin leer, si espera respuesta) y el orden: se
// arma acá con lo que trae el aviso, sin volver a pedir la bandeja entera al servidor.
function conMensaje(lista, m, { mio, aLaVista }) {
  const i = lista.findIndex((c) => c.id === m.canal_id)
  if (i < 0) return lista
  const c = lista[i]
  const deCliente = m.autor?.tipo === 'cliente'
  const copia = [...lista]
  copia[i] = {
    ...c,
    ultimo: c.bloqueado
      ? c.ultimo
      : { texto: m.texto ? recorte(m.texto, 90) : '📎 Archivo adjunto', autor_nombre: m.autor?.nombre, de: deCliente ? 'cliente' : 'equipo', creado_en: m.creado_en },
    // Al escribir, el servidor da por leído el canal hasta ese mensaje.
    no_leidos: mio ? 0 : aLaVista || c.bloqueado ? c.no_leidos : c.no_leidos + 1,
    menciones: mio ? 0 : c.menciones,
    esperando_desde: deCliente ? c.esperando_desde || m.creado_en : null,
  }
  return ordenarBandeja(copia)
}

// Fila como un canal de Discord: el nombre; en negrita con un punto si hay mensajes sin leer,
// y un círculo rojo con la cantidad si te etiquetaron.
// Cliente en pausa: los canales de la comunidad se ven con candado y sin un solo mensaje.
function CanalBloqueado({ item }) {
  const { user } = useAuth()
  const inactiva = user?.motivo_pausa === 'inactivo'
  const vencida = user?.motivo_pausa === 'vencido'
  useEffect(() => {
    pedirCartelPausa()
  }, [item.id])
  return (
    <div className="msj-bloqueado">
      <span className="msj-bloqueado__icono" aria-hidden="true">
        <svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1.6" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </span>
      <b>#{item.nombre} está bloqueado</b>
      <p>{vencida ? 'Tu acceso venció' : inactiva ? 'Tu cuenta está inactiva' : 'Tu programa está en pausa'}: mientras tanto no podés ver lo que se habla en la comunidad.</p>
      <button type="button" className="msj-bloqueado__boton" onClick={pedirCartelPausa}>{vencida ? 'Ver cómo extenderlo' : inactiva ? 'Ver cómo reactivarla' : 'Ver cómo reanudarlo'}</button>
    </div>
  )
}

function FilaCanal({ c, activo, onAbrir, escribe, hash = false, onEditar, arrastrable = false }) {
  const nuevo = c.no_leidos > 0 && !activo
  const ultimo = c.ultimo ? `${c.ultimo.autor_nombre}: ${conEmojis(c.ultimo.texto)}` : 'Sin mensajes todavía'
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
        {hash ? (
          c.bloqueado ? (
            <em className="msj-fila__hash is-candado" aria-label="Bloqueado">
              <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.6" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
            </em>
          ) : <em className="msj-fila__hash">#</em>
        ) : null}
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
            `${c.ultimo.autor_nombre.split(' ')[0]}: ${conEmojis(c.ultimo.texto)}`
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
        {sena.monto ? <div><dt>Seña</dt><dd>{usd(sena.monto)}</dd></div> : null}
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

function PanelCliente({ item, alVerFicha, llamadaId = null, onLlamadaUsada }) {
  const [pedidoRoadmap, setPedidoRoadmap] = useState(0)
  const [contexto, setContexto] = useState(false)
  const cerrarContexto = useCallback(() => setContexto(false), [])
  // Al cambiar de chat, el contexto del cliente anterior se cierra.
  useEffect(() => setContexto(false), [item?.cliente?.id])
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
      <AccionesRapidas canalId={item.id} cliente={cliente.nombre} plan={cliente.plan} alCrearRoadmap={() => setPedidoRoadmap((n) => n + 1)} alVerContexto={() => setContexto(true)} />
      <ContextoCliente clienteId={cliente.id} abierto={contexto} alCerrar={cerrarContexto} />
      <RoadmapCliente key={cliente.id} clienteId={cliente.id} canalId={item.id} cliente={cliente.nombre.split(' ')[0]} pedido={pedidoRoadmap} llamadaId={llamadaId} onLlamadaUsada={onLlamadaUsada} />
    </aside>
  )
}

// "En vivo" con la conexión andando. Si se corta (casi siempre un deploy), un recuadro amarillo de
// mantenimiento; se espera unos segundos para no mostrarlo en cada arranque mientras se conecta.
function EstadoConexion({ conectado }) {
  const [caido, setCaido] = useState(false)
  const [sinInternet, setSinInternet] = useState(!navigator.onLine)
  useEffect(() => {
    if (conectado) {
      setCaido(false)
      return undefined
    }
    const t = setTimeout(() => setCaido(true), 4000)
    return () => clearTimeout(t)
  }, [conectado])
  useEffect(() => {
    const cambio = () => setSinInternet(!navigator.onLine)
    window.addEventListener('online', cambio)
    window.addEventListener('offline', cambio)
    return () => {
      window.removeEventListener('online', cambio)
      window.removeEventListener('offline', cambio)
    }
  }, [])
  if (conectado) return <span className="msj-estado is-on">En vivo</span>
  if (sinInternet) return <span className="msj-estado is-caido">Sin internet</span>
  if (caido) return <span className="msj-estado is-caido">Mantenimiento</span>
  return <span className="msj-estado">Conectando…</span>
}

export default function MensajesPage() {
  const { isEquipo, isAdmin } = useAuth()
  const escritorio = useEscritorio()
  const { suscribir, conectado, canalAbierto, esMio } = useMensajeria()
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
  // Todo el equipo (admin y coach) elige entre la bandeja de clientes y sus alertas.
  const vista = (enMensajes ? vistaUrl : guardado.current.vista) === 'alertas' ? 'alertas' : 'bandeja'

  const [senas, setSenas] = useState(null)
  const [senasAbiertas, setSenasAbiertas] = useState(false)
  const [onboardingDe, setOnboardingDe] = useState(null)
  const senaActiva = enMensajes ? Number(params.get('s')) || null : null
  // Nunca dos cargas a la vez: si piden otra mientras tanto, se hace una más al terminar.
  const cargando = useRef(false)
  const otraCarga = useRef(false)
  const cargarRef = useRef(null)
  const cargar = useCallback(() => {
    if (cargando.current) {
      otraCarga.current = true
      return
    }
    cargando.current = true
    const pedidos = [
      fetchCanales()
        .then(setCanales)
        .catch((err) => setError(err.message || 'No se pudieron cargar los canales.')),
    ]
    if (isEquipo) pedidos.push(fetchSenas().then(setSenas).catch(() => null))
    Promise.all(pedidos).finally(() => {
      cargando.current = false
      if (otraCarga.current) {
        otraCarga.current = false
        cargarRef.current()
      }
    })
  }, [isEquipo])
  cargarRef.current = cargar
  const canalesRef = useRef(canales)
  canalesRef.current = canales

  useEffect(() => {
    cargar()
  }, [cargar])

  // Un mensaje se suma a su fila acá mismo. Antes cada aviso (y cada "leído" de cualquiera)
  // hacía que todas las pestañas pidieran la bandeja entera: con todos conectados, el servidor
  // no daba abasto. Solo lo que no se puede armar acá recarga, agrupando ráfagas.
  useEffect(
    () =>
      suscribir((ev) => {
        if (ev.tipo === 'mensaje' && canalesRef.current?.some((c) => c.id === ev.mensaje.canal_id)) {
          const m = ev.mensaje
          const opciones = { mio: esMio(m), aLaVista: canalAbierto.current === m.canal_id && !document.hidden }
          setCanales((l) => (l ? conMensaje(l, m, opciones) : l))
          return
        }
        if (ev.tipo === 'leido-propio') {
          setCanales((l) => l && l.map((c) => (c.id === ev.canal_id ? { ...c, no_leidos: 0, menciones: 0 } : c)))
          return
        }
        if (!['mensaje', 'borrado', 'reconectado', 'mencion', 'canal'].includes(ev.tipo)) return
        clearTimeout(recarga.current)
        recarga.current = setTimeout(cargar, 600 + Math.random() * 1500)
      }),
    [suscribir, cargar, esMio, canalAbierto],
  )

  // Por las dudas, la bandeja se confirma con el servidor cada tanto aunque no pase nada raro.
  useEffect(() => {
    if (!conectado) return undefined
    const t = setInterval(cargar, 180000 + Math.random() * 60000)
    return () => clearInterval(t)
  }, [conectado, cargar])

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

  // El cliente entra directo a su canal (una sola vez: si después vuelve a la lista con la flecha, se queda
  // en la lista); en escritorio el equipo abre el primero de la bandeja.
  const yaEntro = useRef(false)
  useEffect(() => {
    if (activo) yaEntro.current = true // entró a un chat (también desde una notificación): ya no se lo lleva solo
    if (!enMensajes || activo || senaActiva || !canales?.length) return
    if (!isEquipo) {
      if (yaEntro.current) return
      yaEntro.current = true
      const propio = canales.find((c) => c.tipo === 'cliente')
      if (propio) setParams({ c: String(propio.id) }, { replace: true })
    } else if (vista === 'bandeja' && window.matchMedia('(min-width: 900px)').matches) {
      const primero = canales.find((c) => c.tipo === 'cliente') || canales[0]
      setParams({ c: String(primero.id) }, { replace: true })
    }
  }, [enMensajes, activo, canales, isEquipo, vista, setParams, senaActiva])

  const filtrados = useMemo(() => {
    if (!canales) return []
    const q = sinTildes(buscar.trim())
    if (!q) return canales
    return canales.filter((c) => sinTildes(`${c.nombre} ${c.cliente?.nombre || ''}`).includes(q))
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
  // Arrastrar un chat a "Inactivos" lo archiva; a "Pausa" le corta el acceso al cliente (solo lee su
  // canal); soltarlo en cualquier otro grupo lo devuelve a la normalidad.
  const [soltandoEn, setSoltandoEn] = useState(null)
  async function soltar(e, grupoId) {
    e.preventDefault()
    setSoltandoEn(null)
    const id = Number(e.dataTransfer.getData('application/x-atv-canal'))
    const canal = canales?.find((c) => c.id === id)
    if (!canal) return
    const pausa = grupoId === 'pausa'
    const inactivo = grupoId === 'inactivos'
    const vencido = grupoId === 'vencidos'
    if (Boolean(canal.pausa) === pausa && Boolean(canal.inactivo) === inactivo && Boolean(canal.vencido) === vencido) return
    const antes = { pausa: Boolean(canal.pausa), inactivo: Boolean(canal.inactivo), vencido: Boolean(canal.vencido) }
    setCanales((l) => l.map((c) => (c.id === id ? { ...c, pausa, inactivo, vencido } : c)))
    try {
      // Primero se apaga el grupo de antes y después se prende el nuevo (el servidor deja uno solo).
      if (antes.pausa && !pausa) await marcarPausa(id, false)
      if (antes.inactivo && !inactivo) await marcarInactivo(id, false)
      if (antes.vencido && !vencido) await marcarVencido(id, false)
      if (pausa && !antes.pausa) await marcarPausa(id, true)
      if (inactivo && !antes.inactivo) await marcarInactivo(id, true)
      if (vencido && !antes.vencido) await marcarVencido(id, true)
    } catch (err) {
      setCanales((l) => l.map((c) => (c.id === id ? { ...c, ...antes } : c)))
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
  const porSlug = useMemo(() => new Map((canales || []).filter((c) => c.cliente?.slug).map((c) => [c.cliente.slug, { id: c.id, nombre: c.nombre }])), [canales])
  const abrir = (id) => setParams(vista === 'alertas' ? { v: 'alertas', c: String(id) } : { c: String(id) })
  const cambiarVista = (v) => setParams(v === 'alertas' ? { v: 'alertas' } : {})

  // Un grupo de clientes de la bandeja (por plan, o Inactivos), con su zona para soltar chats.
  const grupoDe = (g) => {
    const abierto = Boolean(buscar.trim()) || abiertos.includes(g.id)
    const visibles = abierto ? g.canales : g.canales.filter((c) => c.id === activo || c.no_leidos > 0 || c.menciones > 0 || escriben[c.id])
    const novedades = g.canales.filter((c) => c.no_leidos > 0).length
    return (
      <section key={g.id} className={`msj-grupo${g.id === 'inactivos' ? ' is-inactivos' : ''}${g.id === 'pausa' ? ' is-pausa' : ''}${g.id === 'vencidos' ? ' is-vencidos' : ''}${soltandoEn === g.id ? ' is-soltar' : ''}`} aria-label={g.nombre} {...zonaDeSoltar(g.id)}>
        <button type="button" className={`msj-grupo__titulo${abierto ? ' is-abierto' : ''}${novedades ? ' con-novedades' : ''}`} onClick={() => alternarGrupo(g.id)} aria-expanded={abierto}>
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M3 2l4 3-4 3z" fill="currentColor" />
          </svg>
          <span>{g.nombre}</span>
          {novedades ? <i className="msj-grupo__punto" aria-label={`${novedades} con mensajes sin leer`} /> : null}
          <small>{g.canales.length || ''}</small>
        </button>
        {visibles.map((c) => (
          <FilaCanal key={c.id} c={c} activo={c.id === activo} onAbrir={abrir} escribe={escriben[c.id]?.nombre} arrastrable />
        ))}
        {g.id === 'inactivos' && !g.canales.length && soltandoEn === g.id ? <p className="msj-grupo__vacio">Soltalo acá: queda inactivo y solo va a poder leer su canal</p> : null}
        {g.id === 'pausa' && !g.canales.length && soltandoEn === g.id ? <p className="msj-grupo__vacio">Soltalo acá: solo va a poder leer su canal</p> : null}
        {g.id === 'vencidos' && !g.canales.length && soltandoEn === g.id ? <p className="msj-grupo__vacio">Soltalo acá: se ordena con los vencidos</p> : null}
      </section>
    )
  }

  const abrirSena = (id) => setParams({ s: String(id) })
  const seccionSenas = isEquipo ? (
    <SeccionSenas key="senas" senas={buscar.trim() ? senas?.filter((x) => sinTildes(x.nombre).includes(sinTildes(buscar.trim()))) : senas} abierta={senasAbiertas || Boolean(buscar.trim())} alAlternar={() => setSenasAbiertas((a) => !a)} activa={senaActiva} alAbrir={abrirSena} />
  ) : null
  const sena = senas?.find((x) => x.id === senaActiva)

  // Mensajes directos entre el equipo, como en Discord: cada persona con su punto de sin leer.
  const [delEquipo, setDelEquipo] = useState([])
  useEffect(() => {
    if (isEquipo) fetchEquipoChat().then((l) => setDelEquipo(l || [])).catch(() => null)
  }, [isEquipo])
  const directos = (canales || []).filter((c) => c.tipo === 'directo')
  const personas = delEquipo
    .filter((m) => m.id !== user?.usuario_id)
    .map((m) => ({ ...m, canal: directos.find((c) => c.con?.id === m.id) || null }))
    .filter((m) => !buscar.trim() || sinTildes(m.nombre).includes(sinTildes(buscar.trim())))
    .sort((x, y) => (y.canal?.ultimo?.creado_en || '').localeCompare(x.canal?.ultimo?.creado_en || '') || x.nombre.localeCompare(y.nombre))
  async function abrirCon(persona) {
    if (persona.canal) return abrir(persona.canal.id)
    try {
      const d = await abrirDirecto(persona.id)
      cargar()
      abrir(d.id)
    } catch (err) {
      setError(err.message || 'No se pudo abrir el mensaje directo.')
    }
  }
  // Cerrada como los grupos de planes: cerrada muestra solo lo que tiene novedades (o el que tenés abierto).
  const directosAbiertos = Boolean(buscar.trim()) || abiertos.includes('directos')
  const personasVisibles = directosAbiertos
    ? personas
    : personas.filter((p) => p.canal && (p.canal.id === activo || p.canal.no_leidos > 0 || escriben[p.canal.id]))
  const directosNuevos = personas.filter((p) => p.canal && p.canal.no_leidos > 0).length
  const seccionDirectos =
    isEquipo && personas.length ? (
      <section className="msj-grupo msj-directos" aria-label="Mensajes directos">
        <button
          type="button"
          className={`msj-grupo__titulo${directosAbiertos ? ' is-abierto' : ''}${!directosAbiertos && directosNuevos ? ' con-novedades' : ''}`}
          onClick={() => alternarGrupo('directos')}
          aria-expanded={directosAbiertos}
        >
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M3 2l4 3-4 3z" fill="currentColor" />
          </svg>
          <span>Mensajes directos</span>
          <small>{directosNuevos || ''}</small>
        </button>
        {personasVisibles.map((p) => {
          const nuevo = p.canal && p.canal.no_leidos > 0 && p.canal.id !== activo
          return (
            <button
              key={p.id}
              type="button"
              className={`msj-fila msj-fila--persona${p.canal && p.canal.id === activo ? ' is-activo' : ''}${nuevo ? ' is-nuevo' : ''}`}
              onClick={() => abrirCon(p)}
              title={p.canal?.ultimo ? `${p.canal.ultimo.autor_nombre}: ${p.canal.ultimo.texto}` : `Escribile a ${p.nombre}`}
            >
              {nuevo ? <i className="msj-fila__punto" aria-label="Mensajes sin leer" /> : null}
              <Avatar persona={{ tipo: 'equipo', nombre: p.nombre, foto_url: p.foto_url }} size={20} />
              <span className="msj-fila__nombre">{p.nombre}</span>
              {p.canal && escriben[p.canal.id] ? <span className="msj-fila__escribe" aria-label={`${p.nombre} está escribiendo`}><i /><i /><i /></span> : null}
            </button>
          )
        })}
      </section>
    ) : null

  // Privados entre clientes: cada cliente le escribe a otro. Los ven solo ellos dos.
  const privados = (canales || []).filter((c) => c.tipo === 'privado' && (!buscar.trim() || sinTildes(c.nombre).includes(sinTildes(buscar.trim()))))
  const [eligiendo, setEligiendo] = useState(false)
  async function escribirA(cliente) {
    setEligiendo(false)
    const ya = privados.find((c) => c.con?.id === cliente.id)
    if (ya) return abrir(ya.id)
    try {
      const d = await abrirPrivado(cliente.id)
      cargar()
      abrir(d.id)
    } catch (err) {
      setError(err.message || 'No se pudo abrir el chat.')
    }
  }
  // Lo que ofrece la tarjeta de perfil al tocar a alguien en un chat: al equipo, escribirle por privado o abrir
  // el chat de ese cliente; a un cliente, su privado con otro cliente (al equipo no se le escribe por privado).
  function perfilDe(a) {
    if (!a) return null
    if (isEquipo) {
      if (a.tipo === 'equipo') {
        if (a.id === user?.usuario_id) return null
        return { texto: 'Enviar mensaje', hacer: () => abrirCon(personas.find((p) => p.id === a.id) || { id: a.id, canal: directos.find((c) => c.con?.id === a.id) || null }) }
      }
      const c = (canales || []).find((x) => x.tipo === 'cliente' && x.cliente?.id === a.id)
      const plan = c?.cliente?.plan ? `Cliente · ${c.cliente.plan}` : null
      return c ? { texto: 'Abrir su chat', hacer: () => abrir(c.id), detalle: a.miembro ? `Equipo de ${c.cliente.nombre}` : plan } : null
    }
    if (a.tipo === 'cliente' && a.id !== user?.usuario_id && !user?.pausa) return { texto: 'Enviar mensaje', hacer: () => escribirA({ id: a.id }) }
    return null
  }

  const seccionPrivados =
    !isEquipo && !user?.pausa ? (
      <section className="msj-grupo msj-directos" aria-label="Mensajes directos">
        <div className="msj-privados__cabeza">
          <p className="msj-seccion">Mensajes directos</p>
          <button type="button" className="msj-grupo__mas" onClick={() => setEligiendo(true)} aria-label="Escribirle a otro cliente" title="Escribirle a otro cliente">
            +
          </button>
        </div>
        {privados.map((c) => {
          const nuevo = c.no_leidos > 0 && c.id !== activo
          return (
            <button
              key={c.id}
              type="button"
              className={`msj-fila msj-fila--persona${c.id === activo ? ' is-activo' : ''}${nuevo ? ' is-nuevo' : ''}`}
              onClick={() => abrir(c.id)}
              title={c.ultimo ? `${c.ultimo.autor_nombre}: ${c.ultimo.texto}` : `Escribile a ${c.nombre}`}
            >
              {nuevo ? <i className="msj-fila__punto" aria-label="Mensajes sin leer" /> : null}
              <Avatar persona={{ tipo: 'cliente', nombre: c.nombre }} size={20} />
              <span className="msj-fila__nombre">{c.nombre}</span>
              {escriben[c.id] ? <span className="msj-fila__escribe" aria-label={`${c.nombre} está escribiendo`}><i /><i /><i /></span> : null}
            </button>
          )
        })}
        {!privados.length && !buscar.trim() ? <p className="msj-privados__vacio">Escribile a otro cliente de ATV con el +. Solo lo ven ustedes dos.</p> : null}
        {eligiendo ? <ElegirCliente onElegir={escribirA} onCerrar={() => setEligiendo(false)} /> : null}
      </section>
    ) : null

  // Como en Discord, un admin acomoda los canales manteniéndolos apretados y arrastrándolos.
  const [moviendoCanal, setMoviendoCanal] = useState(null)
  const [soltarCanal, setSoltarCanal] = useState(null) // { id, lado: 'arriba' | 'abajo' }
  async function soltarOrden(e, destino) {
    e.preventDefault()
    const origen = Number(e.dataTransfer.getData('application/x-atv-orden'))
    const lado = soltarCanal?.lado
    setMoviendoCanal(null)
    setSoltarCanal(null)
    if (!origen || origen === destino) return
    const ids = canalesGrupo.map((c) => c.id).filter((id) => id !== origen)
    ids.splice(ids.indexOf(destino) + (lado === 'abajo' ? 1 : 0), 0, origen)
    const pos = new Map(ids.map((id, i) => [id, i]))
    const esGrupo = (c) => pos.has(c.id)
    setCanales((prev) => {
      const ordenados = prev.filter(esGrupo).sort((x, y) => pos.get(x.id) - pos.get(y.id))
      let k = 0
      return prev.map((c) => (esGrupo(c) ? ordenados[k++] : c))
    })
    try {
      await ordenarCanales(ids)
    } catch (err) {
      setError(err.message || 'No se pudo guardar el orden.')
      cargar()
    }
  }

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
          <div
            key={c.id}
            className={`msj-orden${moviendoCanal === c.id ? ' is-moviendo' : ''}${soltarCanal?.id === c.id ? ` is-soltar-${soltarCanal.lado}` : ''}`}
            draggable={isAdmin && canalesGrupo.length > 1}
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-atv-orden', String(c.id))
              e.dataTransfer.effectAllowed = 'move'
              setMoviendoCanal(c.id)
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('application/x-atv-orden')) return
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              const lado = e.clientY < r.top + r.height / 2 ? 'arriba' : 'abajo'
              if (soltarCanal?.id !== c.id || soltarCanal?.lado !== lado) setSoltarCanal({ id: c.id, lado })
            }}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setSoltarCanal(null)}
            onDrop={(e) => soltarOrden(e, c.id)}
            onDragEnd={() => {
              setMoviendoCanal(null)
              setSoltarCanal(null)
            }}
          >
            <FilaCanal c={c} activo={c.id === activo} onAbrir={abrir} escribe={escriben[c.id]?.nombre} hash onEditar={setEditando} />
          </div>
        ))}
        {isEquipo && !canalesGrupo.length ? <p className="msj-grupo__vacio">Todavía no hay canales. Creá uno con el +.</p> : null}
      </section>
    ) : null

  return (
    <div className={`app-shell msj-root${isEquipo ? ' is-mac' : ''}`}>
      <AppHeader />
      <NotificacionesCartel />
      <div className={`msj-layout${activo || senaActiva ? ' ver-conv' : ' ver-lista'}${isEquipo && item?.cliente ? ' con-panel' : ''}`}>
        <aside className="msj-lateral" aria-label="Canales">
          <div className="msj-lateral__head">
            <h1>Mensajes</h1>
            <EstadoConexion conectado={conectado} />
          </div>

          {isEquipo ? (
            <div className="msj-segmento" role="tablist" aria-label="Vista">
              <button type="button" role="tab" aria-selected={vista === 'bandeja'} className={vista === 'bandeja' ? 'is-on' : ''} onClick={() => cambiarVista('bandeja')}>
                Clientes
              </button>
              <button type="button" role="tab" aria-selected={vista === 'alertas'} className={vista === 'alertas' ? 'is-on' : ''} onClick={() => cambiarVista('alertas')}>
                Mis alertas
              </button>
            </div>
          ) : null}
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
          {seccionDirectos}
          {seccionPrivados}

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
          ) : activo && item?.bloqueado ? (
            <CanalBloqueado item={item} />
          ) : activo ? (
            <Conversacion key={activo} canalId={activo} item={item} oculta={!enMensajes} canales={porSlug} perfilDe={perfilDe} onAbrirCanal={(id) => setParams({ c: String(id) })} onVolver={() => setParams(vista === 'alertas' ? { v: 'alertas' } : {})} />
          ) : (
            <div className="msj-vacio">
              {vista === 'alertas' ? 'Elegí una alerta para ir a la conversación.' : 'Elegí un canal para ver la conversación.'}
            </div>
          )}
        </main>

        {isEquipo && item?.cliente && !senaActiva ? <PanelCliente
            item={item}
            alVerFicha={isAdmin && escritorio ? escritorio.verFicha : null}
            llamadaId={enMensajes ? Number(params.get('roadmap')) || null : null}
            onLlamadaUsada={() => setParams({ c: String(item.id) }, { replace: true })}
          /> : null}
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

// A qué cliente escribirle: los demás clientes con acceso, con buscador (solo nombres).
function ElegirCliente({ onElegir, onCerrar }) {
  const [lista, setLista] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    fetchDirectorio().then(setLista).catch(() => setLista([]))
  }, [])
  const filtrados = (lista || []).filter((c) => !q.trim() || sinTildes(c.nombre).includes(sinTildes(q.trim())))
  return (
    <div className="msj-elegir" role="dialog" aria-label="Escribirle a otro cliente">
      <div className="msj-elegir__cabeza">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" />
        <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
      </div>
      <div className="msj-elegir__lista">
        {!lista ? <p className="msj-privados__vacio">Cargando…</p> : null}
        {lista && !filtrados.length ? <p className="msj-privados__vacio">No hay clientes con ese nombre.</p> : null}
        {filtrados.map((c) => (
          <button key={c.id} type="button" onClick={() => onElegir(c)}>
            <Avatar persona={{ tipo: 'cliente', nombre: c.nombre }} size={22} />
            <span>{c.nombre}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
