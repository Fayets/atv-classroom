// Rutas del mock: mensajería (editar/borrar/reaccionar, canales, alertas, contexto del cliente) y lo que sigue:
// acciones rápidas, #seguimiento, piloto, onboarding del equipo, Leverage y push.
// Las formas y los permisos siguen a los controladores del backend (mensajeria_controller y compañía).
// Lo mutable vive en memoria (CANALES y MENSAJES de ../datos) hasta recargar la página.

import { CANALES, CHATS_DEL_COACH, CLIENTE, COACH, EQUIPO, MENSAJES, USUARIO } from '../datos'
import {
  ACCIONES, AGENDA_SUGERIDA, BLOQUEABLES, BLOQUEADOS_DEFECTO, BORRADORES_INICIALES, ENVIOS_INICIALES, MARCAS_INICIALES,
  MENCIONES, OFERTAS, buscarMiembro, contextoDe, miembrosDe,
} from '../datos-mensajeria'
import { cuerpo, iso, json, noEncontrado, nuevoId, params, prohibido, quien } from '../util'

// ---------------------------------------------------------------- Quién pide
const PERSONAS = {
  admin: { tipo: 'equipo', id: USUARIO.usuario_id, nombre: USUARIO.nombre, foto_url: null, rol: USUARIO.rol, area: 'Marketing' },
  coach: { tipo: 'equipo', id: COACH.usuario_id, nombre: COACH.nombre, foto_url: null, rol: COACH.rol, area: 'Fulfillment' },
  cliente: { tipo: 'cliente', id: CLIENTE.usuario_id, nombre: CLIENTE.nombre, foto_url: null, rol: null, area: null },
}
const persona = (opciones) => PERSONAS[quien(opciones)]
const esEquipo = (opciones) => quien(opciones) !== 'cliente'
const esAdmin = (opciones) => quien(opciones) === 'admin'
const clave = (p) => `${p.tipo === 'equipo' ? 'equipo' : 'cliente'}:${p.id}`
const pila = (n) => (n || '').split(' ')[0]
const error = (detalle, status = 422) => json({ detail: detalle }, status)

// ---------------------------------------------------------------- Canales y mensajes
const canalPorId = (id) => CANALES.find((c) => c.id === Number(id))
// Qué canales ve cada sesión (igual que canalesDe de handler.js).
const veCanal = (sesion, c) => {
  if (sesion === 'cliente') return ((c.tipo === 'grupo' || c.tipo === 'anuncios') && !c.nombre.includes('equipo')) || c.id === 41 || c.tipo === 'privado'
  if (sesion === 'coach') return c.tipo === 'grupo' || c.tipo === 'anuncios' || CHATS_DEL_COACH.includes(c.id)
  return c.tipo !== 'privado'
}
const canalVisible = (opciones, id) => {
  const c = canalPorId(id)
  return c && veCanal(quien(opciones), c) ? c : null
}
const sinCanal = () => noEncontrado('Canal no encontrado.')
const sinMensaje = () => noEncontrado('Mensaje no encontrado.')

const buscarMensaje = (id) => {
  for (const lista of Object.values(MENSAJES)) {
    const m = lista.find((x) => x.id === Number(id))
    if (m) return m
  }
  return null
}
const esMio = (m, p) => m.autor.tipo === p.tipo && m.autor.id === p.id

// Los dos del chat directo (el privado de un coach con un cliente o de dos del equipo): canal → ids.
const PARES = new Map([[300, [3, 5]], [301, [3, 131]]])

// Mensajes que "manda el servidor" (seguimiento, piloto): se guardan y salen por el socket.
const AHORA = Date.now()
function publicar(canalId, autor, texto) {
  const m = {
    id: nuevoId(), canal_id: canalId, autor, texto, adjuntos: [], borrado: false, editado: false, respuesta_a: null,
    reacciones: [], creado_en: iso(0), origen: null, menciones: [], tildes: [],
  }
  MENSAJES[canalId] = [...(MENSAJES[canalId] || []), m]
  const canal = canalPorId(canalId)
  if (canal) canal.ultimo = { texto: texto.slice(0, 90), autor_nombre: autor.nombre, de: autor.tipo, creado_en: m.creado_en }
  return m
}

// handler.js no exporta su emitir(): se engancha el setter de window.WebSocket (el handler lo reemplaza
// después de importar este archivo) para guardar los sockets de prueba y mandarles eventos con recibir().
const SOCKETS = (window.__mockSockets ??= new Set())
if (!Object.getOwnPropertyDescriptor(window, 'WebSocket')?.get) {
  let actual = window.WebSocket
  Object.defineProperty(window, 'WebSocket', {
    configurable: true,
    get: () => actual,
    set(v) {
      actual = new Proxy(v, {
        construct(Clase, args, destino) {
          const socket = Reflect.construct(Clase, args, destino)
          if (String(args[0] ?? '').includes('/api/ws') && typeof socket.recibir === 'function') SOCKETS.add(socket)
          return socket
        },
      })
    },
  })
}
const emitir = (payload) => {
  for (const s of SOCKETS) {
    if (s.readyState === 3) SOCKETS.delete(s)
    else s.recibir?.(payload)
  }
}

// ---------------------------------------------------------------- Helpers de canales
// Como mensajeria_service._nombre_de_canal: minúsculas y guiones, con emojis y separadores decorativos.
const nombreDeCanal = (nombre) =>
  [...(nombre || '').trim().toLowerCase()].filter((c) => !/\p{Cc}/u.test(c)).join('')
    .replace(/\s+/g, '-').replace(/[#@<>/\\`]+/g, '').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
const ROLES = ['equipo', 'high', 'dfy', 'boost', 'mid', 'entry', 'mentoria']
const rolesValidos = (roles) => ROLES.filter((r) => (roles || []).includes(r))
const sinEmoji = (nombre) => (nombre || '').replace(/^[^\p{L}\p{N}_]+/u, '') || nombre

// Como _puede_administrar: un admin, los grupos y anuncios; un coach, solo los grupos que creó.
const puedeAdministrar = (opciones, c) => {
  if (esAdmin(opciones)) return c.tipo === 'grupo' || c.tipo === 'anuncios'
  return c.tipo === 'grupo' && esEquipo(opciones) && c.creado_por === persona(opciones).id
}
const nombreRepetido = (nombre, exceptoId = null) => CANALES.some((c) => c.id !== exceptoId && c.nombre === nombre && (c.tipo === 'grupo' || c.tipo === 'anuncios'))
const resumenCanal = (c) => ({ id: c.id, tipo: c.tipo, nombre: c.nombre, descripcion: c.descripcion, roles: c.roles, creado_por: c.creado_por })

// Un chat de cliente está en un solo grupo a la vez (Pausa, Inactivos, Vencidos).
const estadosCanal = (c, cual, valor) => {
  c[cual] = Boolean(valor)
  if (valor) for (const otro of ['pausa', 'inactivo', 'vencido']) if (otro !== cual) c[otro] = false
}
const soloPlata = (opciones, texto) => (esAdmin(opciones) ? null : prohibido(texto))
function moverEstado(cual, texto) {
  return ([, id], opciones) => {
    const mal = soloPlata(opciones, texto)
    if (mal) return mal
    const c = canalVisible(opciones, id)
    if (!c) return sinCanal()
    if (c.tipo !== 'cliente') return error(`Solo los chats de clientes van a ${cual === 'pausa' ? 'Pausa' : cual === 'inactivo' ? 'Inactivos' : 'Vencidos'}.`)
    const valor = Boolean(cuerpo(opciones)[cual])
    estadosCanal(c, cual, valor)
    return json({ ok: true, [cual]: valor })
  }
}

// Directos: se crea la primera vez y se reabre el mismo después.
function abrirChatDirecto(opciones, tipo, con) {
  const yo = persona(opciones)
  const par = [yo.id, con.id].sort((a, b) => a - b)
  const ya = CANALES.find((c) => c.tipo === tipo && PARES.get(c.id)?.slice().sort((a, b) => a - b).join() === par.join())
  if (ya) return ya
  const canal = {
    id: nuevoId(), tipo, nombre: con.nombre, con: { id: con.id, tipo: con.tipo, nombre: con.nombre, foto_url: null }, descripcion: null, cliente: null,
    bloqueado: false, ultimo: null, no_leidos: 0, menciones: 0, esperando_desde: null, roles: null, creado_por: yo.id, orden: null,
    inactivo: false, pausa: false, vencido: false, archivo: null, puede_administrar: false,
  }
  CANALES.push(canal)
  MENSAJES[canal.id] = []
  PARES.set(canal.id, [yo.id, con.id])
  if (quien(opciones) === 'coach') CHATS_DEL_COACH.push(canal.id)
  return canal
}

// ---------------------------------------------------------------- Texto completo del chat
const fechaAr = (iso8601) => {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(iso8601)).map((p) => [p.type, p.value]),
  )
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour === '24' ? '00' : partes.hour}:${partes.minute}`
}

// ---------------------------------------------------------------- Visto por
function gentePara(canal, autor) {
  const equipo = (canal.tipo === 'directo' || canal.tipo === 'dm' ? [] : EQUIPO.filter((p) => quienVeEquipo(canal, p)))
    .map((p) => ({ tipo: 'equipo', id: p.id, nombre: p.nombre, foto_url: null }))
  let clientes = []
  if (canal.tipo === 'cliente' && canal.cliente) clientes = [{ tipo: 'cliente', id: canal.cliente.id, nombre: canal.cliente.nombre, foto_url: null }]
  else if (canal.tipo === 'grupo' || canal.tipo === 'anuncios') {
    clientes = CANALES.filter((c) => c.tipo === 'cliente' && !c.pausa && !c.inactivo && !c.vencido).slice(0, 5)
      .map((c) => ({ tipo: 'cliente', id: c.cliente.id, nombre: c.cliente.nombre, foto_url: null }))
  } else {
    const par = PARES.get(canal.id) || []
    const otros = par.map((id) => EQUIPO.find((p) => p.id === id)).filter(Boolean).map((p) => ({ tipo: 'equipo', id: p.id, nombre: p.nombre, foto_url: null }))
    equipo.push(...otros)
    if (canal.con?.tipo === 'cliente') clientes = [{ tipo: 'cliente', id: canal.con.id, nombre: canal.con.nombre, foto_url: null }]
  }
  return [...equipo, ...clientes].filter((p) => !(p.tipo === autor.tipo && p.id === autor.id))
}
// Un coach solo ve los chats de clientes donde participa; el resto del equipo ve todos.
const quienVeEquipo = (canal, p) => !(p.id === COACH.usuario_id && canal.tipo === 'cliente' && !CHATS_DEL_COACH.includes(canal.id))

// ---------------------------------------------------------------- Alertas (menciones)
const ALERTAS = MENCIONES.map((r) => ({ ...r, creado: AHORA - r.creado_en_min * 60000, resp: r.respondida_en_min == null ? null : AHORA - r.respondida_en_min * 60000 }))
const fechaIso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
const recorte = (t, n = 220) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)
function alertaDict(r) {
  const m = r.mensaje_id ? buscarMensaje(r.mensaje_id) : null
  if (r.mensaje_id && (!m || m.borrado)) return null
  const canal = canalPorId(r.canal_id)
  const fin = r.resp ?? Date.now()
  return {
    id: r.id, canal_id: r.canal_id, canal_nombre: canal?.nombre || '', mensaje_id: r.mensaje_id || 100000 + r.id,
    autor: m ? m.autor : r.autor, texto: m ? recorte(m.texto || '📎 Archivo adjunto') : r.texto,
    creado_en: fechaIso(r.creado), respondida_en: r.resp ? fechaIso(r.resp) : null, estado: r.resp ? 'respondida' : 'pendiente',
    minutos: Math.max(0, Math.round((fin - r.creado) / 60000)),
  }
}

// ---------------------------------------------------------------- Contexto del cliente
const CIERRES = new Map() // cliente_id → Map(clave → { por, en })
const cierresDe = (id) => {
  if (!CIERRES.has(id)) CIERRES.set(id, new Map())
  return CIERRES.get(id)
}
const CLAVE_CIERRE = /^(ch:\d+|ll:\d+:(atv|cliente):\d+)$/
const canalDelCliente = (id) => CANALES.find((c) => c.tipo === 'cliente' && c.cliente?.id === Number(id))

// ---------------------------------------------------------------- Prueba de Boost
const PRUEBAS = new Map() // cliente_id → { plan, plan_anterior, desde, hasta }
const DIAS_PRUEBA = 7

// ---------------------------------------------------------------- Acciones rápidas
const listaAcciones = (opciones) => ACCIONES[quien(opciones)]
const limpiarAccion = (b) => {
  const nombre = (b.nombre || '').trim()
  const texto = (b.texto || '').trim()
  if (!nombre) return 'Ponele un nombre al botón.'
  if (!texto) return 'Escribí el mensaje que manda.'
  if (nombre.length > 40) return 'El nombre puede tener hasta 40 caracteres.'
  if (texto.length > 2000) return 'El mensaje puede tener hasta 2000 caracteres.'
  return { nombre, texto }
}
const accionesDe = (opciones) => (esEquipo(opciones) ? null : prohibido('Las acciones rápidas son para el equipo.'))

// ---------------------------------------------------------------- Seguimiento
let ENVIOS = ENVIOS_INICIALES()
const mal = (opciones) => (esAdmin(opciones) ? null : prohibido('Esta pantalla es de los admins.'))
const activos = () => CANALES.filter((c) => c.tipo === 'cliente' && c.cliente && !c.pausa && !c.inactivo && !c.vencido)
const normal = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function destinosDe(destino) {
  if (destino.donde === 'canal') {
    const ids = (destino.canales || []).map(Number)
    return CANALES.filter((c) => ids.includes(c.id) && (c.tipo === 'grupo' || c.tipo === 'anuncios')).map((c) => ({ canal: c, cliente: null }))
  }
  const planes = (destino.ofertas || []).flatMap((o) => OFERTAS.find((x) => x.id === o)?.planes || [])
  const sueltos = (destino.clientes || []).map(Number)
  return activos().filter((c) => planes.includes((c.cliente.plan || '').toLowerCase()) || sueltos.includes(c.cliente.id)).map((c) => ({ canal: c, cliente: c.cliente }))
}

function despachar(envio) {
  const cuenta = EQUIPO.find((p) => p.id === envio.cuenta_id)
  const autor = { tipo: 'equipo', id: cuenta.id, nombre: cuenta.nombre, foto_url: null, rol: cuenta.rol, area: cuenta.area }
  const alcanzados = new Set()
  for (const { canal, cliente } of destinosDe(envio.destino)) {
    const nombre = cliente ? pila(cliente.nombre).replace(/^./, (l) => l.toUpperCase()) : ''
    for (const texto of envio.mensajes) {
      const propio = texto.replace(/\{\s*nombre\s*\}/gi, nombre).replace(/[ \t]{2,}/g, ' ').replace(/ !/g, '!').replace(/ ,/g, ',').trim()
      if (!propio) continue
      emitir({ tipo: 'mensaje', mensaje: publicar(canal.id, autor, propio) })
      alcanzados.add(canal.id)
    }
  }
  envio.enviados = alcanzados.size
  envio.estado = alcanzados.size ? 'enviado' : 'error'
  envio.error = alcanzados.size ? null : 'No había a quién mandarle.'
  return alcanzados.size
}
// Los programados cuya hora llegó salen al pedir la lista (no hay un reloj de fondo).
const despacharVencidos = () => {
  for (const e of ENVIOS) if (e.estado === 'pendiente' && new Date(e.cuando) <= new Date()) despachar(e)
}
const dictEnvio = ({ destino, mensajes, ...resto }) => resto // eslint-disable-line no-unused-vars

// ---------------------------------------------------------------- Piloto
const CONFIG_PILOTO = {
  admin: { modo: 'borrador', bloqueados: [...BLOQUEADOS_DEFECTO] },
  coach: { modo: 'apagado', bloqueados: [...BLOQUEADOS_DEFECTO] },
  cliente: { modo: 'apagado', bloqueados: [...BLOQUEADOS_DEFECTO] },
}
let BORRADORES = BORRADORES_INICIALES()
const MARCAS = JSON.parse(JSON.stringify(MARCAS_INICIALES))
const soloEquipo = (opciones, texto = 'Solo para el equipo.') => (esEquipo(opciones) ? null : prohibido(texto))
const SIN_BORRADOR = 'Ese borrador ya no está: alguien lo mandó o lo descartó.'

// ---------------------------------------------------------------- Rutas
export const rutas = [
  // ---- Mensajes: editar, borrar, reaccionar, tildar, vistos
  ['PATCH', /^\/api\/mensajes\/(\d+)$/, ([, id], opciones) => {
    const m = buscarMensaje(id)
    const canal = m && canalVisible(opciones, m.canal_id)
    if (!m || !canal) return sinMensaje()
    const b = cuerpo(opciones)
    const texto = String(b.texto || '').trim()
    if (!texto || texto.length > 4000) return error('Texto inválido.')
    if (!esMio(m, persona(opciones)) || m.borrado) return prohibido('Solo podés editar tus propios mensajes.')
    m.texto = texto
    m.editado = true
    m.menciones = Array.isArray(b.menciones) ? b.menciones : m.menciones
    return json({ ...m })
  }],
  ['DELETE', /^\/api\/mensajes\/(\d+)$/, ([, id], opciones) => {
    const m = buscarMensaje(id)
    if (!m || !canalVisible(opciones, m.canal_id)) return sinMensaje()
    if (!esMio(m, persona(opciones)) && !esAdmin(opciones)) return prohibido('Solo podés borrar tus propios mensajes.')
    Object.assign(m, { borrado: true, texto: null, adjuntos: [], reacciones: [], tildes: [] })
    for (const lista of Object.values(MENSAJES)) for (const x of lista) if (x.respuesta_a?.id === m.id) x.respuesta_a = { ...x.respuesta_a, texto: null }
    return json({ ...m })
  }],
  ['PUT', /^\/api\/mensajes\/(\d+)\/reacciones$/, ([, id], opciones) => {
    const m = buscarMensaje(id)
    if (!m || m.borrado || !canalVisible(opciones, m.canal_id)) return sinMensaje()
    const emoji = String(cuerpo(opciones).emoji || '').trim()
    if (!emoji || [...emoji].length > 16 || /[A-Za-z0-9]/.test(emoji) || /\s/.test(emoji)) return error('Reacción inválida.')
    const yo = persona(opciones)
    const quienEs = clave(yo)
    const grupo = m.reacciones.find((r) => r.emoji === emoji)
    if (grupo?.quienes.includes(quienEs)) {
      const i = grupo.quienes.indexOf(quienEs)
      grupo.quienes.splice(i, 1)
      grupo.nombres.splice(i, 1)
      if (!grupo.quienes.length) m.reacciones = m.reacciones.filter((r) => r !== grupo)
    } else if (grupo) {
      grupo.quienes.push(quienEs)
      grupo.nombres.push(pila(yo.nombre))
    } else {
      if (m.reacciones.length >= 20) return error('Este mensaje ya tiene demasiadas reacciones distintas.')
      m.reacciones.push({ emoji, quienes: [quienEs], nombres: [pila(yo.nombre)] })
    }
    return json({ mensaje_id: m.id, canal_id: m.canal_id, reacciones: m.reacciones })
  }],
  ['PUT', /^\/api\/mensajes\/(\d+)\/tildes$/, ([, id], opciones) => {
    if (!esEquipo(opciones)) return prohibido('Solo el equipo de ATV tilda los updates.')
    const m = buscarMensaje(id)
    if (!m || m.borrado || !canalVisible(opciones, m.canal_id)) return sinMensaje()
    const b = cuerpo(opciones)
    const renglon = String(b.clave || '').trim()
    if (!renglon || !(m.texto || '').includes(renglon)) return error('Ese renglón no está en el mensaje.')
    m.tildes = b.hecho ? [...m.tildes.filter((t) => t !== renglon), renglon] : m.tildes.filter((t) => t !== renglon)
    return json({ mensaje_id: m.id, canal_id: m.canal_id, tildes: m.tildes })
  }],
  ['GET', /^\/api\/mensajes\/(\d+)\/vistos$/, ([, id], opciones) => {
    if (!esEquipo(opciones)) return prohibido('Solo el equipo de ATV ve quién leyó un mensaje.')
    const m = buscarMensaje(id)
    if (!m || m.borrado) return sinMensaje()
    const canal = canalVisible(opciones, m.canal_id)
    if (!canal) return sinCanal()
    const yo = persona(opciones)
    // Quién lo vio es una cuenta de mentira, pero estable: quien mira siempre lo vio.
    const vio = (p) => (p.tipo === yo.tipo && p.id === yo.id) || (m.id + p.id) % 3 !== 0
    const orden = (a, b) => (a.tipo !== 'cliente') - (b.tipo !== 'cliente') || a.nombre.toLowerCase().localeCompare(b.nombre.toLowerCase())
    const gente = gentePara(canal, m.autor)
    return json({ mensaje_id: m.id, vieron: gente.filter(vio).sort(orden), faltan: gente.filter((p) => !vio(p)).sort(orden) })
  }],

  // ---- Chats directos y links
  ['POST', /^\/api\/mensajes\/directos$/, (_, opciones) => {
    if (!esEquipo(opciones)) return prohibido('Los mensajes directos son entre el equipo.')
    const adminId = Number(cuerpo(opciones).admin_id)
    if (adminId === persona(opciones).id) return error('Elegí a otra persona del equipo.')
    const otro = EQUIPO.find((p) => p.id === adminId)
    if (!otro) return noEncontrado('No existe esa persona en el equipo.')
    const canal = abrirChatDirecto(opciones, 'directo', { id: otro.id, tipo: 'equipo', nombre: otro.nombre })
    return json({ id: canal.id, tipo: 'directo', con: adminId })
  }],
  ['POST', /^\/api\/mensajes\/dm$/, (_, opciones) => {
    if (!esEquipo(opciones)) return prohibido('El mensaje privado con un cliente lo abre el equipo.')
    const clienteId = Number(cuerpo(opciones).cliente_id)
    const cliente = canalDelCliente(clienteId)?.cliente
    if (!cliente) return noEncontrado('No encontramos a ese cliente.')
    const canal = abrirChatDirecto(opciones, 'dm', { id: cliente.id, tipo: 'cliente', nombre: cliente.nombre })
    return json({ id: canal.id, tipo: 'dm', con: clienteId })
  }],
  ['GET', /^\/api\/mensajes\/vista-previa$/, (_, __, url) => {
    const link = (params(url).get('url') || '').trim()
    const hallado = link.match(/^https:\/\/(?:www\.)?fathom\.video\/(?:share|embed)\/([\w-]+)/)
    if (!hallado) return error('Solo hay vista previa de links de Fathom.', 400)
    const titulos = ['1 a 1 con Alejandro', 'Revisión del roadmap del mes', 'Llamada de diagnóstico', 'Clase en vivo de Sistemas']
    const n = [...hallado[1]].reduce((t, c) => t + c.charCodeAt(0), 0)
    return json({
      url: `https://fathom.video/share/${hallado[1]}`, titulo: titulos[n % titulos.length],
      descripcion: 'Alejandro, Alan Klein · 35 min', imagen: 'https://placehold.co/640x360/EBE8E2/1D1D1F?text=Fathom',
    })
  }],
  ['GET', /^\/api\/mensajes\/canales\/(\d+)\/texto$/, ([, id], opciones) => {
    if (!esEquipo(opciones)) return prohibido('Solo para el equipo.')
    const canal = canalVisible(opciones, id)
    if (!canal) return sinCanal()
    const lineas = (MENSAJES[canal.id] || []).filter((m) => !m.borrado).map((m) => {
      const partes = [...((m.texto || '').trim() ? [m.texto.trim()] : []), ...m.adjuntos.map((a) => `[adjunto: ${a.nombre || 'archivo'}]`)]
      return `[${fechaAr(m.creado_en)}] ${m.autor.nombre}${m.autor.tipo === 'equipo' ? ' (ATV)' : ''}: ${partes.join('\n')}`
    })
    const nombre = canal.nombre || `canal-${canal.id}`
    return json({ nombre, texto: `Conversación: ${nombre}\nMensajes: ${lineas.length}\n\n${lineas.join('\n\n')}\n` })
  }],

  // ---- Canales: crear, editar, borrar, ordenar
  ['POST', /^\/api\/mensajes\/canales$/, (_, opciones) => {
    if (!esEquipo(opciones)) return prohibido('Solo el equipo crea canales.')
    const b = cuerpo(opciones)
    const descripcion = (b.descripcion || '').trim().slice(0, 300) || null
    if (b.tipo === 'anuncios') {
      if (!esAdmin(opciones)) return prohibido('Solo un admin crea canales de anuncios.')
      const nombre = (b.nombre || '').trim().toLowerCase().replace(/ /g, '-')
      if (!nombre) return error('Poné un nombre para el canal.')
      const canal = { ...nuevoCanalGrupo(nombre, descripcion, ROLES, persona(opciones).id), tipo: 'anuncios' }
      CANALES.push(canal)
      MENSAJES[canal.id] = []
      return json({ id: canal.id, tipo: canal.tipo, nombre: canal.nombre, descripcion: canal.descripcion }, 201)
    }
    const nombre = nombreDeCanal(b.nombre)
    const roles = rolesValidos(b.roles)
    if (!nombre) return error('Poné un nombre para el canal.')
    if (!roles.length) return error('Elegí al menos un rol que vea el canal.')
    if (nombreRepetido(nombre)) return error('Ya hay un canal con ese nombre.', 409)
    const canal = nuevoCanalGrupo(nombre, descripcion, roles, persona(opciones).id)
    CANALES.push(canal)
    MENSAJES[canal.id] = []
    return json(resumenCanal(canal), 201)
  }],
  ['PATCH', /^\/api\/mensajes\/canales\/(\d+)$/, ([, id], opciones) => {
    const canal = canalVisible(opciones, id)
    if (!canal) return sinCanal()
    if (!puedeAdministrar(opciones, canal)) return prohibido('Solo quien creó el canal o un admin lo puede editar.')
    const b = cuerpo(opciones)
    if (b.nombre != null) {
      const nuevo = nombreDeCanal(b.nombre)
      if (!nuevo) return error('Poné un nombre para el canal.')
      if (nuevo !== canal.nombre && nombreRepetido(nuevo, canal.id)) return error('Ya hay un canal con ese nombre.', 409)
      canal.nombre = nuevo
    }
    if (b.descripcion != null) canal.descripcion = String(b.descripcion).trim().slice(0, 300) || null
    if (b.roles != null && canal.tipo === 'grupo') {
      const roles = rolesValidos(b.roles)
      if (!roles.length) return error('Elegí al menos un rol que vea el canal.')
      canal.roles = roles
    }
    return json(resumenCanal(canal))
  }],
  ['DELETE', /^\/api\/mensajes\/canales\/(\d+)$/, ([, id], opciones) => {
    const canal = canalVisible(opciones, id)
    if (!canal) return sinCanal()
    if (!puedeAdministrar(opciones, canal)) return prohibido('Solo quien creó el canal o un admin lo puede borrar.')
    const mensajes = (MENSAJES[canal.id] || []).length
    CANALES.splice(CANALES.indexOf(canal), 1)
    delete MENSAJES[canal.id]
    const i = CHATS_DEL_COACH.indexOf(canal.id)
    if (i >= 0) CHATS_DEL_COACH.splice(i, 1)
    return json({ ok: true, mensajes })
  }],
  ['PUT', /^\/api\/mensajes\/canales-orden$/, (_, opciones) => {
    if (!esAdmin(opciones)) return prohibido('Solo un admin acomoda los canales.')
    const ids = [...new Set((cuerpo(opciones).ids || []).map(Number))]
    ids.forEach((cid, i) => {
      const c = canalPorId(cid)
      if (c && (c.tipo === 'grupo' || c.tipo === 'anuncios')) c.orden = i
    })
    return json({ ok: true })
  }],

  // ---- Bandeja de clientes: señas, pausa, inactivos, vencidos, plan, prueba de Boost
  ['PUT', /^\/api\/mensajes\/clientes\/(\d+)\/sena$/, ([, id], opciones) => {
    if (!esEquipo(opciones)) return prohibido('Solo el equipo ordena la bandeja.')
    const canal = canalDelCliente(id)
    if (!canal) return noEncontrado('No existe ese cliente.')
    const sena = Boolean(cuerpo(opciones).sena)
    canal.sena = sena
    if (sena) Object.assign(canal, { pausa: false, inactivo: false, vencido: false })
    return json({ canal_id: canal.id, cliente_id: Number(id), sena })
  }],
  ['PUT', /^\/api\/mensajes\/canales\/(\d+)\/inactivo$/, moverEstado('inactivo', 'Solo admins, Ventas o Sistemas pasan a un cliente a Inactivos.')],
  ['PUT', /^\/api\/mensajes\/canales\/(\d+)\/vencido$/, moverEstado('vencido', 'Solo admins, Ventas o Sistemas pasan a un cliente a Vencidos.')],
  ['PUT', /^\/api\/mensajes\/canales\/(\d+)\/pausa$/, moverEstado('pausa', 'Solo admins, Ventas o Sistemas pausan a un cliente.')],
  ['PUT', /^\/api\/mensajes\/canales\/(\d+)\/plan$/, ([, id], opciones) => {
    const sinPermiso = soloPlata(opciones, 'Solo admins, Ventas o Sistemas cambian el plan de un cliente.')
    if (sinPermiso) return sinPermiso
    const plan = String(cuerpo(opciones).plan || '').trim().toLowerCase()
    if (!['entry', 'mid', 'high', 'mentoria', 'boost', 'advantage', '2k', 'dfy'].includes(plan)) return error('Ese plan no existe.')
    const canal = canalVisible(opciones, id)
    if (!canal) return sinCanal()
    if (canal.tipo !== 'cliente' || !canal.cliente) return error('Solo los chats de clientes tienen plan.')
    canal.cliente.plan = plan
    Object.assign(canal, { pausa: false, inactivo: false, vencido: false })
    return json({ ok: true, plan })
  }],
  ['GET', /^\/api\/mensajes\/canales\/(\d+)\/prueba-boost$/, ([, id], opciones) => {
    if (!esEquipo(opciones)) return prohibido('Solo el equipo.')
    const canal = canalDelChat(id)
    if (!canal) return noEncontrado('Ese chat no es de un cliente.')
    return json({ prueba: PRUEBAS.get(canal.cliente.id) || null, puede: esAdmin(opciones), plan: canal.cliente.plan, dias: DIAS_PRUEBA })
  }],
  ['POST', /^\/api\/mensajes\/canales\/(\d+)\/prueba-boost$/, ([, id], opciones) => {
    const sinPermiso = soloPlata(opciones, 'Solo admins, Ventas o Sistemas dan el Boost de prueba.')
    if (sinPermiso) return sinPermiso
    const canal = canalDelChat(id)
    if (!canal) return noEncontrado('Ese chat no es de un cliente.')
    if (PRUEBAS.has(canal.cliente.id)) return error('Ya tiene una prueba en curso.', 409)
    if ((canal.cliente.plan || '').toLowerCase() === 'boost') return error('Ya está en Boost.', 409)
    const prueba = { plan: 'boost', plan_anterior: canal.cliente.plan, desde: iso(0), hasta: iso(-DIAS_PRUEBA * 1440) }
    PRUEBAS.set(canal.cliente.id, prueba)
    canal.cliente.plan = 'boost'
    return json({ prueba })
  }],
  ['DELETE', /^\/api\/mensajes\/canales\/(\d+)\/prueba-boost$/, ([, id], opciones) => {
    const sinPermiso = soloPlata(opciones, 'Solo admins, Ventas o Sistemas terminan el Boost de prueba.')
    if (sinPermiso) return sinPermiso
    const canal = canalDelChat(id)
    if (!canal) return noEncontrado('Ese chat no es de un cliente.')
    const prueba = PRUEBAS.get(canal.cliente.id)
    if (!prueba) return noEncontrado('No tiene una prueba en curso.')
    if ((canal.cliente.plan || '').toLowerCase() === 'boost' && prueba.plan_anterior) canal.cliente.plan = prueba.plan_anterior
    PRUEBAS.delete(canal.cliente.id)
    return json({ prueba: null, plan: canal.cliente.plan })
  }],

  // ---- Alertas
  ['GET', /^\/api\/mensajes\/menciones$/, (_, opciones) => {
    if (!esEquipo(opciones)) return prohibido('Solo para el equipo.')
    const yo = persona(opciones).id
    const items = ALERTAS.filter((r) => r.admin_id === yo).map(alertaDict).filter(Boolean)
    const pendientes = items.filter((i) => i.estado === 'pendiente').sort((a, b) => a.creado_en.localeCompare(b.creado_en))
    const respondidas = items.filter((i) => i.estado === 'respondida').sort((a, b) => b.creado_en.localeCompare(a.creado_en))
    const semana = respondidas.filter((i) => i.respondida_en >= fechaIso(Date.now() - 7 * 864e5)).map((i) => i.minutos)
    return json({
      pendientes: pendientes.length,
      promedio_minutos: semana.length ? Math.round(semana.reduce((t, n) => t + n, 0) / semana.length) : null,
      respondidas_semana: semana.length,
      alertas: [...pendientes, ...respondidas],
    })
  }],
  ['POST', /^\/api\/mensajes\/menciones\/(\d+)\/resolver$/, ([, id], opciones) => {
    const r = ALERTAS.find((x) => x.id === Number(id))
    if (!r || !esEquipo(opciones) || r.admin_id !== persona(opciones).id) return noEncontrado('Alerta no encontrada.')
    if (r.resp == null) {
      r.resp = Date.now()
      const canal = canalPorId(r.canal_id)
      if (canal?.menciones > 0 && esAdmin(opciones)) canal.menciones -= 1
    }
    return json({ id: r.id, respondida_en: fechaIso(r.resp) })
  }],

  // ---- Contexto del cliente (pase de guardia)
  ['GET', /^\/api\/contexto\/clientes\/(\d+)$/, ([, id], opciones) => {
    if (!esEquipo(opciones)) return prohibido('Solo el equipo.')
    const canal = canalDelCliente(id)
    if (!canal) return noEncontrado('No existe ese cliente.')
    const c = canal.cliente
    return json(contextoDe({ id: c.id, nombre: c.nombre, plan: c.plan, vence: c.vence }, cierresDe(c.id)))
  }],
  ['POST', /^\/api\/contexto\/compromisos\/cierre$/, (_, opciones) => {
    if (!esEquipo(opciones)) return prohibido('Solo el equipo.')
    const b = cuerpo(opciones)
    if (!CLAVE_CIERRE.test(b.clave || '')) return error('Ese compromiso no se cierra a mano (los del roadmap se tildan en el roadmap).')
    const cierres = cierresDe(Number(b.cliente_id))
    const cerrado = b.cerrado !== false
    if (cerrado) cierres.set(b.clave, { por: pila(persona(opciones).nombre), en: iso(0) })
    else cierres.delete(b.clave)
    const fila = cierres.get(b.clave)
    return json({ clave: b.clave, cerrado: Boolean(fila), cerrado_por: fila?.por ?? null, cerrado_en: fila?.en ?? null })
  }],

  // ---- Acciones rápidas (el GET y el POST de compartir ya los resuelve handler.js)
  ['GET', /^\/api\/acciones$/, (_, opciones) => {
    const sinPermiso = accionesDe(opciones)
    if (sinPermiso) return sinPermiso
    const acciones = [...listaAcciones(opciones)].sort((a, b) => a.orden - b.orden)
    const yaTiene = acciones.some((a) => a.texto.includes('calendly.com'))
    return json({ acciones, sugeridas: yaTiene ? [] : [AGENDA_SUGERIDA] })
  }],
  ['POST', /^\/api\/acciones$/, (_, opciones) => {
    const sinPermiso = accionesDe(opciones)
    if (sinPermiso) return sinPermiso
    const limpio = limpiarAccion(cuerpo(opciones))
    if (typeof limpio === 'string') return error(limpio)
    const lista = listaAcciones(opciones)
    if (lista.length >= 12) return error('Podés tener hasta 12 acciones.')
    const accion = { id: nuevoId(), ...limpio, orden: Math.max(-1, ...lista.map((a) => a.orden)) + 1 }
    lista.push(accion)
    return json(accion)
  }],
  ['PATCH', /^\/api\/acciones\/(\d+)$/, ([, id], opciones) => {
    const sinPermiso = accionesDe(opciones)
    if (sinPermiso) return sinPermiso
    const limpio = limpiarAccion(cuerpo(opciones))
    if (typeof limpio === 'string') return error(limpio)
    const accion = listaAcciones(opciones).find((a) => a.id === Number(id))
    if (!accion) return noEncontrado('No existe esa acción.')
    Object.assign(accion, limpio)
    return json(accion)
  }],
  ['DELETE', /^\/api\/acciones\/(\d+)$/, ([, id], opciones) => {
    const sinPermiso = accionesDe(opciones)
    if (sinPermiso) return sinPermiso
    const lista = listaAcciones(opciones)
    const i = lista.findIndex((a) => a.id === Number(id))
    if (i < 0) return noEncontrado('No existe esa acción.')
    lista.splice(i, 1)
    return json({ ok: true })
  }],

  // ---- #seguimiento (admins)
  ['GET', /^\/api\/seguimiento\/acceso$/, (_, opciones) => json({ puede: esAdmin(opciones) })],
  ['GET', /^\/api\/seguimiento\/opciones$/, (_, opciones) => {
    const sinPermiso = mal(opciones)
    if (sinPermiso) return sinPermiso
    const lista = activos()
    return json({
      cuentas: [...EQUIPO].sort((a, b) => a.nombre.toLowerCase().localeCompare(b.nombre.toLowerCase())).map((p) => ({ id: p.id, nombre: p.nombre, foto_url: null, rol: p.rol, area: p.area })),
      canales: CANALES.filter((c) => c.tipo === 'grupo' || c.tipo === 'anuncios').sort((a, b) => (a.orden ?? 1e9) - (b.orden ?? 1e9)).map((c) => ({ id: c.id, nombre: sinEmoji(c.nombre), tipo: c.tipo })),
      ofertas: OFERTAS.map((o) => ({ id: o.id, nombre: o.nombre, clientes: lista.filter((c) => o.planes.includes((c.cliente.plan || '').toLowerCase())).length })).filter((o) => o.clientes),
    })
  }],
  ['GET', /^\/api\/seguimiento\/clientes$/, (_, opciones, url) => {
    const sinPermiso = mal(opciones)
    if (sinPermiso) return sinPermiso
    const q = normal((params(url).get('q') || '').trim())
    if (q.length < 2) return json([])
    return json(activos().filter((c) => normal(c.cliente.nombre).includes(q)).slice(0, 8).map((c) => ({ id: c.cliente.id, nombre: c.cliente.nombre, plan: c.cliente.plan })))
  }],
  ['GET', /^\/api\/seguimiento\/envios$/, (_, opciones) => {
    const sinPermiso = mal(opciones)
    if (sinPermiso) return sinPermiso
    despacharVencidos()
    return json([...ENVIOS].sort((a, b) => new Date(b.cuando) - new Date(a.cuando)).slice(0, 30).map(dictEnvio))
  }],
  ['POST', /^\/api\/seguimiento\/envios$/, (_, opciones) => {
    const sinPermiso = mal(opciones)
    if (sinPermiso) return sinPermiso
    const b = cuerpo(opciones)
    const crudos = Array.isArray(b.mensajes) ? b.mensajes : [b.texto]
    const mensajes = crudos.map((m) => String(m ?? '').trim()).filter(Boolean)
    if (!mensajes.length) return error('Escribí el mensaje.')
    if (mensajes.length > 10) return error('Una secuencia puede tener hasta 10 mensajes.')
    if (mensajes.some((m) => m.length > 4000)) return error('Un mensaje supera los 4000 caracteres.')
    const destino = b.destino || {}
    if (!['canal', 'chat'].includes(destino.donde)) return error('Elegí dónde sale: canal o chat de cada uno.')
    const cuenta = EQUIPO.find((p) => p.id === Number(b.cuenta_id))
    if (!cuenta) return error('Elegí a nombre de quién sale.')
    const destinos = destinosDe(destino)
    if (!destinos.length) return error('No hay a quién mandarle: elegí canales, ofertas o clientes.')
    const cuando = b.cuando ? new Date(b.cuando) : new Date()
    if (Number.isNaN(cuando.getTime())) return error('La fecha no es válida.')
    const aQuien = destino.donde === 'canal'
      ? destinos.map((d) => `#${sinEmoji(d.canal.nombre)}`).join(', ')
      : `chat de cada uno · ${[...(destino.ofertas || []).map((o) => OFERTAS.find((x) => x.id === o)?.nombre || o), ...(destino.clientes?.length ? [`${destino.clientes.length} sueltos`] : [])].join(', ')}`
    const envio = {
      id: nuevoId(), cuenta_id: cuenta.id, cuenta: cuenta.nombre, texto: mensajes.join('\n\n'), a_quien: aQuien, cuando: cuando.toISOString().replace('Z', '+00:00'),
      estado: 'pendiente', enviados: 0, error: null, globitos: mensajes.length, destino, mensajes,
    }
    ENVIOS = [envio, ...ENVIOS]
    const ya = cuando <= new Date()
    if (!ya) return json({ id: envio.id, ya }, 201)
    return json({ id: envio.id, ya, enviados: despachar(envio) }, 201)
  }],
  ['DELETE', /^\/api\/seguimiento\/envios\/(\d+)$/, ([, id], opciones) => {
    const sinPermiso = mal(opciones)
    if (sinPermiso) return sinPermiso
    const envio = ENVIOS.find((e) => e.id === Number(id))
    if (!envio || envio.estado !== 'pendiente') return error('Ya salió o no existe.', 409)
    envio.estado = 'cancelado'
    return json({ ok: true })
  }],

  // ---- Piloto
  ['GET', /^\/api\/piloto\/modo$/, (_, opciones) => {
    const sinPermiso = soloEquipo(opciones)
    if (sinPermiso) return sinPermiso
    return json({ ...CONFIG_PILOTO[quien(opciones)], bloqueables: BLOQUEABLES })
  }],
  ['PUT', /^\/api\/piloto\/modo$/, (_, opciones) => {
    const sinPermiso = soloEquipo(opciones)
    if (sinPermiso) return sinPermiso
    const { modo, bloqueados } = cuerpo(opciones)
    if (modo != null && !['apagado', 'borrador', 'automatico'].includes(modo)) return error('El modo tiene que ser apagado, borrador o automatico.')
    if (bloqueados != null && bloqueados.some((b) => !BLOQUEABLES.some((x) => x.id === b))) return error('Hay un tema que no existe.')
    const config = CONFIG_PILOTO[quien(opciones)]
    if (modo != null) config.modo = modo
    if (bloqueados != null) config.bloqueados = [...new Set(bloqueados)]
    return json({ ...config })
  }],
  ['GET', /^\/api\/piloto\/canales\/(\d+)$/, ([, id], opciones) => {
    const sinPermiso = soloEquipo(opciones)
    if (sinPermiso) return sinPermiso
    const canal = canalVisible(opciones, id)
    if (!canal) return sinCanal()
    const config = CONFIG_PILOTO[quien(opciones)]
    const b = config.modo === 'apagado' ? null : BORRADORES.find((x) => x.canal_id === canal.id && x.estado === 'pendiente')
    const borrador = b ? { ...b, mio: b.admin_id === persona(opciones).id } : null
    return json({ borrador, marcas: MARCAS[canal.id] || {}, ...config })
  }],
  ['POST', /^\/api\/piloto\/borradores\/(\d+)\/enviar$/, ([, id], opciones) => {
    const sinPermiso = soloEquipo(opciones)
    if (sinPermiso) return sinPermiso
    const b = BORRADORES.find((x) => x.id === Number(id))
    if (!b || b.estado !== 'pendiente') return noEncontrado(SIN_BORRADOR)
    const dado = cuerpo(opciones).texto
    const texto = String(dado ?? b.texto).trim()
    if (!texto) return error('El mensaje está vacío.')
    b.estado = texto === b.texto ? 'enviado' : 'editado'
    const mensaje = publicar(b.canal_id, persona(opciones), texto)
    emitir({ tipo: 'mensaje', mensaje })
    emitir({ tipo: 'piloto', canal_id: b.canal_id })
    return json(mensaje)
  }],
  ['POST', /^\/api\/piloto\/borradores\/(\d+)\/descartar$/, ([, id], opciones) => {
    const sinPermiso = soloEquipo(opciones)
    if (sinPermiso) return sinPermiso
    const b = BORRADORES.find((x) => x.id === Number(id))
    if (!b || b.estado !== 'pendiente') return noEncontrado(SIN_BORRADOR)
    b.estado = 'descartado'
    emitir({ tipo: 'piloto', canal_id: b.canal_id })
    return json({ ok: true })
  }],

  // ---- Onboarding del equipo del cliente
  ['GET', /^\/api\/onboarding-equipo\/pendiente$/, () => json({ pendiente: null })],
  ['POST', /^\/api\/onboarding-equipo$/, () => json({ ok: true })],
  ['GET', /^\/api\/onboarding-equipo\/cliente\/(\d+)$/, ([, id], opciones) => {
    if (!esEquipo(opciones)) return prohibido('Acceso denegado.')
    return json({ miembros: miembrosDe(Number(id)).map(sinInterno) })
  }],
  ['POST', /^\/api\/onboarding-equipo\/miembro\/(\d+)$/, ([, id], opciones) => {
    if (!esEquipo(opciones)) return prohibido('Acceso denegado.')
    const m = buscarMiembro(Number(id))
    if (!m) return noEncontrado('Ese miembro ya no está en el equipo.')
    if (!m.estado) Object.assign(m, { estado: 'pedido', pedido_en: iso(0) })
    return json({ miembros: miembrosDe(m.cliente_id).map(sinInterno) })
  }],
  ['DELETE', /^\/api\/onboarding-equipo\/miembro\/(\d+)$/, ([, id], opciones) => {
    if (!esEquipo(opciones)) return prohibido('Acceso denegado.')
    const m = buscarMiembro(Number(id))
    if (!m || !m.estado) return noEncontrado('No hay pedido.')
    if (m.estado === 'completado') return error('Ya lo completó.', 409)
    Object.assign(m, { estado: null, pedido_en: null })
    return json({ miembros: miembrosDe(m.cliente_id).map(sinInterno) })
  }],

  // ---- Leverage
  ['POST', /^\/api\/leverage\/autorizar$/, (_, opciones) => {
    if (!esEquipo(opciones)) return prohibido('Solo el equipo de ATV conecta ATV Leverage.')
    const { vuelta, estado } = cuerpo(opciones)
    if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}\/classroom\/vuelta$/.test(vuelta || '')) return error('La vuelta tiene que ser ATV Leverage en esta misma compu.')
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(estado || '')) return error('El pedido de Leverage vino incompleto. Probá de nuevo desde Leverage.')
    const yo = persona(opciones)
    const codigo = crypto.randomUUID().replace(/-/g, '')
    return json({ url: `${vuelta}?codigo=${codigo}&estado=${estado}`, persona: { id: yo.id, nombre: yo.nombre, rol: yo.rol, area: yo.area } })
  }],

  // ---- Notificaciones push (no hay servicio de avisos: solo se simula que se anota)
  // Clave pública de ejemplo (la del codelab de web-push): es un punto P-256 válido para que subscribe() no falle.
  ['GET', /^\/api\/push\/clave$/, () => json({ clave: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', activo: true })],
  ['POST', /^\/api\/push\/suscripcion$/, () => json({ ok: true })],
  ['POST', /^\/api\/push\/baja$/, () => json({ ok: true })],
  ['POST', /^\/api\/push\/prueba$/, () => json({ enviados: 1 })],
]

// ---------------------------------------------------------------- Helpers que usan las rutas
function nuevoCanalGrupo(nombre, descripcion, roles, creadoPor) {
  const orden = Math.max(0, ...CANALES.filter((c) => c.orden != null).map((c) => c.orden)) + 1
  return {
    id: nuevoId(), tipo: 'grupo', nombre, con: null, descripcion, cliente: null, bloqueado: false, ultimo: null, no_leidos: 0, menciones: 0,
    esperando_desde: null, roles, creado_por: creadoPor, orden, inactivo: false, pausa: false, vencido: false, archivo: null, puede_administrar: true,
  }
}
function canalDelChat(id) {
  const c = canalPorId(id)
  return c && c.tipo === 'cliente' && c.cliente ? c : null
}
function sinInterno({ cliente_id, ...resto }) { // eslint-disable-line no-unused-vars
  return resto
}
