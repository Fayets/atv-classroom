// Datos de prueba de la parte de mensajería que no vive en datos.js: alertas (menciones), contexto del
// cliente, onboarding del equipo, acciones rápidas, seguimiento y piloto. Las formas siguen al backend
// (mensajeria_service, contexto_service, onboarding_equipo_service, acciones_service, seguimiento_service,
// piloto_service). Las fechas son relativas a hoy para que siempre se vean frescas.

import { dia, iso } from './util'

// ---------------------------------------------------------------- Alertas (menciones)
// Quién fue etiquetado (admin_id), dónde y desde cuándo. Solo cuentan los chats de clientes.
// `respondida_en` null = pendiente. El mock arma el resto (autor, texto, minutos) desde el mensaje.
export const MENCIONES = [
  { id: 1, admin_id: 3, canal_id: 43, mensaje_id: 201, creado_en_min: 140, respondida_en_min: null },
  { id: 2, admin_id: 3, canal_id: 45, mensaje_id: 301, creado_en_min: 70, respondida_en_min: null },
  { id: 3, admin_id: 3, canal_id: 20, mensaje_id: null, texto: 'Che @Laureano, ¿me podés pasar el SOP de cierre de ventas?', autor: { tipo: 'cliente', id: 120, nombre: 'Martín Ibarra' }, creado_en_min: 2900, respondida_en_min: 2840 },
  { id: 4, admin_id: 3, canal_id: 31, mensaje_id: null, texto: '@Laureano mirá el último ad que subimos y decime qué opinás', autor: { tipo: 'cliente', id: 131, nombre: 'Paulina Taurian' }, creado_en_min: 4300, respondida_en_min: 4270 },
  { id: 5, admin_id: 7, canal_id: 50, mensaje_id: null, texto: 'Hola @Lucho, subí el video y me gustaría que lo veas antes del jueves', autor: { tipo: 'cliente', id: 150, nombre: 'Facundo Martinez' }, creado_en_min: 260, respondida_en_min: null },
  { id: 6, admin_id: 7, canal_id: 41, mensaje_id: null, texto: '@Lucho ¿la clase de Sistemas queda grabada?', autor: { tipo: 'cliente', id: 141, nombre: 'Alan Klein' }, creado_en_min: 8700, respondida_en_min: 8640 },
]

// ---------------------------------------------------------------- Contexto del cliente
const pila = (n) => (n || '').split(' ')[0]

/** Los compromisos de un cliente. Las claves cumplen el formato del backend (ch:N o ll:N:lado:N). */
function compromisosBase(id, nombre) {
  const n = pila(nombre)
  return [
    {
      clave: `ch:${id * 10 + 1}`, lado: 'atv', texto: `Pasarle a ${n} el SOP de anuncios que pidió`, cita: ['¿Me pasan el SOP de anuncios así lo armo esta semana?'],
      fuente: ['chat'], origen: 'Pedido en el chat', cerrable: true, plazo: dia(-3), desde: dia(-10),
    },
    {
      clave: `ll:${id * 10 + 1}:cliente:0`, lado: 'cliente', texto: 'Grabar 3 videos de prueba para el anuncio', cita: ['Me comprometo a grabar tres videos antes del viernes.'],
      fuente: ['llamada'], origen: 'Llamada con Alejandro', cerrable: true, plazo: dia(4), desde: dia(-6),
    },
    {
      clave: `ll:${id * 10 + 1}:atv:0`, lado: 'atv', texto: 'Revisar la landing y mandarle el feedback', cita: ['Yo te reviso la landing y te mando feedback esta semana.'],
      fuente: ['llamada'], origen: 'Llamada con Alejandro', cerrable: true, plazo: dia(2), desde: dia(-6),
    },
    {
      clave: `rm:${id}:1`, lado: 'cliente', texto: 'Definir el avatar con las tres objeciones principales', cita: [],
      fuente: ['roadmap'], origen: 'Roadmap «Primeras 3 ventas»', cerrable: false, plazo: dia(7), desde: dia(-6),
    },
    {
      clave: `rm:${id}:2`, lado: 'atv', texto: 'Armar el roadmap del mes siguiente', cita: [],
      fuente: ['roadmap'], origen: 'Roadmap «Primeras 3 ventas»', cerrable: false, plazo: null, desde: dia(-6), cerrado: true,
    },
  ]
}

const estadoDe = (c, hoy) => (c.cerrado ? 'cerrado' : c.plazo && c.plazo < hoy ? 'vencido' : 'abierto')
const diasEntre = (a, b) => Math.round((new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 864e5)

/**
 * El "pase de guardia" de un cliente, como contexto_service.armar.
 * `cliente` = { id, nombre, plan, vence, responsable }; `cierres` = Map clave → { por, en } de lo cerrado a mano.
 */
export function contextoDe(cliente, cierres) {
  const { id, nombre, plan, vence } = cliente
  const n = pila(nombre)
  const hoy = dia(0)
  const compromisos = compromisosBase(id, nombre).map((c) => {
    const cierre = c.cerrable ? cierres.get(c.clave) : null
    const base = cierre ? { ...c, cerrado: true, cerrado_por: cierre.por, cerrado_en: cierre.en } : c
    const estado = estadoDe(base, hoy)
    const enPanel = estado === 'abierto' || (estado === 'vencido' && diasEntre(hoy, base.plazo) <= 14)
    return { ...base, estado, en_panel: enPanel }
  })
  const orden = { vencido: 0, abierto: 1, cerrado: 2 }
  compromisos.sort((a, b) => orden[a.estado] - orden[b.estado] || (a.plazo || '9999').localeCompare(b.plazo || '9999') || a.desde.localeCompare(b.desde))

  const eventos = [
    {
      id: 'alta', tipo: 'alta', fecha: dia(-75), momento: iso(75 * 1440), titulo: 'Entró a ATV y completó el onboarding',
      items: ['Vende mentorías de ventas para coaches', 'Factura entre 2k y 5k USD por mes', 'Equipo: él y una asistente'], fuente: ['onboarding'], adjuntos: [],
    },
    {
      id: `ll:${id}0`, tipo: 'llamada', fecha: dia(-30), momento: iso(30 * 1440), titulo: 'Primer 1 a 1 con Alejandro', quien: 'Alejandro', duracion: 42,
      url: 'https://fathom.video/share/demo-primera', temas: ['Cómo está armada su oferta hoy', 'Dónde se le caen las ventas', 'Qué canal de captación le funciona'],
      decisiones: [{ texto: 'Arrancar por mejorar la llamada de venta antes de pagar más tráfico', cita: 'Prefiero ordenar la llamada de venta primero, antes de meterle más plata a anuncios.' }],
      inquietudes: [{ texto: 'Le da miedo grabar videos mostrando la cara', cita: 'Me cuesta un montón ponerme frente a la cámara.' }],
      resumida: true, coordinacion: 2, fuente: ['llamada'], adjuntos: [{ tipo: 'fathom', url: 'https://fathom.video/share/demo-primera', etiqueta: 'Grabación' }],
    },
    {
      id: `ll:${id}1`, tipo: 'llamada', fecha: dia(-6), momento: iso(6 * 1440), titulo: '1 a 1 con Alejandro', quien: 'Alejandro', duracion: 35,
      url: 'https://fathom.video/share/demo-segunda', temas: ['Resultados de las dos últimas semanas', 'Guion del anuncio de video', 'Plan para cerrar tres clientes nuevos'],
      decisiones: [{ texto: 'Probar un anuncio de video corto con testimonio', cita: 'Vamos con el video corto de testimonio y vemos cómo responde la audiencia.' }],
      inquietudes: [], resumida: true, coordinacion: 0, fuente: ['llamada'], adjuntos: [{ tipo: 'fathom', url: 'https://fathom.video/share/demo-segunda', etiqueta: 'Grabación' }],
    },
    {
      id: `rm:${id}`, tipo: 'roadmap', fecha: dia(-6), titulo: 'Roadmap «Primeras 3 ventas»', quien: 'Alejandro', area: 'Ventas', hechos: 1, total: 5, fuente: ['roadmap'], adjuntos: [],
    },
    {
      id: `ch:${id * 10 + 5}`, tipo: 'logro', fecha: dia(-20), momento: iso(20 * 1440), titulo: `${n} cerró su primera venta de 497 USD`, cita: ['Cerré mi primera venta de 497 USD, no lo puedo creer.'],
      fuente: ['chat', 'wins'], riesgo: false, adjuntos: [{ tipo: 'mensaje', mensaje_id: 100000 + id, etiqueta: 'Mensaje' }],
    },
    {
      id: `ch:${id * 10 + 6}`, tipo: 'objecion', fecha: dia(-14), momento: iso(14 * 1440), titulo: 'Le cuesta grabar videos frente a cámara', cita: ['Me da vergüenza grabarme, no sé si lo voy a poder sostener.'],
      fuente: ['chat', 'llamada'], riesgo: false, adjuntos: [],
    },
    {
      id: `en:${id}:${dia(-4)}`, tipo: 'entrega', fecha: dia(-4), titulo: 'Completó 2 pasos de «Primeras 3 ventas»',
      items: ['Armó la lista de 30 prospectos', 'Subió el guion de la llamada de venta'], fuente: ['roadmap'], adjuntos: [],
    },
    { id: `si:${dia(-26)}`, tipo: 'silencio', fecha: dia(-26), dias: 8, titulo: 'Sin señales 8 días', estado: 'cerrado', fuente: ['sistema'], adjuntos: [] },
    ...compromisos.map((x) => ({
      id: `cp:${x.clave}`, tipo: 'compromiso', fecha: x.desde, titulo: x.texto, lado: x.lado, plazo: x.plazo, estado: x.estado, cita: x.cita, fuente: x.fuente, adjuntos: [],
    })),
  ]
  eventos.sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.momento || '').localeCompare(a.momento || ''))

  // Arriba de todo solo lo rojo: habló de irse o de pedir la plata.
  const alertas =
    id === 145
      ? [{ nivel: 'rojo', texto: `El ${dia(-3).slice(8, 10)}/${dia(-3).slice(5, 7)} habló de irse o de pedir la plata`, cita: 'Si no veo resultados este mes voy a pedir que me devuelvan la plata.', fecha: iso(3 * 1440) }]
      : []

  const abierto = vence ? `${vence}T00:00:00Z` : null
  return {
    cliente: {
      id, nombre, plan, vence: abierto, desde: iso(75 * 1440),
      perfil: {
        nicho_texto: 'Mentorías de ventas para coaches', que_vende: 'Programa de 12 semanas para que coaches cierren clientes high ticket',
        etapa: id % 2 ? 'validando' : 'vendiendo', facturacion: '2k a 5k USD por mes', objetivo: 'Cerrar 3 clientes nuevos por mes sin depender de referidos',
        tono_cliente: 'Cercano y directo, escribe corto. Responde rápido a la mañana.',
      },
      atendieron: ['Alejandro', 'Lucas', 'Laureano'],
      ultima_llamada: { fecha: dia(-6), quien: 'Alejandro', duracion: 35 },
      ultimo_mensaje: iso(8),
      negocio: {
        oferta: 'Programa de 12 semanas con llamadas semanales y revisión de llamadas de venta. Precio de 1.500 USD en un pago o 3 cuotas de 590 USD.',
        oferta_periodo: `${dia(-35).slice(0, 7)}`,
        avatar: 'Coaches de negocios con 1 a 3 años de experiencia que ya facturan algo pero dependen de referidos y no tienen un sistema de captación.',
        avatar_periodo: `${dia(-35).slice(0, 7)}`,
      },
    },
    alertas,
    compromisos,
    no_repetir: [{ texto: 'Los anuncios de tráfico frío con oferta directa no le funcionaron', cita: 'Probé tres semanas con anuncios directos y no entró nadie.' }],
    roadmap: { titulo: 'Primeras 3 ventas', hechos: 1, total: 5 },
    eventos,
    llamadas_sin_resumir: 0,
  }
}

// ---------------------------------------------------------------- Onboarding del equipo
// Respuestas de ejemplo (ids de las 49 preguntas de constants/onboardingPreguntas.js).
const RESPUESTAS_EJEMPLO = {
  1: 'Nicolás Paz | +54 9 11 5555-0000 | nico@ejemplo.com',
  2: 'El negocio es de un cliente. Soy su socio operativo y decido sobre ads y ventas.',
  3: 'E',
  5: 'Programa de 12 semanas para coaches que quieren cerrar clientes high ticket.',
}

/** Los miembros del equipo de un cliente (socios o asistentes) con su estado de onboarding, por cliente. */
const MIEMBROS = new Map()
export function miembrosDe(clienteId) {
  if (!MIEMBROS.has(clienteId)) {
    MIEMBROS.set(clienteId, [
      {
        id: clienteId * 10 + 1, cliente_id: clienteId, nombre: 'Nicolás Paz', email: 'nico@ejemplo.com', rol: 'Socio', estado: 'completado',
        pedido_en: iso(12 * 1440), completado_en: iso(10 * 1440), respuestas: RESPUESTAS_EJEMPLO,
      },
      { id: clienteId * 10 + 2, cliente_id: clienteId, nombre: 'Camila Ríos', email: 'camila@ejemplo.com', rol: 'Asistente', estado: null, pedido_en: null, completado_en: null, respuestas: null },
    ])
  }
  return MIEMBROS.get(clienteId)
}
export const buscarMiembro = (miembroId) => [...MIEMBROS.values()].flat().find((m) => m.id === miembroId)

// ---------------------------------------------------------------- Acciones rápidas
const ACCIONES_INICIALES = () => [
  { id: 1, nombre: 'Bienvenida', texto: '{nombre}, ¡bienvenido a ATV! Cualquier duda me escribís por acá 🙌', orden: 0 },
  { id: 2, nombre: 'Pedir un loom', texto: '{nombre}, ¿me mandás un loom de 3 minutos mostrando dónde te trabaste? Así lo vemos juntos.', orden: 1 },
  { id: 3, nombre: 'Recordar la clase', texto: '{nombre}, hoy hay clase en vivo. Traé tu duda y la resolvemos ahí 🎙️', orden: 2 },
]
/** Cada persona del equipo guarda las suyas. */
export const ACCIONES = { admin: ACCIONES_INICIALES(), coach: ACCIONES_INICIALES().slice(0, 2) }
export const AGENDA_SUGERIDA = { nombre: 'Enviar mi agenda', texto: '{nombre}, te dejo mi link para agendar: https://calendly.com/atv/1-a-1', origen: 'Lo sacamos de tus mensajes' }

// ---------------------------------------------------------------- Seguimiento (#seguimiento)
export const OFERTAS = [
  { id: 'high', nombre: 'High Level', planes: ['high', 'advantage'] },
  { id: 'dfy', nombre: 'DFY', planes: ['dfy'] },
  { id: 'boost', nombre: 'Boost', planes: ['boost'] },
  { id: 'mid', nombre: 'Mid level', planes: ['mid'] },
  { id: 'entry', nombre: 'Entry level', planes: ['entry'] },
  { id: 'mentoria', nombre: 'Mentoria', planes: ['mentoria'] },
  { id: '2k', nombre: '2K', planes: ['2k'] },
]
/** Envíos ya hechos (más reciente primero). `cuando` en ISO con zona, como el backend. */
export const ENVIOS_INICIALES = () => [
  {
    id: 1, cuenta_id: 5, cuenta: 'Alejandro', texto: '@everyone hoy tenemos clase en vivo 🔥\n\ntraé la duda que te esté frenando esta semana',
    a_quien: '#general, #boost', cuando: iso(3 * 1440 + 120).replace('Z', '+00:00'), estado: 'enviado', enviados: 2, error: null, globitos: 2,
  },
  {
    id: 2, cuenta_id: 6, cuenta: 'Lucas', texto: 'Te extrañamos en la clase 🙌', a_quien: 'chat de cada uno · Boost',
    cuando: iso(6 * 1440).replace('Z', '+00:00'), estado: 'enviado', enviados: 5, error: null, globitos: 1,
  },
]

// ---------------------------------------------------------------- Piloto
export const BLOQUEABLES = [
  { id: 'plata', nombre: 'Plata y pagos' },
  { id: 'baja_o_queja', nombre: 'Bajas y quejas' },
  { id: 'estrategia', nombre: 'Estrategia y precios' },
  { id: 'no_seguro', nombre: 'Si no está seguro' },
]
export const BLOQUEADOS_DEFECTO = ['plata', 'baja_o_queja', 'no_seguro']

/** Borradores del piloto (los pendientes salen en el chat). Texto y fuentes como los arma piloto_service. */
export const BORRADORES_INICIALES = () => [
  {
    id: 1, canal_id: 41, admin_id: 3, texto: 'Dale Alan! Te paso el link de la clase de ventas y armamos un SOP para tus 3 clientes del mes. ¿Te sirve que lo veamos en la llamada del jueves?',
    tema: 'dato', seguro: true, para_vos: false, motivo: null, fuentes: ['su voz y sus correcciones', 'las clases del classroom'], estado: 'pendiente', creado_en: iso(6),
    voz_nombre: 'Laureano', de_nombre: 'Laureano',
  },
  {
    id: 2, canal_id: 45, admin_id: 3, texto: 'Ema, con tres clientes que ya facturaban, apuntá a los que ya facturan: es donde tu oferta tiene prueba. Te armo el SOP del avatar hoy.',
    tema: 'estrategia', seguro: true, para_vos: true, motivo: 'es una consulta de estrategia', fuentes: ['su voz y sus correcciones', 'lo que sabemos del cliente'], estado: 'pendiente', creado_en: iso(50),
    voz_nombre: 'Laureano', de_nombre: 'Laureano',
  },
]
/** Mensajes que salieron solos: canal → { mensajeId: nombre de la voz }. */
export const MARCAS_INICIALES = { 41: { 104: 'Alejandro' } }
