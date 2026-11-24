// Responde los pedidos a /api con datos de prueba (ver datos.js).
// Solo se importa cuando VITE_MOCK_API=1: en cualquier otro caso este archivo
// ni siquiera entra al bundle.

import { CANALES, CHATS_DEL_COACH, CLIENTE, COACH, EQUIPO, MENSAJES, NO_LEIDOS, USUARIO } from './datos'
import { clasesParaEnviar, detalleClase, detallePrograma, listaProgramas, marcarProgreso, sopsClassroom } from './classroom'
import { marcarPasoRoadmap, roadmapDe, toolsDelCliente, toolsDelEquipo } from './extras'

// Una demora chica para que se vean los estados de carga mientras se diseña.
const DEMORA_MS = 140

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

const sinContenido = () => new Response(null, { status: 204 })

const cuerpo = (opciones) => {
  try {
    return opciones?.body ? JSON.parse(opciones.body) : {}
  } catch {
    return {}
  }
}

let proximoId = 9000

const AUTORES = {
  admin: { tipo: 'equipo', id: USUARIO.usuario_id, nombre: USUARIO.nombre, foto_url: null, rol: USUARIO.rol, area: 'Marketing' },
  coach: { tipo: 'equipo', id: COACH.usuario_id, nombre: COACH.nombre, foto_url: null, rol: COACH.rol, area: 'Fulfillment' },
  cliente: { tipo: 'cliente', id: CLIENTE.usuario_id, nombre: CLIENTE.nombre, foto_url: null, rol: null, area: null },
}

const crearMensaje = (canalId, datos, sesion = 'admin') => {
  const autor = AUTORES[sesion]
  const respondido = datos.respuesta_a ? (MENSAJES[canalId] || []).find((m) => m.id === datos.respuesta_a) : null
  const nuevo = {
    id: (proximoId += 1),
    canal_id: canalId,
    autor,
    texto: datos.texto ?? '',
    adjuntos: [],
    borrado: false,
    editado: false,
    respuesta_a: respondido ? { id: respondido.id, autor_nombre: respondido.autor.nombre, texto: respondido.texto } : null,
    reacciones: [],
    creado_en: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    origen: null,
    menciones: datos.menciones || [],
    tildes: [],
  }
  MENSAJES[canalId] = [...(MENSAJES[canalId] || []), nuevo]
  const canal = CANALES.find((c) => c.id === canalId)
  if (canal) canal.ultimo = { texto: nuevo.texto.slice(0, 90), autor_nombre: autor.nombre, de: autor.tipo, creado_en: nuevo.creado_en }
  return nuevo
}

const REGLAS_VOZ = [{ id: 1, texto: 'Más corto: una o dos líneas.', creado_en: '2026-11-20T15:00:00Z' }]

// Tres sesiones de prueba, según el email con el que entrás:
//   - dice "cliente" → Alan Klein, cliente del plan Boost
//   - dice "coach"   → Lucho Vicente, del equipo pero sin ser admin
//   - cualquier otro → Laureano Sierra, admin
// Se distinguen por el token, que la app manda en cada pedido.
const TOKENS = { admin: 'mock-token', coach: 'mock-token-coach', cliente: 'mock-token-cliente' }
const quien = (opciones) => {
  const token = String(opciones?.headers?.Authorization || '').replace(/^Bearer /, '')
  return Object.keys(TOKENS).find((k) => TOKENS[k] === token) || 'admin'
}
const PERFILES = { admin: { ...USUARIO, fecha_vencimiento: null }, coach: COACH, cliente: CLIENTE }
const perfil = (opciones) => PERFILES[quien(opciones)]
const login = (opciones) => {
  const email = String(cuerpo(opciones).email || '').toLowerCase()
  const sesion = email.includes('cliente') ? 'cliente' : email.includes('coach') ? 'coach' : 'admin'
  return { token: TOKENS[sesion], ...PERFILES[sesion] }
}

// Lo que ve cada uno en Mensajes:
//   - el cliente: los canales de la comunidad (no el del equipo) y su canal privado
//   - el coach: los canales de grupo y solo sus chats de clientes; no administra canales
//     y no tiene los directos del admin
//   - el admin: todo
// "puede_administrar" (el engranaje para editar un canal) se calcula por sesión, como
// mensajeria_service._puede_administrar: el admin, los canales de grupo y anuncios; el coach, solo los
// grupos que creó (en el mock, ninguno); el cliente, nunca.
const puedeAdministrar = (sesion, c) => sesion === 'admin' && (c.tipo === 'grupo' || c.tipo === 'anuncios')
// Quién escribe dónde, como mensajeria_service._puede_escribir: el equipo en todo (menos los archivos
// viejos de Discord); el cliente en los grupos, sus privados y su propio canal, pero no en anuncios.
const puedeEscribir = (sesion, c) => {
  if (c.tipo === 'archivo') return false
  if (sesion !== 'cliente') return true
  return c.tipo === 'grupo' || c.tipo === 'privado' || (c.tipo === 'cliente' && c.cliente?.id === CLIENTE.usuario_id)
}
const canalesDe = (opciones) => {
  const sesion = quien(opciones)
  let lista
  if (sesion === 'cliente') {
    lista = CANALES.filter(
      (c) => ((c.tipo === 'grupo' || c.tipo === 'anuncios') && !c.nombre.includes('equipo')) || c.id === 41 || c.tipo === 'privado',
    )
  } else if (sesion === 'coach') {
    lista = CANALES.filter((c) => c.tipo === 'grupo' || c.tipo === 'anuncios' || CHATS_DEL_COACH.includes(c.id))
  } else {
    lista = CANALES.filter((c) => c.tipo !== 'privado')
  }
  return lista.map((c) => ({ ...c, puede_administrar: puedeAdministrar(sesion, c) }))
}

// Privados entre clientes. En el backend (mensajeria_service.buscar_clientes) un cliente solo encuentra
// a otros clientes que escribieron en un canal de la comunidad que ve, desde 3 letras y hasta 5; nunca al
// equipo (a ATV se le escribe en su canal). Acá se toman los clientes del mock como esa comunidad.
const buscarClientes = (url) => {
  const normal = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = normal(new URL(url, window.location.origin).searchParams.get('q') || '').trim()
  if (q.length < 3) return []
  return CANALES.filter((c) => c.tipo === 'cliente' && c.cliente && c.cliente.id !== CLIENTE.usuario_id && normal(c.cliente.nombre).includes(q))
    .slice(0, 5)
    .map((c) => ({ id: c.cliente.id, nombre: c.cliente.nombre }))
}
const abrirPrivado = (opciones) => {
  const clienteId = Number(cuerpo(opciones).cliente_id)
  const ya = CANALES.find((c) => c.tipo === 'privado' && c.con?.id === clienteId)
  if (ya) return ya
  const otro = CANALES.find((c) => c.cliente?.id === clienteId)?.cliente
  if (!otro) return null
  const canal = {
    id: (proximoId += 1),
    tipo: 'privado',
    nombre: otro.nombre,
    con: { id: otro.id, tipo: 'cliente', nombre: otro.nombre, foto_url: null },
    descripcion: null,
    cliente: null,
    bloqueado: false,
    ultimo: null,
    no_leidos: 0,
    menciones: 0,
    esperando_desde: null,
    roles: null,
    creado_por: null,
    orden: null,
    inactivo: false,
    pausa: false,
    vencido: false,
    archivo: null,
    puede_administrar: false,
  }
  CANALES.push(canal)
  MENSAJES[canal.id] = []
  return canal
}

const CUENTA_CLIENTE = {
  tipo: 'cliente',
  nombre: CLIENTE.nombre,
  nombre_cuenta: CLIENTE.nombre,
  email: CLIENTE.email,
  foto_url: null,
  foto_propia: false,
  plan_nombre: 'Boost',
  dias_restantes: CLIENTE.dias_restantes,
  duracion_dias: 180,
  fecha_inicio: '2026-08-23',
  fecha_vencimiento: CLIENTE.fecha_vencimiento,
  responsable: 'Alejandro',
  estado: 'vigente',
  estado_texto: 'Vigente',
  miembro: null,
}
const CUENTA_EQUIPO = { tipo: 'equipo', rol: 'admin', rol_nombre: 'Administrador', area: 'sistemas', nombre: USUARIO.nombre, email: USUARIO.email, foto_url: null, foto_propia: false }
const CUENTA_COACH = { tipo: 'equipo', rol: 'coach', rol_nombre: 'Coach', area: 'fulfillment', nombre: COACH.nombre, email: COACH.email, foto_url: null, foto_propia: false }
const CUENTAS = { admin: CUENTA_EQUIPO, coach: CUENTA_COACH, cliente: CUENTA_CLIENTE }

/** Cada ruta: [método, patrón, (coincidencia, opciones, url) => Response]. */
const RUTAS = [
  ['GET', /^\/api\/auth\/config$/, () => json({ google_client_id: null, mensajes_clientes: true })],
  ['POST', /^\/api\/auth\/(login|google)$/, (_, opciones) => json(login(opciones))],
  ['POST', /^\/api\/auth\/logout$/, () => sinContenido()],
  ['GET', /^\/api\/auth\/me$/, (_, opciones) => json(perfil(opciones))],

  // Classroom
  ['GET', /^\/api\/programas$/, () => json(listaProgramas())],
  ['GET', /^\/api\/programas\/sops$/, () => json(sopsClassroom())],
  ['GET', /^\/api\/programas\/(\d+)$/, ([, id]) => {
    const programa = detallePrograma(Number(id))
    return programa ? json(programa) : json({ detail: 'Módulo no encontrado' }, 404)
  }],
  ['GET', /^\/api\/clases\/(\d+)$/, ([, id]) => {
    const clase = detalleClase(Number(id))
    return clase ? json(clase) : json({ detail: 'Clase no encontrada' }, 404)
  }],
  ['PUT', /^\/api\/clases\/(\d+)\/progreso$/, ([, id], opciones) => json(marcarProgreso(Number(id), cuerpo(opciones).completado))],
  ['GET', /^\/api\/acciones$/, () => json({ acciones: [], sugeridas: [] })],

  // Tools: el cliente ve las de su plan y las pagas con candado; el equipo, todas.
  ['GET', /^\/api\/tools$/, (_, opciones) => json(quien(opciones) === 'cliente' ? toolsDelCliente() : toolsDelEquipo())],

  // Roadmap: el cliente ve el suyo en /api/roadmap; el equipo, el de cada cliente. El mock tiene uno solo
  // (el de Alan Klein) y lo muestra para cualquier cliente.
  ['GET', /^\/api\/roadmap$/, () => json(roadmapDe({ id: CLIENTE.usuario_id, nombre: CLIENTE.nombre, plan: 'boost' }))],
  ['GET', /^\/api\/roadmap\/clientes\/(\d+)$/, ([, id]) => {
    const canal = CANALES.find((c) => c.cliente?.id === Number(id))
    return json(roadmapDe({ id: Number(id), nombre: canal?.cliente.nombre || 'Cliente', plan: canal?.cliente.plan || null }))
  }],
  ['PUT', /^\/api\/roadmap\/docs\/(\d+)\/pasos\/(\d+)$/, ([, docId, pasoId], opciones) => {
    const sesion = quien(opciones)
    const autor = AUTORES[sesion]
    const hecho = Boolean(cuerpo(opciones).hecho)
    if (!marcarPasoRoadmap(Number(docId), Number(pasoId), hecho, { tipo: autor.tipo, id: autor.id, nombre: autor.nombre })) {
      return json({ detail: 'Paso no encontrado' }, 404)
    }
    return json(roadmapDe({ id: CLIENTE.usuario_id, nombre: CLIENTE.nombre, plan: 'boost' }))
  }],

  // Reglas de tu voz (las correcciones de "Qué pensó"), en memoria.
  ['GET', /^\/api\/mensajes\/reglas-voz$/, () => json({ propia: true, reglas: REGLAS_VOZ })],
  ['POST', /^\/api\/mensajes\/reglas-voz$/, (_, opciones) => {
    const regla = { id: (proximoId += 1), texto: cuerpo(opciones).texto || '', creado_en: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') }
    REGLAS_VOZ.unshift(regla)
    return json(regla, 201)
  }],
  ['DELETE', /^\/api\/mensajes\/reglas-voz\/(\d+)$/, ([, id]) => {
    const i = REGLAS_VOZ.findIndex((r) => r.id === Number(id))
    if (i >= 0) REGLAS_VOZ.splice(i, 1)
    return sinContenido()
  }],
  ['POST', /^\/api\/mensajes\/sugerencias\/(\d+)\/(usada|enviada)$/, () => sinContenido()],
  ['GET', /^\/api\/acciones\/clases$/, () => json(clasesParaEnviar())],
  ['POST', /^\/api\/acciones\/clases\/(\d+)\/compartir$/, () => json({ ok: true })],

  // Mi cuenta
  ['GET', /^\/api\/cuenta$/, (_, opciones) => json(CUENTAS[quien(opciones)])],
  ['GET', /^\/api\/cuenta\/equipo$/, () => json({ maximo: 2, miembros: [] })],
  ['GET', /^\/api\/cuenta\/dispositivos$/, () => json([
    { id: 1, equipo: 'Windows', navegador: 'Chrome', ciudad: 'Córdoba', pais: 'Argentina', ultima: new Date().toISOString(), actual: true },
    { id: 2, equipo: 'iPhone', navegador: 'Safari', ciudad: 'Córdoba', pais: 'Argentina', ultima: new Date(Date.now() - 864e5).toISOString(), actual: false },
  ])],
  ['GET', /^\/api\/cuenta\/voz$/, () => json({ elegida: 3, propia: true, opciones: EQUIPO.map((p) => ({ id: p.id, nombre: p.nombre, foto_url: null })) })],
  ['GET', /^\/api\/cuenta\/fathom$/, () => json({ conectado: false, llamadas: 0, ultima_sync: null, error: null })],
  ['GET', /^\/api\/admin\/equipos-clientes$/, () => json({ planes: [{ plan: 'high', maximo: 3, miembros: 2 }, { plan: 'boost', maximo: 2, miembros: 1 }] })],

  ['GET', /^\/api\/mensajes\/habilitada$/, () => json({ habilitada: true })],
  ['GET', /^\/api\/mensajes\/no-leidos$/, () => json(NO_LEIDOS)],
  ['GET', /^\/api\/mensajes\/canales$/, (_, opciones) => json(canalesDe(opciones))],
  ['GET', /^\/api\/mensajes\/buscar-clientes$/, (_, __, url) => json(buscarClientes(url))],
  ['POST', /^\/api\/mensajes\/privados$/, (_, opciones) => {
    const canal = abrirPrivado(opciones)
    return canal ? json(canal, 201) : json({ detail: 'Cliente no encontrado' }, 404)
  }],
  ['GET', /^\/api\/mensajes\/equipo$/, () => json(EQUIPO)],
  ['GET', /^\/api\/mensajes\/roles$/, () => json([])],

  [
    'GET',
    /^\/api\/mensajes\/canales\/(\d+)\/mensajes$/,
    ([, id], opciones) => {
      const canal = CANALES.find((c) => c.id === Number(id))
      if (!canal) return json({ detail: 'Canal no encontrado' }, 404)
      const mensajes = MENSAJES[canal.id] || []
      const ultimoId = mensajes.length ? mensajes[mensajes.length - 1].id : 0
      return json({
        canal: { id: canal.id, tipo: canal.tipo, nombre: canal.nombre, descripcion: canal.descripcion },
        mensajes,
        hay_mas: false,
        lecturas: { cliente: ultimoId, equipo: ultimoId },
        puede_escribir: puedeEscribir(quien(opciones), canal),
      })
    },
  ],
  [
    'POST',
    /^\/api\/mensajes\/canales\/(\d+)\/leido$/,
    ([, id]) => {
      const canal = CANALES.find((c) => c.id === Number(id))
      if (canal) {
        canal.no_leidos = 0
        canal.menciones = 0
      }
      return json({})
    },
  ],
  ['POST', /^\/api\/mensajes\/canales\/(\d+)\/mensajes$/, ([, id], opciones) => {
    const mensaje = crearMensaje(Number(id), cuerpo(opciones), quien(opciones))
    // Como el servidor real: el mensaje nuevo también sale por el socket. Así llega al chat
    // aunque lo mande otra parte de la pantalla (las acciones rápidas, por ejemplo).
    emitir({ tipo: 'mensaje', mensaje })
    return json(mensaje, 201)
  }],
  ['GET', /^\/api\/mensajes\/canales\/(\d+)\/participantes$/, () => json([])],
  ['GET', /^\/api\/mensajes\/canales\/(\d+)\/buscar$/, ([, id], __, url) => {
    const normal = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const q = normal(new URL(url, window.location.origin).searchParams.get('q') || '').trim()
    if (q.length < 2) return json({ total: 0, resultados: [] })
    const hallados = (MENSAJES[Number(id)] || []).filter((m) => !m.borrado && normal(m.texto).includes(q)).reverse()
    return json({
      total: hallados.length,
      resultados: hallados.slice(0, 50).map((m) => ({ id: m.id, texto: m.texto, autor: m.autor, creado_en: m.creado_en })),
    })
  }],

  ['GET', /^\/api\/altas\/senas$/, () => json([])],
  ['GET', /^\/api\/seguimiento\/acceso$/, () => json({ puede: false })],
]

const avisadas = new Set()

/**
 * Devuelve un Response si la ruta es de la API, o null para dejar pasar el pedido.
 * Las rutas sin mock contestan 404, igual que el backend con una ruta desconocida:
 * los componentes ya saben manejar ese caso. Un {} con la forma equivocada no.
 */
export async function responderMock(url, opciones = {}) {
  const { pathname } = new URL(url, window.location.origin)
  if (!pathname.startsWith('/api/')) return null

  const metodo = (opciones.method || 'GET').toUpperCase()
  await new Promise((listo) => setTimeout(listo, DEMORA_MS))

  for (const [m, patron, responder] of RUTAS) {
    if (m !== metodo) continue
    const coincidencia = pathname.match(patron)
    if (coincidencia) return responder(coincidencia, opciones, url)
  }

  const clave = `${metodo} ${pathname.replace(/\d+/g, ':id')}`
  if (!avisadas.has(clave)) {
    avisadas.add(clave)
    console.info(`[mock] Sin datos para ${clave}: responde 404. Sumalo en src/api/mock/handler.js si la pantalla lo necesita.`)
  }
  return json({ detail: 'Sin datos de prueba para esta ruta' }, 404)
}

// La sugerencia del Tab (api/mensajes.js → pedirSugerencia) usa fetch directo porque llega de a
// pedazos. Se simula igual que el backend: el "porqué" en base64 en X-Sugerencia-Porque y el texto
// en un stream. Solo se intercepta esa ruta; todo lo demás sigue al fetch real.
const fetchReal = window.fetch.bind(window)
const base64 = (texto) => btoa(String.fromCharCode(...new TextEncoder().encode(texto)))
window.fetch = (entrada, opciones) => {
  const url = typeof entrada === 'string' ? entrada : entrada?.url || ''
  const sugerir = new URL(url, window.location.origin).pathname.match(/^\/api\/mensajes\/canales\/(\d+)\/sugerir$/)
  if (!sugerir) return fetchReal(entrada, opciones)
  const canalId = Number(sugerir[1])
  const borrador = cuerpo(opciones).borrador || ''
  const conversacion = MENSAJES[canalId] || []
  const ultimoMensaje = conversacion[conversacion.length - 1]
  const delCliente = ultimoMensaje?.autor?.tipo === 'cliente'
  const porque = borrador.trim()
    ? { modo: 'completa', que: 'Termina el mensaje que empezaste a escribir.', retoma: null, pregunta_abierta: null }
    : delCliente
      ? { modo: 'responde', que: 'El cliente escribió último: respondé lo que pide, corto y con un próximo paso.', retoma: ultimoMensaje.texto, pregunta_abierta: null }
      : {
          modo: 'seguimiento',
          que: 'Es un seguimiento: el último mensaje es del equipo y el cliente no contestó hace 2 días.',
          retoma: ultimoMensaje?.texto || null,
          pregunta_abierta: '¿Qué objetivos te pusiste esta semana?',
        }
  const sugerencia = borrador.trim()
    ? ' y lo vemos en la llamada del jueves.'
    : delCliente
      ? 'Buenísimo! Te espero en la clase en vivo, traé tu duda puntual así la resolvemos ahí.'
      : 'Alan, ¿cómo venís con el SOP de esta semana? Si te trabaste en algún paso, armamos una llamada corta y lo destrabamos.'
  const pedazos = sugerencia.match(/.{1,12}/g) || []
  const cuerpoStream = new ReadableStream({
    async start(controlador) {
      for (const pedazo of pedazos) {
        if (opciones?.signal?.aborted) break
        await new Promise((listo) => setTimeout(listo, 45))
        controlador.enqueue(new TextEncoder().encode(pedazo))
      }
      controlador.close()
    },
  })
  return new Promise((listo) => setTimeout(listo, DEMORA_MS)).then(
    () =>
      new Response(cuerpoStream, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Sugerencia-Id': String((proximoId += 1)),
          'X-Sugerencia-Porque': base64(JSON.stringify({ ...porque, voz: { de: USUARIO.nombre }, propia: true })),
        },
      }),
  )
}

// El chat en vivo usa un WebSocket en /api/ws. Sin backend reintentaría para siempre
// y llenaría la consola. Se reemplaza solo ese: Vite usa otro WebSocket para recargar
// la página al guardar, y ese tiene que seguir andando.
const WebSocketReal = window.WebSocket
const abiertos = new Set()
function emitir(payload) {
  for (const socket of abiertos) socket.recibir(payload)
}

class WebSocketDePrueba extends EventTarget {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor(url) {
    super()
    this.url = url
    this.readyState = WebSocketDePrueba.CONNECTING
    this.onopen = null
    this.onmessage = null
    this.onclose = null
    this.onerror = null
    setTimeout(() => {
      if (this.readyState !== WebSocketDePrueba.CONNECTING) return
      this.readyState = WebSocketDePrueba.OPEN
      abiertos.add(this)
      const evento = new Event('open')
      this.dispatchEvent(evento)
      this.onopen?.(evento)
    }, 0)
  }

  // Imita el saludo del servidor: auth → listo (queda "En vivo") y ping → pong
  // (sin pong, MensajeriaContext da la conexión por muerta al minuto y la rehace).
  send(datos) {
    let evento
    try {
      evento = JSON.parse(datos)
    } catch {
      return
    }
    if (evento.tipo === 'auth') this.recibir({ tipo: 'listo' })
    if (evento.tipo === 'ping') this.recibir({ tipo: 'pong' })
  }

  // Lo que "manda el servidor" a esta conexión.
  recibir(payload) {
    setTimeout(() => {
      if (this.readyState !== WebSocketDePrueba.OPEN) return
      const mensaje = new MessageEvent('message', { data: JSON.stringify(payload) })
      this.dispatchEvent(mensaje)
      this.onmessage?.(mensaje)
    }, 0)
  }

  close(code = 1000, reason = '') {
    if (this.readyState === WebSocketDePrueba.CLOSED) return
    this.readyState = WebSocketDePrueba.CLOSED
    abiertos.delete(this)
    const evento = new CloseEvent('close', { code, reason, wasClean: true })
    this.dispatchEvent(evento)
    this.onclose?.(evento)
  }
}

window.WebSocket = new Proxy(WebSocketReal, {
  construct(Original, args) {
    const destino = String(args[0] ?? '')
    return destino.includes('/api/ws') ? new WebSocketDePrueba(destino) : new Original(...args)
  },
})
