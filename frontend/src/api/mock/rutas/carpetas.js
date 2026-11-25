// Rutas del mock: carpetas del equipo (Clientes, Contratos, Cierres de mes, Onboardings, Llamadas, Cuellos de
// botella, SOPs solicitados, Biblioteca, altas, live sessions, Nueva clase) y el roadmap del lado del equipo.
// Formas y permisos como los de los controllers del backend. Todo vive en memoria: dura hasta recargar.
// No se mockean (usan fetch directo): GET /api/admin/contratos/:id/pdf y las capturas de los Loom.

import { CANALES, CLIENTE, COACH, EQUIPO, MENSAJES, USUARIO } from '../datos'
import { detallePrograma, listaProgramas } from '../classroom'
import { roadmapDe } from '../extras'
import { cuerpo, dia, iso, json, nuevoId, noEncontrado, params, prohibido, quien, sinContenido } from '../util'
import {
  AREAS_SOP, AVATARES, CONSULTAS, CUELLOS, CUELLO_POR_QUE, DURACION, FORMATOS, MESES, NICHOS, OFERTAS, PLAN_DE_PROGRAMA, PLAN_ONBOARDING,
  PREGUNTAS_TYPEFORM, PRECIO, PROGRAMA, PROPUESTAS, RANGOS_TYPEFORM, ROADMAPS_BIB, SATISFACCION_POR_QUE, SECCIONES_CUELLO, SOPS,
  baseCuello, borradorGenerico, elegir, entre, pizarra, respuestasFormulario, resumenLlamada, semilla, textoDeSecciones, transcripcion,
} from '../datos-carpetas'

const DIA_MS = 864e5
const SESION = {
  admin: { id: USUARIO.usuario_id, nombre: USUARIO.nombre },
  coach: { id: COACH.usuario_id, nombre: COACH.nombre },
  cliente: { id: CLIENTE.usuario_id, nombre: CLIENTE.nombre },
}
const error = (detail, status = 422) => json({ detail }, status)

// Envuelve una ruta con el permiso: 'admin' (solo admin), 'equipo' (admin o coach) o 'cliente'.
const con = (nivel, fn) => (m, op, url) => {
  const q = quien(op)
  if (nivel === 'admin' && q !== 'admin') return prohibido('Acceso denegado.')
  if (nivel === 'equipo' && q === 'cliente') return prohibido('Solo para el equipo.')
  if (nivel === 'cliente' && q !== 'cliente') return prohibido('Solo para clientes.')
  return fn(m, op, url, q)
}

const sinAcentos = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const sumarDias = (f, d) => new Date(new Date(f).getTime() + d * DIA_MS).toISOString().slice(0, 10)
const diasA = (f) => (f ? Math.round((new Date(f).getTime() - Date.now()) / DIA_MS) : null)
const slugDe = (n) => sinAcentos(n).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// ---------------------------------------------------------------- Clientes (carpeta Clientes y ficha)
const clientesCanal = () => CANALES.filter((c) => c.tipo === 'cliente' && c.cliente && c.cliente.plan !== 'sin-plan')
const canalDe = (clienteId) => clientesCanal().find((c) => c.cliente.id === clienteId)
const emailDe = (c) => (c.cliente.id === CLIENTE.usuario_id ? CLIENTE.email : `${slugDe(c.cliente.nombre).replace(/-/g, '.')}@ejemplo.com`)
const modalidad = (id) => (id % 3 === 0 ? 3 : id % 3 === 1 ? 1 : 2)
const inicioDe = (c) => (c.cliente.id === 145 ? dia(-2) : c.cliente.vence ? sumarDias(c.cliente.vence, -(DURACION[c.cliente.plan] || 120)) : dia(-60))

const ESTADOS = { vigente: 'Vigente', proximo_a_vencer: 'Por vencer', vencido: 'Vencido', pausa: 'En pausa', no_va_a_renovar: 'No va a renovar', llamada_recompra: 'Llamada de recompra' }
const estadoDe = (c) => {
  if (c.pausa) return 'pausa'
  if (c.vencido) return 'vencido'
  if (c.inactivo) return 'no_va_a_renovar'
  if (c.cliente.id === 170) return 'llamada_recompra'
  const d = diasA(c.cliente.vence)
  return d !== null && d <= 30 ? 'proximo_a_vencer' : 'vigente'
}

const EQUIPOS = [['Windows', 'Chrome'], ['iPhone', 'Safari'], ['Mac', 'Safari'], ['Android', 'Chrome'], ['Windows', 'Edge']]
const CIUDADES = [['Córdoba', 'Argentina'], ['Buenos Aires', 'Argentina'], ['Rosario', 'Argentina'], ['Bogotá', 'Colombia'], ['Ciudad de México', 'México'], ['Madrid', 'España']]
const DISPOSITIVOS = new Map()
function dispositivosDe(id) {
  if (!DISPOSITIVOS.has(id)) {
    // Paulina (131) y Alvaro (143) tienen la cuenta compartida; el resto, uno o dos equipos en la misma ciudad.
    const n = id === 131 ? 4 : id === 143 ? 3 : 1 + (id % 2)
    DISPOSITIVOS.set(
      id,
      Array.from({ length: n }, (_, i) => {
        const [equipo, navegador] = EQUIPOS[(id + i) % EQUIPOS.length]
        const [ciudad, pais] = CIUDADES[id === 131 ? (i % 3) * 2 : id % 3]
        return { id: nuevoId(), equipo, navegador, ciudad, pais, ultima: iso(30 + i * 600 + (id % 7) * 40), desde: iso(1440 * (20 + i)), actual: false, quien: null, miembro_id: null }
      }),
    )
  }
  return DISPOSITIVOS.get(id)
}
const alertaDe = (lista) => {
  const disp = new Set(lista.map((d) => d.equipo + d.navegador)).size
  const ciu = new Set(lista.map((d) => d.ciudad)).size
  return { alerta: disp >= 3 && ciu >= 2 ? 'alta' : disp >= 3 || ciu >= 2 ? 'media' : null, dispositivos_7d: disp, ciudades_7d: ciu }
}

const itemCarpeta = (c) => {
  const estado = estadoDe(c)
  return {
    id: c.cliente.id,
    nombre: c.cliente.nombre,
    plan: c.cliente.plan,
    estado,
    estado_texto: ESTADOS[estado],
    dias_restantes: diasA(c.cliente.vence),
    vence: c.cliente.vence,
    responsable: c.cliente.responsable,
    ultimo_mensaje: c.ultimo?.creado_en || null,
    dispositivos_alerta: alertaDe(dispositivosDe(c.cliente.id)).alerta,
  }
}

function cuotasDe(c) {
  const id = c.cliente.id
  const n = modalidad(id)
  const inicio = inicioDe(c)
  const monto = Math.round((PRECIO[c.cliente.plan] || 2500) / n)
  return Array.from({ length: n }, (_, i) => {
    const vence = sumarDias(inicio, i * 30)
    const pagada = diasA(vence) <= 0 && !(n > 1 && i === n - 1 && id % 7 === 0)
    return { numero_cuota: i + 1, monto_usd: monto, fecha_vence: vence, fecha_pago: pagada ? vence : null, estado: pagada ? 'pagada' : diasA(vence) < 0 ? 'vencida' : 'pendiente', notas: null }
  })
}

function fichaDe(c) {
  const id = c.cliente.id
  const estado = estadoDe(c)
  const cuotas = cuotasDe(c)
  const pagos = cuotas.filter((q) => q.fecha_pago).map((q) => ({ fecha: q.fecha_pago, monto_usd: q.monto_usd, origen: null, notas: null }))
  if (id % 5 === 0) pagos.push({ fecha: sumarDias(inicioDe(c), -5), monto_usd: 200, origen: 'Transferencia', notas: 'Seña inicial' })
  const pagado = pagos.reduce((t, p) => t + p.monto_usd, 0)
  const adeudado = cuotas.filter((q) => !q.fecha_pago).reduce((t, q) => t + q.monto_usd, 0)
  const duracion = DURACION[c.cliente.plan] || 120
  const archivos = [
    { tipo: 'miro', titulo: 'Miro del cliente', url: 'https://miro.com/app/board/ejemplo', creado_en: iso(1440 * 30) },
    ...(id % 2 ? [{ tipo: 'fathom', titulo: 'Llamadas en Fathom', url: 'https://fathom.video/folder/ejemplo', creado_en: iso(1440 * 20) }] : []),
    { tipo: 'documento', titulo: 'Roadmap en Google Docs', url: 'https://docs.google.com/document/d/ejemplo', creado_en: iso(1440 * 10) },
  ]
  return {
    cliente: {
      id, nombre: c.cliente.nombre, email: emailDe(c), plan_actual: c.cliente.plan, estado_efectivo: estado, estado_texto: ESTADOS[estado],
      dias_restantes: diasA(c.cliente.vence), fecha_inicio: inicioDe(c), fecha_vencimiento: c.cliente.vence, duracion_dias: duracion, fecha_alta: inicioDe(c),
      fecha_recompra: estado === 'llamada_recompra' ? dia(7) : null, oportunidad: id % 3 === 0 ? 'recompra' : null, responsable: c.cliente.responsable,
      canal_discord: slugDe(c.cliente.nombre), otros_mails: id % 4 === 0 ? [`${slugDe(c.cliente.nombre).replace(/-/g, '')}@gmail.com`] : [],
      total_pagado_usd: pagado, total_adeudado_usd: adeudado, prioridad_cobro: adeudado > 0 ? 'alta' : null, observaciones: null,
      acciones_revisar: id % 4 === 0 ? 'Revisar si hace el seguimiento a leads.' : null, dudas: null, arreglo_closer: id % 6 === 0 ? 'Acordó pasar a pago en dos cuotas.' : null,
      miro_url: archivos[0].url,
    },
    pagos,
    cuotas,
    observaciones: [{ autor: c.cliente.responsable || 'Equipo', texto: 'Arrancó con buen ritmo; revisar la oferta en la próxima llamada.', created_at: iso(1440 * 10) }],
    proximos_pasos: [{ fecha_llamada: dia(-6), mentor: c.cliente.responsable || 'Alejandro', contenido: 'Armar el seguimiento a 24 y 72 horas y medir las agendas semanales.', link: 'https://fathom.video/share/ejemplo-1' }],
    archivos,
    classroom: {
      clases_completadas: 3 + (id % 9),
      ultimas_clases: [
        { id: 501, titulo: 'CÓMO USAR EL CLASSROOM', modulo: 'Start Here', completado_en: iso(1440 * 3) },
        { id: 505, titulo: 'QUÉ ES ADVANTAGE', modulo: 'Advantage', completado_en: iso(1440 * 5) },
        { id: 520, titulo: 'ARMAR LA OFERTA IRRESISTIBLE', modulo: 'Advantage', completado_en: iso(1440 * 8) },
      ],
      frentes: id % 2 ? [{ slug: 'lo-voy-a-pensar', revisado: false, automatizado: false, actualizado_en: iso(1440 * 4) }] : [],
      consultas_guia: id % 2 ? [{ texto: 'cómo vender por stories sin ser pesado', creado_en: iso(1440 * 2) }] : [],
    },
    chat: `/mensajes?c=${c.id}`,
  }
}

// ---------------------------------------------------------------- Contratos
let CONTRATOS = null
const contratos = () => {
  CONTRATOS ||= clientesCanal()
    .filter((c) => PROGRAMA[c.cliente.plan])
    .map((c) => {
      const id = c.cliente.id
      const plan = c.cliente.plan
      const atras = Math.max(0, -diasA(inicioDe(c)))
      const firmado = id % 6 !== 0 && id !== 145
      return {
        id: `ctr-${id}`,
        nombre: c.cliente.nombre,
        email: emailDe(c),
        programa: PROGRAMA[plan],
        pago: plan === 'high' || plan === 'boost' ? 'Pago único' : ['Pago único', 'Dos cuotas', 'Tres cuotas'][modalidad(id) - 1],
        contrato: plan === 'boost' ? 'high' : plan === 'mentoria' ? 'entry' : plan,
        estado: firmado ? 'firmado' : 'pendiente',
        enviado_en: iso((atras + 2) * 1440),
        firmado_en: firmado ? iso(atras * 1440) : null,
        pdf: firmado,
      }
    })
    .sort((a, b) => (b.firmado_en || b.enviado_en).localeCompare(a.firmado_en || a.enviado_en))
  return CONTRATOS
}

// ---------------------------------------------------------------- Cierre de mes
const nombreMes = (p) => {
  const [a, m] = p.split('-')
  return `${MESES[Number(m) - 1]} ${a}`
}
const periodoSugerido = () => {
  const h = new Date()
  const k = h.getUTCDate() >= 20 ? 0 : 1
  return new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() - k, 1)).toISOString().slice(0, 7)
}
const mesesAtras = (k) => {
  const [a, m] = periodoSugerido().split('-').map(Number)
  return new Date(Date.UTC(a, m - 1 - k, 1)).toISOString().slice(0, 7)
}
const elegibles = () => clientesCanal().filter((c) => c.cliente.plan !== '2k' && !c.inactivo && !c.vencido && !c.pausa).map((c) => c.cliente.id)

function respuestaNumerica(cid, k) {
  const rnd = semilla(cid * 31 + k * 7 + 1)
  const conv = entre(rnd, 30, 180)
  const agendas = Math.round(conv * (0.15 + rnd() * 0.25))
  const llamadas = Math.round(agendas * (0.6 + rnd() * 0.3))
  const ventas = Math.round(llamadas * (0.15 + rnd() * 0.3))
  const cash = ventas * entre(rnd, 800, 2500)
  const cuello = elegir(rnd, CUELLOS)
  return {
    oferta: OFERTAS[cid % OFERTAS.length], avatar: AVATARES[cid % AVATARES.length], cambios: [],
    reels: entre(rnd, 6, 30), historias: entre(rnd, 8, 60), youtube: entre(rnd, 0, 5), cta_historias: entre(rnd, 4, 40), cta_reels: entre(rnd, 2, 25),
    conversaciones: conv, agendas, llamadas, ventas, cash, facturacion: Math.round(cash * 1.15),
    cuello, cuello_por_que: CUELLO_POR_QUE[cuello], satisfaccion: entre(rnd, 5, 10), satisfaccion_por_que: elegir(rnd, SATISFACCION_POR_QUE), propuesta: elegir(rnd, PROPUESTAS),
  }
}
function respuestaTypeform(cid, nombre) {
  const rnd = semilla(cid * 17 + 3)
  const cuello = elegir(rnd, CUELLOS)
  const rango = elegir(rnd, RANGOS_TYPEFORM)
  const porQue = elegir(rnd, SATISFACCION_POR_QUE)
  const propuesta = elegir(rnd, PROPUESTAS)
  return {
    typeform: [['Nombre y apellido', nombre], [PREGUNTAS_TYPEFORM[0], rango], [PREGUNTAS_TYPEFORM[1], cuello], [PREGUNTAS_TYPEFORM[2], CUELLO_POR_QUE[cuello]], [PREGUNTAS_TYPEFORM[3], propuesta]],
    cuello, cuello_por_que: CUELLO_POR_QUE[cuello], satisfaccion_rango: rango, satisfaccion_por_que: porQue, propuesta,
  }
}

let CIERRE = null
function cierre() {
  if (CIERRE) return CIERRE
  const ids = elegibles()
  const envios = []
  const respuestas = []
  for (let k = 0; k < 4; k += 1) {
    const periodo = mesesAtras(k)
    const minutos = [1, 31, 61, 91][k] * 1440
    const destinatarios = k === 0 ? ids : ids.filter((i) => i % 11 !== k)
    envios.push({ periodo, enviado_en: iso(minutos), vence_en: iso(minutos - 3 * 1440), destinatarios, importado: k === 3 })
    for (const cid of destinatarios) {
      const rnd = semilla(cid * 13 + k)
      if (k === 0 && cid === CLIENTE.usuario_id) continue // Alan tiene el cierre del mes por completar
      if (rnd() > (k === 0 ? 0.35 : k === 3 ? 0.5 : 0.8)) continue
      const nombre = canalDe(cid)?.cliente.nombre || `Cliente ${cid}`
      respuestas.push({
        id: nuevoId(), periodo, cliente_id: cid, creador: '',
        completado_en: iso(Math.max(5, minutos - entre(rnd, 60, 2 * 1440))),
        respuestas: k === 3 ? respuestaTypeform(cid, nombre) : respuestaNumerica(cid, k),
      })
    }
  }
  CIERRE = { envios, respuestas }
  return CIERRE
}

const tasas = (r) => {
  const pct = (a, b) => (typeof r[a] === 'number' && typeof r[b] === 'number' && r[b] > 0 ? Math.round((1000 * r[a]) / r[b]) / 10 : null)
  return { agendamiento: pct('agendas', 'conversaciones'), asistencia: pct('llamadas', 'agendas'), cierre: pct('ventas', 'llamadas') }
}
const conformidad = (r) => {
  const s = r.satisfaccion
  if (typeof s === 'number') return s >= 10 ? 'diez' : s >= 7 ? 'muy' : s >= 4 ? 'conforme' : 'no'
  const rango = (r.satisfaccion_rango || '').toLowerCase()
  return rango.includes('pedir') ? 'diez' : rango.includes('muy') ? 'muy' : rango.includes('no estoy') ? 'no' : rango.includes('estoy') ? 'conforme' : null
}
const periodoValido = (p) => {
  const m = /^(\d{4})-(\d{2})$/.exec(p)
  return m && Number(m[1]) >= 2024 && Number(m[1]) <= 2100 && Number(m[2]) >= 1 && Number(m[2]) <= 12
}

// La oferta y el avatar que contó antes ese cliente para ese creador.
function anteriorDe(cid, creador = '') {
  const previas = cierre().respuestas.filter((r) => r.cliente_id === cid && (r.creador || '').toLowerCase() === creador.toLowerCase()).sort((a, b) => b.completado_en.localeCompare(a.completado_en))
  const ultimo = (campo) => previas.map((r) => (r.respuestas[campo] || '').trim()).find(Boolean) || ''
  return previas.length ? { oferta: ultimo('oferta'), avatar: ultimo('avatar') } : null
}
function paraCompletar(cid, envio, creador = '') {
  const delCliente = cierre().respuestas.filter((r) => r.cliente_id === cid)
  const creadores = [...new Set(delCliente.map((r) => r.creador).filter(Boolean))].sort()
  return {
    periodo: envio.periodo, mes: nombreMes(envio.periodo), vence_en: envio.vence_en, vencido: Date.now() > new Date(envio.vence_en).getTime(),
    anterior: anteriorDe(cid, creador), anteriores: Object.fromEntries(creadores.map((c) => [c, anteriorDe(cid, c)])), creadores,
    hechos: delCliente.filter((r) => r.periodo === envio.periodo).map((r) => r.creador), cuellos: CUELLOS,
  }
}

function responderCierre(op, periodo) {
  const cid = CLIENTE.usuario_id
  const envio = periodoValido(periodo) && cierre().envios.find((e) => e.periodo === periodo)
  if (!envio || envio.importado || !envio.destinatarios.includes(cid)) return error('No hay un cierre de ese mes para vos.', 404)
  const datos = cuerpo(op)
  const creador = String(datos.creador || '').split(/\s+/).join(' ').slice(0, 80)
  const hechos = cierre().respuestas.filter((r) => r.cliente_id === cid && r.periodo === periodo).map((r) => r.creador.toLowerCase())
  if (hechos.includes(creador.toLowerCase())) return error(creador ? `Ya completaste el cierre de ${creador}.` : 'Ya completaste este cierre.', 409)
  if (hechos.length && !creador) return error('Escribí de qué creador es este cierre.')
  const anterior = anteriorDe(cid, creador)
  const cambios = (datos.cambios || []).filter((c) => c === 'oferta' || c === 'avatar')
  const limpio = {}
  for (const campo of ['oferta', 'avatar']) {
    if (cambios.includes(campo) || !anterior) {
      const texto = String(datos[campo] || '').trim().slice(0, 4000)
      if (!texto) return error(`Contanos tu ${campo}.`)
      limpio[campo] = texto
    } else limpio[campo] = anterior[campo] || ''
  }
  limpio.cambios = cambios
  for (const campo of ['reels', 'historias', 'youtube', 'cta_historias', 'cta_reels', 'conversaciones', 'agendas', 'llamadas', 'ventas', 'cash', 'facturacion']) {
    const n = Number(datos[campo])
    if (datos[campo] === '' || datos[campo] == null || !Number.isFinite(n) || n < 0) return error('Completá todos los números (0 si no hubo).')
    limpio[campo] = n
  }
  if (!CUELLOS.includes(datos.cuello)) return error('Elegí tu principal cuello de botella.')
  limpio.cuello = datos.cuello
  const nota = Number(datos.satisfaccion)
  if (!Number.isInteger(nota) || nota < 1 || nota > 10) return error('Calificá el servicio del 1 al 10.')
  limpio.satisfaccion = nota
  for (const [campo, falta] of [['cuello_por_que', 'Contanos el porqué.'], ['satisfaccion_por_que', 'Contanos el porqué.'], ['propuesta', 'Contanos qué podríamos agregar o implementar de nuevo en ATV.']]) {
    const texto = String(datos[campo] || '').trim().slice(0, 4000)
    if (!texto) return error(falta)
    limpio[campo] = texto
  }
  cierre().respuestas.push({ id: nuevoId(), periodo, cliente_id: cid, creador, completado_en: iso(), respuestas: limpio })
  return json({ ok: true, tasas: tasas(limpio) })
}

function mesesCierre() {
  const { envios, respuestas } = cierre()
  const sugerido = periodoSugerido()
  return {
    meses: [...envios].sort((a, b) => b.periodo.localeCompare(a.periodo)).map((e) => ({
      periodo: e.periodo, mes: nombreMes(e.periodo), enviado_en: e.enviado_en, vence_en: e.vence_en, total: e.destinatarios.length,
      completaron: new Set(respuestas.filter((r) => r.periodo === e.periodo).map((r) => r.cliente_id)).size, importado: e.importado,
    })),
    sugerido, sugerido_mes: nombreMes(sugerido), activos: elegibles().length,
  }
}
function metricasCierre() {
  const { envios, respuestas } = cierre()
  const campos = ['reels', 'historias', 'youtube', 'cta_historias', 'cta_reels', 'conversaciones', 'agendas', 'llamadas', 'ventas', 'cash', 'facturacion']
  const meses = [...envios].sort((a, b) => a.periodo.localeCompare(b.periodo)).map((e) => {
    const filas = respuestas.filter((r) => r.periodo === e.periodo)
    const tramos = { diez: 0, muy: 0, conforme: 0, no: 0 }
    const cuellos = Object.fromEntries(CUELLOS.map((c) => [c, 0]))
    for (const f of filas) {
      const b = conformidad(f.respuestas)
      if (b) tramos[b] += 1
      if (f.respuestas.cuello in cuellos) cuellos[f.respuestas.cuello] += 1
    }
    const numeros = Object.fromEntries(campos.map((campo) => {
      const v = filas.map((f) => f.respuestas[campo]).filter((x) => typeof x === 'number')
      return [campo, v.length ? { suma: Math.round(v.reduce((t, x) => t + x, 0) * 100) / 100, cargaron: v.length } : null]
    }))
    return {
      periodo: e.periodo, mes: nombreMes(e.periodo), importado: e.importado, en_curso: !e.importado && Date.now() <= new Date(e.vence_en).getTime(), total: e.destinatarios.length,
      respondieron: new Set(filas.map((f) => f.cliente_id)).size, respuestas: filas.length, conformidad: tramos, cuellos, numeros,
    }
  })
  return { meses, cuellos: CUELLOS }
}
function detalleMes(periodo) {
  const e = periodoValido(periodo) && cierre().envios.find((x) => x.periodo === periodo)
  if (!e) return error('Ese mes no se envió.', 404)
  const completaron = []
  const faltan = []
  for (const cid of e.destinatarios) {
    const c = canalDe(cid)
    const nombre = c?.cliente.nombre || `Cliente ${cid}`
    const plan = c?.cliente.plan || null
    const suyas = cierre().respuestas.filter((r) => r.cliente_id === cid && r.periodo === periodo)
    if (!suyas.length) faltan.push({ cliente_id: cid, nombre, plan })
    for (const x of suyas) {
      const tf = Array.isArray(x.respuestas.typeform) ? x.respuestas.typeform : null
      completaron.push({ id: x.id, cliente_id: cid, nombre: tf?.[0]?.[1] || nombre, ficha: nombre, creador: x.creador || null, plan, completado_en: x.completado_en, respuestas: x.respuestas, tasas: tasas(x.respuestas) })
    }
  }
  const orden = (a, b) => a.nombre.toLowerCase().localeCompare(b.nombre.toLowerCase())
  return json({
    periodo, mes: nombreMes(periodo), enviado_en: e.enviado_en, vence_en: e.vence_en, vencido: Date.now() > new Date(e.vence_en).getTime(), importado: e.importado,
    completaron: completaron.sort(orden), faltan: faltan.sort(orden),
  })
}
function enviarCierre(periodo) {
  if (!periodoValido(periodo)) return error('Mes inválido.')
  const activos = elegibles()
  const e = cierre().envios.find((x) => x.periodo === periodo)
  if (e?.importado) return error('Ese mes se trajo del Typeform: no se vuelve a enviar.', 409)
  if (!e) {
    cierre().envios.push({ periodo, enviado_en: iso(), vence_en: iso(-3 * 1440), destinatarios: activos, importado: false })
    return json({ periodo, mes: nombreMes(periodo), enviados: activos.length, nuevos: activos.length })
  }
  const nuevos = activos.filter((i) => !e.destinatarios.includes(i))
  e.destinatarios = [...e.destinatarios, ...nuevos]
  return json({ periodo, mes: nombreMes(periodo), enviados: e.destinatarios.length, nuevos: nuevos.length })
}

// ---------------------------------------------------------------- Onboardings y altas
const SENAS = [
  { id: 7001, nombre: 'Valentina Rossi', plan: 'Boost', fecha: dia(-6), monto: 500, tipo: 'sena', canal: null },
  { id: 7002, nombre: 'Matías Lescano', plan: 'Mid Level', fecha: dia(-3), monto: 300, tipo: 'sena', canal: null },
  { id: 7003, nombre: 'Julieta Paz', plan: 'Entry Level', fecha: dia(-10), monto: null, tipo: 'ficha', canal: 'julieta-paz' },
]
const ALTAS = [
  { id: 9101, cliente_id: 145, session_id: 'onb-145', nombre: 'Ema Romero', email: 'ema.romero@ejemplo.com', plan: 'Boost', canal: 'ema-romero', discord_invite_url: 'https://discord.gg/ema-romero', discord_error: null, canal_previo: false, ficha_previa: null, creado_en: iso(2880), creado_por: USUARIO.nombre, creado_por_id: USUARIO.usuario_id, mail_enviado_en: null },
]
const altaDict = (a) => ({
  canal_id: canalDe(a.cliente_id)?.id ?? null, id: a.id, cliente_id: a.cliente_id, nombre: a.nombre, email: a.email, plan: a.plan, canal: a.canal,
  clave_classroom: a.canal.replace(/-/g, '.'), discord_invite_url: a.discord_invite_url, discord_error: a.discord_error, canal_ya_existia: a.canal_previo,
  creado_en: a.creado_en, creado_por: a.creado_por, mail_enviado_en: a.mail_enviado_en,
})

let ONB = null
const onboardings = () => {
  ONB ||= clientesCanal()
    .filter((c) => PLAN_ONBOARDING[c.cliente.plan])
    .map((c) => {
      const id = c.cliente.id
      const atras = Math.max(1, -diasA(inicioDe(c)))
      const estado = id === 145 ? 'sin_empezar' : id % 5 === 4 ? 'en_curso' : id % 7 === 3 ? 'sin_empezar' : 'completo'
      return {
        id: `onb-${id}`, cliente_id: id, nombre: c.cliente.nombre, email: emailDe(c), plan: PLAN_ONBOARDING[c.cliente.plan], creado_en: iso((atras + 3) * 1440),
        pasos: { entro: estado !== 'sin_empezar', discord: estado !== 'sin_empezar', skool: estado === 'completo', formulario: estado === 'completo' },
        formulario_en: estado === 'completo' ? iso(atras * 1440) : null, discord_invite_url: estado === 'completo' ? null : `https://discord.gg/${slugDe(c.cliente.nombre)}`,
        alta_id: id === 145 ? 9101 : null,
      }
    })
  return ONB
}
const filaOnb = (o) => {
  const alta = o.alta_id ? ALTAS.find((a) => a.id === o.alta_id) : null
  return {
    id: o.id, nombre: o.nombre, email: o.email, plan: o.plan, creado_en: o.creado_en, pasos: o.pasos, hechos: Object.values(o.pasos).filter(Boolean).length,
    estado: o.pasos.formulario ? 'completo' : o.pasos.entro ? 'en_curso' : 'sin_empezar', formulario_en: o.formulario_en, discord_invite_url: o.discord_invite_url,
    alta_id: o.alta_id, mail_pendiente: Boolean(alta) && !alta.mail_enviado_en, cliente_id: o.cliente_id, canal_id: canalDe(o.cliente_id)?.id ?? null,
  }
}
const pizarraArmando = new Map()

function crearAlta(op) {
  const d = cuerpo(op)
  const nombre = String(d.nombre || '').split(/\s+/).filter(Boolean).join(' ')
  const email = String(d.email || '').trim().toLowerCase()
  if (!nombre || nombre.length > 80) return error('Poné el nombre del cliente.')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error('Revisá el mail.')
  if (!PLAN_DE_PROGRAMA[d.plan]) return error('Elegí el plan.')
  let pago = d.pago
  if (d.plan === '2K') pago = null
  else if (d.plan === 'High Level' || d.plan === 'Boost') pago = 'Pago único'
  else if (!['Pago único', 'Dos cuotas', 'Tres cuotas'].includes(pago)) return error('Elegí la modalidad de pago.')
  if (d.ficha_id == null && !d.sin_ficha && SENAS.length) return error('Indicá si el cliente dejó seña: elegí su ficha o “No dejó seña”.', 409)
  if ([USUARIO.email, COACH.email].includes(email)) return error('Ese mail es de alguien del equipo de ATV.', 409)
  if (clientesCanal().some((c) => emailDe(c) === email)) return error('Ya hay un cliente con ese mail.', 409)
  let canal = slugDe(nombre)
  let previa = null
  if (d.ficha_id != null) {
    previa = SENAS.find((s) => s.id === d.ficha_id)
    if (!previa) return error('No existe esa ficha.', 404)
    if (previa.tipo === 'ficha') canal = previa.canal
  } else if (clientesCanal().some((c) => slugDe(c.cliente.nombre) === canal)) return error(`Ya hay un cliente con el canal #${canal}. Agregá el apellido o una inicial al nombre.`, 409)
  if (previa) SENAS.splice(SENAS.indexOf(previa), 1)

  const plan = PLAN_DE_PROGRAMA[d.plan]
  const clienteId = nuevoId()
  const canalId = nuevoId()
  CANALES.push({
    id: canalId, tipo: 'cliente', nombre, con: null, descripcion: null,
    cliente: { id: clienteId, nombre, plan, responsable: null, vence: dia(DURACION[plan] || 120), slug: canal },
    bloqueado: false, ultimo: null, no_leidos: 0, menciones: 0, esperando_desde: null, roles: null, creado_por: null, orden: null,
    inactivo: false, pausa: false, vencido: false, archivo: null, puede_administrar: false,
  })
  MENSAJES[canalId] = []
  const yo = SESION[quien(op)]
  const alta = {
    id: nuevoId(), cliente_id: clienteId, session_id: `onb-${clienteId}`, nombre, email, plan: d.plan, canal, canal_previo: previa?.tipo === 'ficha',
    discord_invite_url: d.plan === '2K' || previa?.tipo === 'ficha' ? null : `https://discord.gg/${canal}`, discord_error: null, ficha_previa: previa,
    creado_en: iso(), creado_por: yo.nombre, creado_por_id: yo.id, mail_enviado_en: null,
  }
  ALTAS.unshift(alta)
  onboardings().unshift({
    id: alta.session_id, cliente_id: clienteId, nombre, email, plan: d.plan, creado_en: alta.creado_en, pasos: { entro: false, discord: false, skool: false, formulario: false },
    formulario_en: null, discord_invite_url: alta.discord_invite_url, alta_id: alta.id,
  })
  return json(altaDict(alta))
}
function anularAlta(id, op) {
  const alta = ALTAS.find((a) => a.id === id)
  if (!alta) return noEncontrado('No existe esa alta.')
  const q = quien(op)
  if (q !== 'admin' && alta.creado_por_id !== SESION[q].id) return prohibido('Solo quien hizo el alta o un admin la puede anular.')
  if (alta.mail_enviado_en) return error('El cliente ya recibió el onboarding: no se puede anular desde acá.', 409)
  const canal = canalDe(alta.cliente_id)
  if (canal && (MENSAJES[canal.id] || []).some((m) => m.autor?.tipo === 'cliente')) return error('El cliente ya escribió en su chat: no se puede anular desde acá.', 409)
  if (canal) {
    CANALES.splice(CANALES.indexOf(canal), 1)
    delete MENSAJES[canal.id]
  }
  ALTAS.splice(ALTAS.indexOf(alta), 1)
  const o = onboardings().findIndex((x) => x.alta_id === id)
  if (o >= 0) onboardings().splice(o, 1)
  if (alta.ficha_previa) SENAS.push(alta.ficha_previa)
  return json({ ok: true })
}

// ---------------------------------------------------------------- Llamadas (Fathom)
const COACHES_LL = { 3: USUARIO.nombre, 5: 'Alejandro', 6: 'Lucas', 7: COACH.nombre, 8: 'Nick' }
const CONECTADOS = new Set([3, 5, 7, 8])
// [id, coach, cliente, hace (días), duración, tema, link de Fathom, con transcripción]
const SEMILLA_LLAMADAS = [
  [1001, 5, 141, 84, 48, 'el seguimiento a leads', 'https://fathom.video/share/ejemplo-1'],
  [1002, 5, 141, 49, 52, 'pasar las conversaciones a llamada', 'https://fathom.video/share/ejemplo-2'],
  [1003, 7, 141, 13, 44, 'el CTA del perfil', 'https://fathom.video/share/ejemplo-3'],
  [1004, 5, 142, 3, 35, 'la oferta anual'],
  [1005, 6, 143, 5, 52, 'el checkout en pesos'],
  [1006, 5, 144, 7, 40, 'el onboarding de clientes'],
  [1007, 3, 145, 1, 30, 'la definición del avatar'],
  [1008, 7, 150, 9, 45, 'el CRM de leads'],
  [1009, 6, 131, 20, 60, 'los creativos de anuncios'],
  [1010, 5, 120, 2, 42, 'el equipo comercial'],
  [1011, 8, 170, 4, 38, 'la constancia semanal'],
  [1012, 8, 160, 15, 33, 'el cierre de llamadas'],
  [1013, 8, 130, 25, 55, 'el precio de la mentoría'],
  [1014, 3, null, 6, 25, 'la planificación del mes', null],
  [1015, 5, 141, 0, 20, 'las objeciones de precio', null, false],
]
let LLAMADAS = null
const llamadas = () => {
  LLAMADAS ||= SEMILLA_LLAMADAS.map(([id, coach, cliente, hace, dur, tema, url, con = true]) => ({
    id, coach_id: coach, cliente_id: cliente, titulo: cliente ? `Llamada de seguimiento · ${canalDe(cliente)?.cliente.nombre}` : 'Reunión de equipo',
    inicio: hace === 0 ? iso(120) : iso(hace * 1440 + 600), duracion_min: dur, fathom_url: url === undefined ? `https://fathom.video/share/mock-${id}` : url, tema, con_transcripcion: con,
  }))
  return LLAMADAS
}
let ROADMAP_URLS = () => new Set()
const filaLlamada = (l) => {
  const c = l.cliente_id ? canalDe(l.cliente_id) : null
  return {
    id: l.id, titulo: l.titulo, inicio: l.inicio, duracion_min: l.duracion_min, fathom_url: l.fathom_url,
    cliente: c ? { id: c.cliente.id, nombre: c.cliente.nombre, canal_id: c.id, foto_url: null } : null,
    con_transcripcion: l.con_transcripcion, con_roadmap: Boolean(l.fathom_url) && ROADMAP_URLS().has(l.fathom_url), coach_id: l.coach_id,
  }
}
const detalleLlamada = (l) => {
  const c = l.cliente_id ? canalDe(l.cliente_id) : null
  const coach = COACHES_LL[l.coach_id] || 'Equipo'
  return {
    ...filaLlamada(l), coach,
    invitados: [...(c ? [{ nombre: c.cliente.nombre, email: emailDe(c) }] : []), { nombre: coach, email: `${slugDe(coach).replace(/-/g, '.')}@atvos.io` }],
    transcripcion: l.con_transcripcion ? transcripcion(c?.cliente.nombre, coach.split(' ')[0], l.tema) : '',
    resumen: l.con_transcripcion ? resumenLlamada(l.tema) : '',
  }
}
const visibleLlamada = (l, q) => q === 'admin' || l.coach_id === SESION[q].id
const ESTADO_FATHOM = { admin: false, coach: false }
const estadoFathom = (q) => (ESTADO_FATHOM[q] ? { conectado: true, desde: iso(1440), ultima_sync: iso(2), error: null, llamadas: llamadas().filter((l) => l.coach_id === SESION[q].id).length, al_instante: true } : { conectado: false })

// ---------------------------------------------------------------- Roadmap (lado del equipo)
let ROADMAP = null
const roadmapDocs = () => {
  if (!ROADMAP) {
    const base = roadmapDe({ id: 141, nombre: 'Alan Klein', plan: 'boost' })
    ROADMAP = base.grupos.flatMap((g) => g.docs.map((d) => ({
      id: d.id, cliente_id: 141, coach_id: d.coach_id, titulo: d.titulo, tipo: d.tipo, url: d.url, fathom_url: d.fathom_url, fecha: d.fecha, area: d.area,
      principal: d.principal, pasos: d.pasos.map((p) => ({ ...p })), pasos_total: null, paso_actual: null,
    })))
  }
  return ROADMAP
}
ROADMAP_URLS = () => new Set(roadmapDocs().map((d) => d.fathom_url).filter(Boolean))
const TIPOS_RM = { inicial: 'Roadmap inicial', revision: 'Revisión mensual', complementario: 'Complementario' }

function armarRoadmap(cid) {
  const docs = roadmapDocs().filter((d) => d.cliente_id === cid).sort((a, b) => (a.fecha === b.fecha ? a.id - b.id : a.fecha < b.fecha ? -1 : 1))
  const cuenta = {}
  const numero = {}
  const ultimo = {}
  for (const d of docs) {
    const hilo = `${d.coach_id}|${d.titulo.toLowerCase()}`
    cuenta[hilo] = (cuenta[hilo] || 0) + 1
    numero[d.id] = cuenta[hilo]
    ultimo[hilo] = d.id
  }
  const dict = (d) => {
    const hilo = `${d.coach_id}|${d.titulo.toLowerCase()}`
    return {
      id: d.id, titulo: d.titulo, version: numero[d.id], versiones: cuenta[hilo], tipo: d.tipo, tipo_nombre: TIPOS_RM[d.tipo] || d.tipo, url: d.url, fathom_url: d.fathom_url,
      fecha: d.fecha, estado: ultimo[hilo] === d.id ? 'vigente' : 'reemplazado', pasos: d.pasos,
      pasos_total: d.pasos.length ? d.pasos.length : d.pasos_total, paso_actual: d.pasos.length ? d.pasos.filter((p) => p.hecho).length : d.paso_actual,
      principal: d.principal, coach_id: d.coach_id, area: d.area,
    }
  }
  const grupos = []
  for (const d of docs) {
    let g = grupos.find((x) => x.coach.id === d.coach_id)
    if (!g) {
      g = { coach: { id: d.coach_id, nombre: EQUIPO.find((e) => e.id === d.coach_id)?.nombre || 'Equipo ATV', foto_url: null }, area: null, docs: [] }
      grupos.push(g)
    }
    g.docs.push(dict(d))
    if (d.area) g.area = d.area
  }
  const todos = grupos.flatMap((g) => g.docs)
  const vigentes = todos.filter((x) => x.estado === 'vigente')
  const principal = [...todos].reverse().find((x) => x.principal && x.estado === 'vigente') || [...vigentes].sort((a, b) => (a.fecha + a.id < b.fecha + b.id ? 1 : -1))[0] || null
  const c = canalDe(cid)
  return { cliente: { id: cid, nombre: c?.cliente.nombre || 'Cliente', plan: c?.cliente.plan || null }, grupos, principal, total: todos.length, vigentes: vigentes.length }
}

// Valida y normaliza el body de un documento (como roadmap_service._limpiar). Devuelve { limpio } o { fallo }.
function limpiarDoc(datos, parcial) {
  const limpio = {}
  if ('titulo' in datos || !parcial) {
    const titulo = String(datos.titulo || '').split(/\s+/).filter(Boolean).join(' ')
    if (!titulo || titulo.length > 80) return { fallo: error('Poné un título corto, por ejemplo Ventas o Roadmap inicial.') }
    limpio.titulo = titulo
  }
  if ('pasos' in datos) {
    const pasos = (datos.pasos || [])
      .map((p) => ({ texto: String(p?.texto || '').split(/\s+/).filter(Boolean).join(' ').slice(0, 400), quien: p?.quien === 'atv' ? 'atv' : 'cliente' }))
      .filter((p) => p.texto)
    if (pasos.length > 30) return { fallo: error('Hasta 30 pasos por roadmap.') }
    limpio.pasos = pasos
  }
  if ('url' in datos || !parcial) {
    const url = String(datos.url || '').trim()
    if (url && !/^https?:\/\/\S+$/.test(url)) return { fallo: error('Revisá el link del documento.') }
    limpio.url = url || null
    if (!url && !limpio.pasos?.length && !parcial) return { fallo: error('Escribí los próximos pasos o pegá el link del documento.') }
  }
  if ('fathom_url' in datos) {
    const f = String(datos.fathom_url || '').trim()
    if (f && !/^https?:\/\/\S+$/.test(f)) return { fallo: error('Pegá el link de la grabación de Fathom.') }
    limpio.fathom_url = f || null
  }
  if ('tipo' in datos || !parcial) {
    const tipo = datos.tipo || 'revision'
    if (!TIPOS_RM[tipo]) return { fallo: error('Tipo inválido.') }
    limpio.tipo = tipo
  }
  if ('fecha' in datos || !parcial) {
    if (datos.fecha && Number.isNaN(Date.parse(datos.fecha))) return { fallo: error('Fecha inválida.') }
    limpio.fecha = datos.fecha || dia(0)
  }
  for (const campo of ['pasos_total', 'paso_actual']) {
    if (campo in datos) {
      const v = datos[campo]
      if (v != null && (!Number.isInteger(v) || v < 0 || v > 50)) return { fallo: error('Los pasos van de 0 a 50.') }
      limpio[campo] = v
    }
  }
  if ('area' in datos) limpio.area = String(datos.area || '').split(/\s+/).filter(Boolean).join(' ') || null
  if ('coach_id' in datos) limpio.coach_id = datos.coach_id
  if ('principal' in datos) limpio.principal = Boolean(datos.principal)
  return { limpio }
}
const pasosConId = (pasos) => pasos.map((p, i) => ({ id: i + 1, texto: p.texto, quien: p.quien, hecho: false, hecho_en: null, hecho_por: null }))

function generarRoadmap(cid, op) {
  const d = cuerpo(op)
  const c = canalDe(cid)
  if (!c) return error('No existe ese cliente.', 404)
  if (d.diagnostico_id) {
    const diag = cuellos().find((x) => x.id === d.diagnostico_id && x.cliente_id === cid && x.estado === 'aprobado')
    if (!diag) return error('Ese diagnóstico no es de este cliente o todavía no se aprobó.', 404)
  }
  if (!d.diagnostico_id || (d.transcripcion || '').trim()) {
    if ((d.transcripcion || '').trim().length < 200) return error('Pegá la transcripción completa de la llamada.')
  }
  const nombre = c.cliente.nombre.split(' ')[0]
  const anterior = roadmapDocs().filter((x) => x.cliente_id === cid).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
  return json({
    titulo: 'Ventas y seguimiento', area: 'Ventas',
    pasos: [
      { quien: 'cliente', texto: 'Armá el seguimiento a 24 y 72 horas para los leads que no responden' },
      { quien: 'cliente', texto: 'Medí cada semana conversaciones, agendas y ventas' },
      { quien: 'cliente', texto: 'Grabá el guion de llamada con el manejo de objeciones de precio' },
      { quien: 'atv', texto: 'Te paso el SOP de seguimiento y revisamos los números en la próxima llamada' },
    ],
    mensaje: `${nombre}, buenísima la llamada de hoy! Te dejo tu roadmap con los próximos pasos: [ROADMAP]\n\nCualquier duda me escribís por acá.\n\nGrabación de la llamada: [LINK]\nGuion de cierre: [LINK]\nPlanilla de métricas: [LINK]`,
    entregables: [
      { titulo: 'Guion de cierre', url: `${window.location.origin}/classroom/5?clase=520`, clase: 'GUION DE CIERRE', fuente: 'classroom' },
      { titulo: 'Planilla de métricas', url: null, clase: null, fuente: null },
    ],
    resumen: 'Se revisó el embudo: hay conversaciones pero se pierden antes de la llamada. Se acordó armar un seguimiento y medir tres números semanales.',
    seguimiento: anterior ? { pasos: anterior.pasos.slice(0, 3).map((p) => ({ id: p.id, paso: p.texto, estado: p.hecho ? 'hecho' : 'no_hecho', resultado: p.hecho ? 'Lo implementó esta semana.' : null })) } : null,
    borrador_id: nuevoId(),
  })
}

// ---------------------------------------------------------------- Cuellos de botella
const LECCIONES = [
  { id: 1, diagnostico_id: 301, seccion: 'Solución', texto: 'Siempre incluir un ejemplo entre comillas listo para copiar y pegar.', antes: '', despues: '', activa: true, creado_en: iso(1440 * 20) },
  { id: 2, diagnostico_id: 303, seccion: 'Qué no hacer', texto: 'No recomendar sumar tráfico si el problema está después de la conversación.', antes: '', despues: '', activa: true, creado_en: iso(1440 * 7) },
]
const norm = sinAcentos
const TODAS_SECC = [...new Set(Object.values(FORMATOS).flatMap((f) => f.secciones))]
const CLAVES_SECC = Object.fromEntries(TODAS_SECC.map((s) => [norm(s), s]))
function seccionesDe(texto) {
  const out = {}
  let actual = null
  for (const linea of (texto || '').split('\n')) {
    const m = linea.match(/^\s*#\s+(?!#)(.+?)\s*$/)
    if (m) {
      actual = CLAVES_SECC[norm(m[1]).replace(/^\d+(\.\d+)*[.)]?\s*/, '').replace(/:$/, '')] || null
      if (actual) out[actual] = []
    } else if (actual) out[actual].push(linea)
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join('\n').trim()]))
}
const palabras = (t) => norm(t).match(/\w+/g) || []
const parecido = (a, b) => {
  const A = new Set(palabras(a))
  const B = new Set(palabras(b))
  if (!A.size && !B.size) return 1
  let comunes = 0
  for (const x of A) if (B.has(x)) comunes += 1
  return comunes / (A.size + B.size - comunes)
}
function coincidencia(version, final) {
  const sv = seccionesDe(version)
  const sf = seccionesDe(final)
  let total = 0
  let peso = 0
  for (const s of new Set([...Object.keys(sf), ...Object.keys(sv)])) {
    const w = Math.max(palabras(sf[s] || '').length, 1)
    total += w * parecido(sv[s] || '', sf[s] || '')
    peso += w
  }
  return peso ? Math.round((total / peso) * 1000) / 1000 : 0
}
const cambiosDe = (jeremy, final) => {
  const sj = seccionesDe(jeremy)
  const sf = seccionesDe(final)
  return [...new Set([...Object.keys(sj), ...Object.keys(sf)])]
    .map((s) => ({ seccion: s, antes: sj[s] || '', despues: sf[s] || '', parecido: Math.round(parecido(sj[s] || '', sf[s] || '') * 100) / 100 }))
    .filter((c) => c.parecido < 0.97)
}
const frase = (texto) => {
  const s = seccionesDe(texto)
  const primera = ((s.Diagnóstico || Object.values(s)[0] || '').split('\n').find((l) => l.trim()) || '').replace(/\*\*|^[-•>]\s*/g, '')
  return primera.length <= 140 ? primera : `${primera.slice(0, 139).split(' ').slice(0, -1).join(' ')}…`
}

let CUELLOS_DB = null
function cuellos() {
  if (CUELLOS_DB) return CUELLOS_DB
  const aprobado = (id, cid, hace, extra, cierreAlt) => {
    const nombre = canalDe(cid).cliente.nombre
    const base = baseCuello(nombre)
    const jeremy = textoDeSecciones(base)
    const final = textoDeSecciones({ ...base, ...extra })
    const cerebro = textoDeSecciones({ ...base, Cierre: cierreAlt })
    return {
      id, cliente_id: cid, admin_id: 3, estado: 'aprobado', error: null, loom_url: `https://www.loom.com/share/${'a1b2c3d4'.repeat(4)}`, creado_en: iso(hace * 1440 + 400),
      respondido_en: iso(hace * 1440 + 380), aprobado_en: iso(hace * 1440), coincidencia_jeremy: coincidencia(jeremy, final), coincidencia_cerebro: coincidencia(cerebro, final),
      formato: 'cuello', contexto: null, transcripcion: null, version_jeremy: jeremy, version_final: final, version_cerebro: cerebro, version_tono: null, tono_admin_id: 0, doc_url: null,
    }
  }
  CUELLOS_DB = [
    aprobado(301, 141, 21, { Solución: `${baseCuello('Alan').Solución}\n### 5.3 Revisión semanal\nUn bloque fijo de 30 minutos los viernes para mirar los tres números.` }, 'Cuidá al lead que ya llegó antes de buscar más tráfico.'),
    aprobado(302, 142, 14, { Cierre: 'Lo importante es ordenar el proceso antes de escalar nada.' }, 'El seguimiento es el trabajo que nadie está haciendo.'),
    aprobado(303, 144, 8, { 'Qué no hacer': '- **No sumar más tráfico todavía.**\n- **No bajar el precio.** El problema no está en la oferta.' }, 'Antes de sumar tráfico, cuidá al que ya llegó.'),
    aprobado(304, 131, 2, { Expectativas: '- **Semana 1:** seguimiento armado.\n- **Semana 3:** tablero funcionando.\n- **Objetivo:** 5 ventas mensuales.' }, 'El seguimiento es lo que falta.'),
    {
      id: 305, cliente_id: 143, admin_id: 3, estado: 'borrador', error: null, loom_url: `https://www.loom.com/share/${'f0e1d2c3'.repeat(4)}`, creado_en: iso(180), respondido_en: iso(120), aprobado_en: null,
      coincidencia_jeremy: null, coincidencia_cerebro: null, formato: 'cuello', contexto: 'Vende un curso de trading', transcripcion: null,
      version_jeremy: textoDeSecciones(baseCuello('Alvaro Larraz', 'el checkout')), version_final: textoDeSecciones(baseCuello('Alvaro Larraz', 'el checkout')),
      version_cerebro: textoDeSecciones({ ...baseCuello('Alvaro Larraz', 'el checkout'), Cierre: 'Resolvé primero el checkout.' }), version_tono: null, tono_admin_id: null, doc_url: null,
    },
    {
      id: 306, cliente_id: 145, admin_id: 3, estado: 'error', error: 'Juan AI no respondió a tiempo. Probá de nuevo.', loom_url: null, creado_en: iso(1440), respondido_en: null, aprobado_en: null,
      coincidencia_jeremy: null, coincidencia_cerebro: null, formato: 'historias', contexto: null, transcripcion: 'Lo que mandó el cliente para revisar:\nMis historias de la semana pasada.',
      version_jeremy: null, version_final: null, version_cerebro: null, version_tono: null, tono_admin_id: null, doc_url: null,
    },
  ]
  return CUELLOS_DB
}
// Los pedidos nuevos pasan de "pidiendo" a "esperando" y a borrador con el tiempo, como si Jeremy tardara unos segundos.
function avanzar(d) {
  if (!d._t0 || !['pidiendo', 'esperando'].includes(d.estado)) return
  const t = Date.now() - d._t0
  if (t > 9000) {
    const nombre = canalDe(d.cliente_id)?.cliente.nombre || 'Cliente'
    const texto = d.formato === 'cuello' ? textoDeSecciones(baseCuello(nombre)) : borradorGenerico(d.formato, nombre)
    Object.assign(d, { estado: 'borrador', respondido_en: iso(), version_jeremy: texto, version_final: texto, version_cerebro: texto })
  } else if (t > 3000) d.estado = 'esperando'
}
const resumenCuello = (d) => {
  avanzar(d)
  return {
    id: d.id, cliente_id: d.cliente_id, cliente: canalDe(d.cliente_id)?.cliente.nombre || `Cliente ${d.cliente_id}`, estado: d.estado, error: d.error, loom_url: d.loom_url,
    creado_en: d.creado_en, respondido_en: d.respondido_en, aprobado_en: d.aprobado_en, coincidencia_jeremy: d.coincidencia_jeremy, coincidencia_cerebro: d.coincidencia_cerebro, formato: d.formato,
  }
}
const detalleCuello = (d) => ({
  ...resumenCuello(d),
  contexto: d.contexto, transcripcion: d.transcripcion, version_jeremy: d.version_jeremy, version_final: d.version_final,
  version_cerebro: d.estado === 'aprobado' ? d.version_cerebro : null, cerebro_listo: Boolean(d.version_cerebro),
  secciones: FORMATOS[d.formato].secciones, formatos: Object.entries(FORMATOS).map(([id, f]) => ({ id, nombre: f.nombre, titulo: f.titulo })),
  captura_base: null, doc_activo: true, doc_url: d.doc_url, version_tono: d.version_tono, tono_admin_id: d.tono_admin_id,
  lecciones: LECCIONES.filter((l) => l.diagnostico_id === d.id).map((l) => ({ id: l.id, seccion: l.seccion, texto: l.texto })),
})
const lunesDe = (iso8) => {
  const d = new Date(iso8)
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DIA_MS).toISOString().slice(0, 10)
}
function neurona() {
  const aprobados = cuellos().filter((d) => d.estado === 'aprobado').sort((a, b) => a.aprobado_en.localeCompare(b.aprobado_en))
  const prom = (xs) => (xs.length ? Math.round((xs.reduce((t, x) => t + x, 0) / xs.length) * 1000) / 1000 : null)
  const semanas = {}
  for (const d of aprobados) {
    const s = (semanas[lunesDe(d.aprobado_en)] ||= { casos: 0, jeremy: [], cerebro: [] })
    s.casos += 1
    if (d.coincidencia_jeremy != null) s.jeremy.push(d.coincidencia_jeremy)
    if (d.coincidencia_cerebro != null) s.cerebro.push(d.coincidencia_cerebro)
  }
  const serie = Object.entries(semanas).map(([semana, s]) => ({ semana, casos: s.casos, jeremy: prom(s.jeremy), cerebro: prom(s.cerebro) }))
  const ultimas = serie.slice(-3).map((s) => s.cerebro)
  const pedidos = cuellos().map((d) => d.creado_en)
  return {
    fase: ultimas.length === 3 && ultimas.every((x) => x != null && x >= 0.85) ? 2 : 1, umbral: 0.85, casos: aprobados.length, pedidos: pedidos.length,
    coincidencia_cerebro: prom(aprobados.map((d) => d.coincidencia_cerebro).filter((x) => x != null)),
    coincidencia_jeremy: prom(aprobados.map((d) => d.coincidencia_jeremy).filter((x) => x != null)),
    serie, casos_lista: [...aprobados].reverse().map(resumenCuello),
    lecciones: [...LECCIONES].reverse().map((l) => ({ ...l, usada: pedidos.filter((p) => p > l.creado_en).length })),
    secciones_corregidas: Object.fromEntries(SECCIONES_CUELLO.map((s) => [s, LECCIONES.filter((l) => l.seccion === s).length])),
  }
}
const cuelloPorId = (id) => cuellos().find((d) => d.id === Number(id))
const NO_EXISTE_DIAG = 'No existe ese diagnóstico.'

function pedirCuello(op, q) {
  const b = cuerpo(op)
  const loom = String(b.loom_url || '').trim() || null
  let texto = String(b.texto || '').trim() || null
  const formato = String(b.formato || 'cuello').trim().toLowerCase()
  if (!FORMATOS[formato]) return error('Ese formato no existe.')
  const c = canalDe(Number(b.cliente_id))
  if (b.cierre_periodo) {
    const r = cierre().respuestas.find((x) => x.cliente_id === Number(b.cliente_id) && x.periodo === b.cierre_periodo)
    texto = `Cierre de ${nombreMes(b.cierre_periodo)}.\nCuello de botella: ${r?.respuestas.cuello || 'sin dato'}.\n${r?.respuestas.cuello_por_que || ''}${texto ? `\n\nLo que agrega el equipo:\n${texto}` : ''}`
  } else if (texto && !loom) texto = formato === 'cuello' ? `Lo que contó el cliente sobre su traba:\n${texto}` : `Lo que mandó el cliente para revisar:\n${texto}`
  if (!loom && !texto) return error('Pegá el Loom, elegí un cierre de mes o contá su problema.')
  if (loom && !/loom\.com\/(share|embed)\/[0-9a-f]{32}/.test(loom)) return error('Ese link no es de un Loom (tiene que ser loom.com/share/…).')
  if (!c) return error('No existe ese cliente.', 404)
  const d = {
    id: nuevoId(), cliente_id: c.cliente.id, admin_id: SESION[q].id, estado: 'pidiendo', error: null, loom_url: loom, creado_en: iso(), respondido_en: null, aprobado_en: null,
    coincidencia_jeremy: null, coincidencia_cerebro: null, formato, contexto: String(b.contexto || '').trim().slice(0, 500) || null, transcripcion: loom ? null : texto,
    version_jeremy: null, version_final: null, version_cerebro: null, version_tono: null, tono_admin_id: null, doc_url: null, _t0: Date.now(),
  }
  cuellos().unshift(d)
  return json(detalleCuello(d))
}

// ---------------------------------------------------------------- SOPs solicitados y Biblioteca
let SOLICITUDES = null
const solicitudes = () => {
  SOLICITUDES ||= SOPS.map(([cid, titulo, area, problema, consulta, estado, hace, entrega], i) => ({
    id: 600 + i, cliente_id: cid, titulo, area, problema, consulta, estado, creado_en: iso(hace * 1440), entrega_url: entrega || null,
    resuelto_por: estado === 'entregado' ? 'Lucas' : null, resuelto_en: estado === 'entregado' ? iso((hace - 2) * 1440) : null,
  }))
  return SOLICITUDES
}
const dictSolicitud = (s) => {
  const c = canalDe(s.cliente_id)
  return {
    id: s.id, titulo: s.titulo, area: s.area, area_nombre: AREAS_SOP.find((a) => a.id === s.area)?.nombre || s.area, problema: s.problema, consulta: s.consulta, estado: s.estado,
    creado_en: s.creado_en, cliente: c ? { id: c.cliente.id, nombre: c.cliente.nombre, canal_id: c.id } : null, pedido_por: null, entrega_url: s.entrega_url,
    resuelto_por: s.resuelto_por, resuelto_en: s.resuelto_en,
  }
}

function bibliotecaDe() {
  const nombreDe = (id) => canalDe(id)?.cliente.nombre || 'Cliente'
  const pagina = (n, ids) => {
    const clientes = n.clientes.filter(([id]) => ids.includes(id)).map(([id, que, sub, etapa]) => ({
      id, nombre: nombreDe(id), que_vende: que, subnicho: sub, etapa, plan: canalDe(id)?.cliente.plan || null, onboarding: id % 4 !== 0, canal_id: canalDe(id)?.id ?? null,
    }))
    const nombres = new Set(clientes.map((c) => c.nombre))
    const parcial = ids.length < n.clientes.length
    return {
      clientes, dolores: parcial ? n.dolores.slice(0, 3) : n.dolores, recomendaciones: parcial ? n.recomendaciones.slice(0, 2) : n.recomendaciones, objeciones: parcial ? n.objeciones.slice(0, 2) : n.objeciones,
      funciono: n.funciono.filter((f) => !parcial || nombres.has(f.cliente) || f === n.funciono[0]), no_funciono: n.no_funciono,
      ofertas: n.ofertas.filter(([cliente]) => nombres.has(cliente)).map(([cliente, oferta, precio, factura, objetivo]) => ({ cliente, oferta, precio, factura, objetivo })),
      roadmaps: ROADMAPS_BIB.filter(([id]) => ids.includes(id)).map(([id, titulo, coach, total, hechos, cumplidos, resultado], i) => ({
        id: 700 + id + i, titulo, fecha: dia(-10 - i), cliente: nombreDe(id), coach, total, hechos, cumplidos, resultado,
      })),
    }
  }
  return {
    nichos: NICHOS.map((n) => ({
      slug: n.slug, nombre: n.nombre, ...pagina(n, n.clientes.map(([id]) => id)),
      subnichos: n.subnichos.map(([nombre, ids]) => ({ nombre, ...pagina(n, ids) })),
    })),
    armado_en: Math.floor(Date.now() / 1000),
  }
}
function consultasGuia() {
  const consultas = CONSULTAS.map(([cid, texto, area, modo, resultados, hace], i) => ({
    id: 800 + i, texto, cliente_id: cid, cliente: canalDe(cid)?.cliente.nombre || 'Cliente', canal_id: canalDe(cid)?.id ?? null, area, modo, resultados, creado_en: iso(hace),
  }))
  const semana = consultas.filter((c) => Date.now() - new Date(c.creado_en).getTime() < 7 * DIA_MS)
  const porArea = {}
  for (const c of semana) porArea[c.area || 'Sin área'] = (porArea[c.area || 'Sin área'] || 0) + 1
  return {
    consultas,
    semana: { total: semana.length, clientes: new Set(semana.map((c) => c.cliente_id)).size, sin_material: semana.filter((c) => c.resultados === 0).length, por_area: Object.entries(porArea).sort((a, b) => b[1] - a[1]) },
  }
}

// ---------------------------------------------------------------- Live sessions y Nueva clase (programas del admin)
const EXTRA_SECC = {}
const EXTRA_CLASES = {}
const programaAdmin = (id) => {
  const p = detallePrograma(id)
  if (!p) return null
  const secciones = [...p.secciones, ...(EXTRA_SECC[id] || [])].map((s) => ({
    id: s.id, titulo: s.titulo, orden: s.orden,
    clases: [
      ...s.clases.map((c) => ({ id: c.id, titulo: c.titulo, orden: c.orden, video_url: c.video_url, video_bloqueado_para: c.video_bloqueado_para || [], duracion_segundos: c.duracion_segundos, descripcion: null, recursos: [] })),
      ...(EXTRA_CLASES[s.id] || []),
    ].sort((a, b) => a.orden - b.orden),
  }))
  return { id: p.id, titulo: p.titulo, slug: p.slug, descripcion: p.descripcion, orden: p.orden, cover_url: p.cover_url, secciones }
}
const programaDeSeccion = (seccionId) => listaProgramas().map((p) => programaAdmin(p.id)).find((p) => p.secciones.some((s) => s.id === seccionId))
function nuevaClase(programa, seccion, datos) {
  const clase = {
    id: nuevoId(), titulo: String(datos.titulo || '').trim(), orden: datos.orden ?? 0, video_url: datos.video_url || null, video_bloqueado_para: datos.video_bloqueado_para || [],
    duracion_segundos: datos.duracion_segundos ?? null, descripcion: datos.descripcion || null, recursos: datos.recursos || [],
  }
  ;(EXTRA_CLASES[seccion.id] ||= []).push(clase)
  return { ...clase, programa_id: programa.id }
}

// ---------------------------------------------------------------- Rutas
export const rutas = [
  // Clientes (solo admin)
  ['GET', /^\/api\/admin\/clientes$/, con('admin', () => json(clientesCanal().map(itemCarpeta)))],
  ['GET', /^\/api\/admin\/clientes\/(\d+)\/dispositivos$/, con('admin', ([, id]) => (canalDe(Number(id)) ? json({ dispositivos: dispositivosDe(Number(id)), ...alertaDe(dispositivosDe(Number(id))) }) : noEncontrado('Ese cliente no existe.')))],
  ['DELETE', /^\/api\/admin\/clientes\/dispositivos\/(\d+)$/, con('admin', ([, id]) => {
    for (const [cid, lista] of DISPOSITIVOS) {
      const i = lista.findIndex((d) => d.id === Number(id))
      if (i >= 0) {
        DISPOSITIVOS.set(cid, lista.filter((_, j) => j !== i))
        return json({ ok: true })
      }
    }
    return noEncontrado('Esa sesión no existe.')
  })],
  ['GET', /^\/api\/admin\/clientes\/(\d+)$/, con('admin', ([, id]) => {
    const c = canalDe(Number(id))
    return c ? json(fichaDe(c)) : noEncontrado('Ese cliente no existe.')
  })],

  // Contratos (solo admin). El PDF usa fetch directo y no pasa por el mock.
  ['GET', /^\/api\/admin\/contratos$/, con('admin', () => json({ programas: Object.values(PROGRAMA), contratos: contratos() }))],

  // Cierre de mes: el formulario del cliente y la carpeta del admin
  ['GET', /^\/api\/cierre\/pendiente$/, (_, op) => {
    if (quien(op) !== 'cliente') return json({ pendiente: null })
    const cid = CLIENTE.usuario_id
    const hechos = new Set(cierre().respuestas.filter((r) => r.cliente_id === cid).map((r) => r.periodo))
    const e = [...cierre().envios].filter((x) => !x.importado && x.destinatarios.includes(cid)).sort((a, b) => b.enviado_en.localeCompare(a.enviado_en)).find((x) => !hechos.has(x.periodo))
    return json({ pendiente: e ? paraCompletar(cid, e) : null })
  }],
  ['GET', /^\/api\/cierre\/(\d{4}-\d{2})\/otro$/, con('cliente', ([, periodo]) => {
    const e = cierre().envios.find((x) => x.periodo === periodo)
    return e && !e.importado && e.destinatarios.includes(CLIENTE.usuario_id) ? json(paraCompletar(CLIENTE.usuario_id, e)) : error('No hay un cierre de ese mes para vos.', 404)
  })],
  ['POST', /^\/api\/cierre\/(\d{4}-\d{2})$/, (m, op) => (quien(op) !== 'cliente' ? prohibido('El cierre de mes lo completa el cliente.') : responderCierre(op, m[1]))],
  ['GET', /^\/api\/admin\/cierres$/, con('admin', () => json(mesesCierre()))],
  ['GET', /^\/api\/admin\/cierres\/metricas$/, con('admin', () => json(metricasCierre()))],
  ['GET', /^\/api\/admin\/cierres\/(\d{4}-\d{2})$/, con('admin', ([, p]) => detalleMes(p))],
  ['POST', /^\/api\/admin\/cierres\/([^/]+)\/enviar$/, con('admin', ([, p]) => enviarCierre(p))],

  // Onboardings (equipo)
  ['GET', /^\/api\/onboardings$/, con('equipo', () => json([...onboardings()].sort((a, b) => b.creado_en.localeCompare(a.creado_en)).map(filaOnb)))],
  ['GET', /^\/api\/onboardings\/formularios$/, con('equipo', () => json(onboardings().filter((o) => o.pasos.formulario).map((o) => ({
    id: o.id, client_name: o.nombre, client_email: o.email, plan: o.plan, submitted_at: o.formulario_en, form_data: respuestasFormulario(o.nombre),
  }))))],
  ['GET', /^\/api\/onboardings\/([\w-]+)\/pizarra$/, con('equipo', ([, id]) => {
    const o = onboardings().find((x) => x.id === id)
    if (!o?.pasos.formulario) return noEncontrado('Todavía no completó el formulario.')
    if (pizarraArmando.has(id) && Date.now() - pizarraArmando.get(id) < 4000) return json({ estado: 'armando', desde: iso(1) })
    pizarraArmando.delete(id)
    return json({ ...pizarra(o.nombre, o.plan), armada_en: iso() })
  })],
  ['POST', /^\/api\/onboardings\/([\w-]+)\/pizarra$/, con('equipo', ([, id], op, _u, q) => {
    if (q !== 'admin') return prohibido('Solo un admin la vuelve a dibujar.')
    if (!onboardings().find((x) => x.id === id)?.pasos.formulario) return noEncontrado('Todavía no completó el formulario.')
    pizarraArmando.set(id, Date.now())
    return json({ estado: 'armando', desde: iso() })
  })],
  ['GET', /^\/api\/onboardings\/([\w-]+)$/, con('equipo', ([, id]) => {
    const o = onboardings().find((x) => x.id === id)
    return o ? json({ ...filaOnb(o), respuestas: o.pasos.formulario ? respuestasFormulario(o.nombre) : {} }) : noEncontrado('No existe ese onboarding.')
  })],

  // Altas (Nuevo onboarding)
  ['GET', /^\/api\/altas$/, con('equipo', () => json(ALTAS.map(altaDict)))],
  ['GET', /^\/api\/altas\/buscar-ficha$/, con('equipo', (_, __, url) => {
    const q = params(url)
    const palabrasNombre = new Set(norm(q.get('nombre') || '').split(/\s+/).filter((x) => x.length >= 3))
    return json(SENAS.map((s) => {
      const otras = norm(s.nombre).split(/\s+/)
      const comunes = otras.filter((x) => palabrasNombre.has(x)).length
      return { ...s, coincide: palabrasNombre.size && comunes === otras.length && comunes === palabrasNombre.size ? 'nombre' : comunes ? 'parecido' : null }
    }).sort((a, b) => Number(Boolean(b.coincide)) - Number(Boolean(a.coincide))))
  })],
  ['POST', /^\/api\/altas$/, con('equipo', (_, op) => crearAlta(op))],
  ['POST', /^\/api\/altas\/(\d+)\/enviar-onboarding$/, con('equipo', ([, id]) => {
    const a = ALTAS.find((x) => x.id === Number(id))
    if (!a) return noEncontrado('No existe esa alta.')
    if (a.mail_enviado_en) return error('El link de onboarding ya se mandó.', 409)
    a.mail_enviado_en = iso()
    return json(altaDict(a))
  })],
  ['DELETE', /^\/api\/altas\/(\d+)$/, con('equipo', ([, id], op) => anularAlta(Number(id), op))],

  // Llamadas
  ['GET', /^\/api\/llamadas$/, con('equipo', (_, __, ___, q) => {
    const todas = llamadas().filter((l) => visibleLlamada(l, q)).sort((a, b) => b.inicio.localeCompare(a.inicio))
    const yo = SESION[q].id
    if (q !== 'admin') return json({ admin: false, conectado: CONECTADOS.has(yo), llamadas: todas.map(filaLlamada) })
    const ids = new Set([...CONECTADOS, ...todas.map((l) => l.coach_id)])
    const coaches = [...ids].map((id) => ({
      id, nombre: COACHES_LL[id], foto_url: null, conectado: CONECTADOS.has(id), llamadas: todas.filter((l) => l.coach_id === id).map(filaLlamada),
    })).sort((a, b) => (a.id === yo ? -1 : b.id === yo ? 1 : a.nombre.localeCompare(b.nombre)))
    return json({ admin: true, conectado: CONECTADOS.has(yo), coaches })
  })],
  ['POST', /^\/api\/llamadas\/por-link$/, con('equipo', (_, op, __, q) => {
    const b = cuerpo(op)
    const url = String(b.url || '').trim()
    if (!/fathom\.video\/(share|calls|recording)\/[A-Za-z0-9_-]+/.test(url)) return error('Ese link no parece de una llamada de Fathom.')
    let l = llamadas().find((x) => x.fathom_url === url)
    if (!l) {
      const c = b.cliente_id ? canalDe(Number(b.cliente_id)) : null
      l = { id: nuevoId(), coach_id: SESION[q].id, cliente_id: c?.cliente.id ?? null, titulo: c ? `Llamada con ${c.cliente.nombre}` : 'Llamada sin título', inicio: iso(90), duracion_min: 40, fathom_url: url, tema: 'el avance de la semana', con_transcripcion: true }
      llamadas().unshift(l)
    }
    return json(detalleLlamada(l))
  })],
  ['GET', /^\/api\/llamadas\/(\d+)$/, con('equipo', ([, id], _, __, q) => {
    const l = llamadas().find((x) => x.id === Number(id))
    return l && visibleLlamada(l, q) ? json(detalleLlamada(l)) : noEncontrado('No existe esa llamada.')
  })],
  ['PUT', /^\/api\/llamadas\/(\d+)\/cliente$/, con('equipo', ([, id], op, _u, q) => {
    const l = llamadas().find((x) => x.id === Number(id))
    if (!l || !visibleLlamada(l, q)) return noEncontrado('No existe esa llamada.')
    const cid = cuerpo(op).cliente_id
    if (cid != null && !canalDe(Number(cid))) return noEncontrado('No existe ese cliente.')
    l.cliente_id = cid == null ? null : Number(cid)
    return json(detalleLlamada(l))
  })],
  ['DELETE', /^\/api\/llamadas\/(\d+)$/, con('equipo', ([, id], _, __, q) => {
    const l = llamadas().find((x) => x.id === Number(id))
    if (!l) return noEncontrado('No existe esa llamada.')
    if (!visibleLlamada(l, q)) return prohibido('Solo podés borrar tus llamadas.')
    llamadas().splice(llamadas().indexOf(l), 1)
    return json({ ok: true })
  })],
  // Fathom de cada coach (el GET de /api/cuenta/fathom lo contesta handler.js)
  ['PUT', /^\/api\/cuenta\/fathom$/, con('equipo', (_, op, __, q) => {
    if (String(cuerpo(op).clave || '').trim().length < 20) return error('Pegá la API key completa de Fathom.')
    ESTADO_FATHOM[q] = true
    CONECTADOS.add(SESION[q].id)
    return json(estadoFathom(q))
  })],
  ['DELETE', /^\/api\/cuenta\/fathom$/, con('equipo', (_, __, ___, q) => {
    ESTADO_FATHOM[q] = false
    return json({ conectado: false })
  })],
  ['POST', /^\/api\/cuenta\/fathom\/sincronizar$/, con('equipo', (_, __, ___, q) => (ESTADO_FATHOM[q] ? json(estadoFathom(q)) : error('Conectá tu Fathom primero.')))],

  // Roadmap: el cliente ve el suyo; el equipo arma y edita. (handler.js tiene GET y PUT de pasos con el roadmap de Alan.)
  ['GET', /^\/api\/roadmap$/, () => json(armarRoadmap(CLIENTE.usuario_id))],
  ['GET', /^\/api\/roadmap\/clientes\/(\d+)$/, ([, id], op) => (quien(op) === 'cliente' && Number(id) !== CLIENTE.usuario_id ? noEncontrado('No existe ese cliente.') : json(armarRoadmap(Number(id))))],
  ['POST', /^\/api\/roadmap\/clientes\/(\d+)\/generar$/, con('equipo', ([, id], op) => generarRoadmap(Number(id), op))],
  ['POST', /^\/api\/roadmap\/clientes\/(\d+)$/, con('equipo', ([, id], op, _u, q) => {
    const cid = Number(id)
    const datos = cuerpo(op)
    const { limpio, fallo } = limpiarDoc(datos, false)
    if (fallo) return fallo
    if (limpio.principal) for (const d of roadmapDocs().filter((x) => x.cliente_id === cid)) d.principal = false
    roadmapDocs().push({
      id: nuevoId(), cliente_id: cid, coach_id: limpio.coach_id ?? SESION[q].id, titulo: limpio.titulo, tipo: limpio.tipo, url: limpio.url, fathom_url: limpio.fathom_url ?? null, fecha: limpio.fecha,
      area: limpio.area ?? null, principal: Boolean(limpio.principal), pasos: pasosConId(limpio.pasos || []), pasos_total: limpio.pasos_total ?? null, paso_actual: limpio.paso_actual ?? null,
    })
    return json(armarRoadmap(cid))
  })],
  ['PATCH', /^\/api\/roadmap\/docs\/(\d+)$/, con('equipo', ([, id], op) => {
    const d = roadmapDocs().find((x) => x.id === Number(id))
    if (!d) return noEncontrado('No existe ese documento.')
    const { limpio, fallo } = limpiarDoc(cuerpo(op), true)
    if (fallo) return fallo
    const { pasos, ...resto } = limpio
    if (pasos?.length) {
      // Al editar el texto de los pasos, lo que ya estaba tildado sigue tildado.
      const antes = new Map(d.pasos.map((p) => [p.texto, p]))
      d.pasos = pasosConId(pasos).map((p) => (antes.get(p.texto)?.hecho ? { ...p, hecho: true, hecho_en: antes.get(p.texto).hecho_en, hecho_por: antes.get(p.texto).hecho_por } : p))
    }
    if (resto.principal) for (const o of roadmapDocs().filter((x) => x.cliente_id === d.cliente_id)) o.principal = false
    Object.assign(d, resto)
    return json(armarRoadmap(d.cliente_id))
  })],
  ['DELETE', /^\/api\/roadmap\/docs\/(\d+)$/, con('equipo', ([, id]) => {
    const d = roadmapDocs().find((x) => x.id === Number(id))
    if (!d) return noEncontrado('No existe ese documento.')
    roadmapDocs().splice(roadmapDocs().indexOf(d), 1)
    return json(armarRoadmap(d.cliente_id))
  })],
  ['PUT', /^\/api\/roadmap\/docs\/(\d+)\/pasos\/(\d+)$/, (m, op) => {
    const d = roadmapDocs().find((x) => x.id === Number(m[1]))
    const p = d?.pasos.find((x) => x.id === Number(m[2]))
    if (!p) return noEncontrado('No existe ese paso.')
    const q = quien(op)
    p.hecho = Boolean(cuerpo(op).hecho)
    p.hecho_en = p.hecho ? iso() : null
    p.hecho_por = p.hecho ? { tipo: q === 'cliente' ? 'cliente' : 'equipo', id: SESION[q].id, nombre: SESION[q].nombre } : null
    return json(armarRoadmap(d.cliente_id))
  }],

  // Cuellos de botella (equipo)
  ['GET', /^\/api\/cuellos$/, con('equipo', () => json({ diagnosticos: cuellos().map(resumenCuello), jeremy: true }))],
  ['GET', /^\/api\/cuellos\/clientes$/, con('equipo', () => json(clientesCanal().filter((c) => !c.inactivo).map((c) => ({ id: c.cliente.id, nombre: c.cliente.nombre, plan: c.cliente.plan })).sort((a, b) => norm(a.nombre).localeCompare(norm(b.nombre)))))],
  ['GET', /^\/api\/cuellos\/neurona$/, con('equipo', () => json(neurona()))],
  ['GET', /^\/api\/cuellos\/cliente\/(\d+)$/, con('equipo', ([, id], _, __, q) => {
    const cid = Number(id)
    if (!canalDe(cid)) return noEncontrado('No existe ese cliente.')
    const suyos = cuellos().filter((d) => d.cliente_id === cid && (d.estado === 'aprobado' || d.admin_id === SESION[q].id))
    const periodos = [...new Set(cierre().respuestas.filter((r) => r.cliente_id === cid).map((r) => r.periodo))].sort().reverse()
    return json({
      ultimo: suyos[0]?.id ?? null, jeremy: true,
      cierres: periodos.map((p) => { const r = cierre().respuestas.find((x) => x.cliente_id === cid && x.periodo === p).respuestas; return { periodo: p, cuello: r.cuello, typeform: Array.isArray(r.typeform) } }),
      aprobados: suyos.filter((d) => d.estado === 'aprobado').map((d) => ({ id: d.id, aprobado_en: d.aprobado_en, cuello: frase(d.version_final) })),
    })
  })],
  ['POST', /^\/api\/cuellos$/, con('equipo', (_, op, __, q) => pedirCuello(op, q))],
  ['GET', /^\/api\/cuellos\/(\d+)$/, con('equipo', ([, id]) => {
    const d = cuelloPorId(id)
    return d ? json(detalleCuello(d)) : noEncontrado(NO_EXISTE_DIAG)
  })],
  ['PUT', /^\/api\/cuellos\/(\d+)$/, con('equipo', ([, id], op) => {
    const d = cuelloPorId(id)
    if (!d) return noEncontrado(NO_EXISTE_DIAG)
    const texto = String(cuerpo(op).texto || '')
    if (!texto.trim()) return error('El documento no puede quedar vacío.')
    if (d.estado !== 'borrador') return error('Solo se corrige el borrador que devolvió Jeremy.', 409)
    d.version_final = texto
    return json(detalleCuello(d))
  })],
  ['DELETE', /^\/api\/cuellos\/(\d+)$/, con('equipo', ([, id]) => {
    const d = cuelloPorId(id)
    if (!d) return noEncontrado(NO_EXISTE_DIAG)
    cuellos().splice(cuellos().indexOf(d), 1)
    return json({ ok: true })
  })],
  ['POST', /^\/api\/cuellos\/(\d+)\/reintentar$/, con('equipo', ([, id]) => {
    const d = cuelloPorId(id)
    if (!d) return noEncontrado(NO_EXISTE_DIAG)
    if (!['error', 'esperando'].includes(d.estado)) return error('Este diagnóstico ya volvió de Juan AI.', 409)
    Object.assign(d, { estado: 'pidiendo', error: null, _t0: Date.now() })
    return json(detalleCuello(d))
  })],
  ['PUT', /^\/api\/cuellos\/(\d+)\/tono$/, con('equipo', ([, id], op) => {
    const d = cuelloPorId(id)
    if (!d) return noEncontrado(NO_EXISTE_DIAG)
    if (d.estado !== 'borrador') return error('El tono se elige antes de aprobar.', 409)
    const { admin_id: adminId, texto } = cuerpo(op)
    const base = texto ?? d.version_final ?? d.version_jeremy ?? ''
    if (texto != null && !String(texto).trim()) return error('El documento no puede quedar vacío.')
    if (adminId == null) Object.assign(d, { version_final: base, tono_admin_id: 0 })
    else Object.assign(d, { version_final: base, version_tono: base, tono_admin_id: adminId })
    return json({ ...detalleCuello(d), sin_cambiar: [] })
  })],
  ['POST', /^\/api\/cuellos\/(\d+)\/aprobar$/, con('equipo', ([, id], op) => {
    const d = cuelloPorId(id)
    if (!d) return noEncontrado(NO_EXISTE_DIAG)
    if (d.estado !== 'borrador') return error('Solo se aprueba el borrador que devolvió Jeremy.', 409)
    const texto = cuerpo(op).texto
    if (texto != null) {
      if (!String(texto).trim()) return error('El documento no puede quedar vacío.')
      d.version_final = texto
    }
    if (norm(d.version_final).includes('nota para juan')) return error('Borrá la "Nota para Juan" del documento antes de aprobarlo: no le puede llegar al cliente.')
    const jeremy = d.version_tono || d.version_jeremy || ''
    Object.assign(d, { estado: 'aprobado', aprobado_en: iso(), coincidencia_jeremy: coincidencia(jeremy, d.version_final), coincidencia_cerebro: d.version_cerebro ? coincidencia(d.version_cerebro, d.version_final) : null })
    const cambios = cambiosDe(jeremy, d.version_final).map((c) => ({ ...c, propuesta: `Respetá el cambio en «${c.seccion}»: más directo y con los números del cliente.` }))
    return json({ ...detalleCuello(d), cambios })
  })],
  ['POST', /^\/api\/cuellos\/(\d+)\/reabrir$/, con('equipo', ([, id]) => {
    const d = cuelloPorId(id)
    if (!d) return noEncontrado(NO_EXISTE_DIAG)
    if (d.estado !== 'aprobado') return error('Ese diagnóstico no está aprobado.', 409)
    Object.assign(d, { estado: 'borrador', aprobado_en: null, coincidencia_jeremy: null, coincidencia_cerebro: null, doc_url: null })
    return json(detalleCuello(d))
  })],
  ['POST', /^\/api\/cuellos\/(\d+)\/google-doc$/, con('equipo', ([, id]) => {
    const d = cuelloPorId(id)
    if (!d) return noEncontrado(NO_EXISTE_DIAG)
    if (d.estado !== 'aprobado') return error('Primero hay que aprobar la versión final.', 409)
    d.doc_url ||= `https://docs.google.com/document/d/mock-diagnostico-${d.id}/edit`
    return json({ url: d.doc_url })
  })],
  ['POST', /^\/api\/cuellos\/(\d+)\/lecciones$/, con('equipo', ([, id], op) => {
    const d = cuelloPorId(id)
    if (!d || d.estado !== 'aprobado') return error('Primero se aprueba el diagnóstico.', 409)
    for (const l of cuerpo(op).lecciones || []) {
      const texto = String(l.texto || '').trim()
      if (texto && TODAS_SECC.includes(l.seccion)) LECCIONES.push({ id: nuevoId(), diagnostico_id: d.id, seccion: l.seccion, texto: texto.slice(0, 400), antes: l.antes || '', despues: l.despues || '', activa: true, creado_en: iso() })
    }
    return json(neurona())
  })],
  ['DELETE', /^\/api\/cuellos\/lecciones\/(\d+)$/, con('equipo', ([, id]) => {
    const l = LECCIONES.find((x) => x.id === Number(id))
    if (!l) return noEncontrado('No existe esa lección.')
    l.activa = false
    return json(neurona())
  })],

  // Biblioteca y SOPs solicitados (equipo)
  ['GET', /^\/api\/biblioteca$/, con('equipo', () => json(bibliotecaDe()))],
  ['GET', /^\/api\/biblioteca\/consultas$/, con('equipo', () => json(consultasGuia()))],
  ['GET', /^\/api\/sops-solicitados$/, con('equipo', () => json({ areas: AREAS_SOP, solicitudes: [...solicitudes()].sort((a, b) => b.creado_en.localeCompare(a.creado_en)).map(dictSolicitud) }))],
  ['PATCH', /^\/api\/sops-solicitados\/(\d+)$/, con('equipo', ([, id], op, _u, q) => {
    const s = solicitudes().find((x) => x.id === Number(id))
    if (!s) return noEncontrado('No existe esa solicitud.')
    const { estado, entrega_url: entrega } = cuerpo(op)
    if (estado != null && !['pendiente', 'en_proceso', 'entregado'].includes(estado)) return error('Estado inválido.')
    if (entrega != null) {
      const url = String(entrega).trim()
      if (url && !/^https?:\/\//.test(url)) return error('Pegá el link completo del SOP (https://…).')
      s.entrega_url = url || null
    }
    if (estado != null) {
      s.estado = estado
      s.resuelto_por = estado === 'entregado' ? SESION[q].nombre : null
      s.resuelto_en = estado === 'entregado' ? iso() : null
    }
    return json(dictSolicitud(s))
  })],

  // Live sessions (equipo) y Nueva clase (admin)
  ['GET', /^\/api\/live-sessions\/modulos$/, con('equipo', () => json(listaProgramas().filter((p) => (p.slug || '').startsWith('live-sessions')).map((p) => ({ id: p.id, titulo: p.titulo }))))],
  ['POST', /^\/api\/live-sessions$/, con('equipo', (_, op) => {
    const b = cuerpo(op)
    const titulo = String(b.titulo || '').split(/\s+/).filter(Boolean).join(' ')
    const url = String(b.url || '').trim()
    if (!titulo || titulo.length > 160) return error('Poné el título de la clase.')
    if (!/^https?:\/\//.test(url)) return error('Pegá el link de la grabación (Fathom, YouTube, Loom, Drive…).')
    const p = listaProgramas().find((x) => x.id === Number(b.programa_id) && (x.slug || '').startsWith('live-sessions'))
    if (!p) return noEncontrado('Ese no es un módulo de live sessions.')
    const completo = programaAdmin(p.id)
    let seccion = completo.secciones[0]
    if (!seccion) {
      seccion = { id: nuevoId(), titulo: 'CLASES', orden: 1, clases: [] };
      (EXTRA_SECC[p.id] ||= []).push(seccion)
    }
    const orden = Math.min(0, ...seccion.clases.map((c) => c.orden)) - 1
    const clase = nuevaClase(p, seccion, { titulo, orden, video_url: url, descripcion: b.descripcion || null })
    return json({ id: clase.id, programa_id: p.id, titulo }, 201)
  })],
  ['DELETE', /^\/api\/live-sessions\/(\d+)$/, con('equipo', ([, id]) => {
    for (const lista of Object.values(EXTRA_CLASES)) {
      const i = lista.findIndex((c) => c.id === Number(id))
      if (i >= 0) return lista.splice(i, 1) && sinContenido()
    }
    return noEncontrado('No es una live session.')
  })],
  ['GET', /^\/api\/admin\/programas$/, con('admin', () => json(listaProgramas().map((p) => {
    const d = programaAdmin(p.id)
    return { id: d.id, titulo: d.titulo, slug: d.slug, descripcion: d.descripcion, orden: d.orden, cover_url: d.cover_url, total_secciones: d.secciones.length, total_clases: d.secciones.reduce((t, s) => t + s.clases.length, 0) }
  })))],
  ['GET', /^\/api\/admin\/programas\/(\d+)$/, con('admin', ([, id]) => {
    const p = programaAdmin(Number(id))
    return p ? json(p) : noEncontrado('Módulo no encontrado')
  })],
  ['POST', /^\/api\/admin\/programas\/(\d+)\/secciones$/, con('admin', ([, id], op) => {
    const p = programaAdmin(Number(id))
    if (!p) return noEncontrado('Módulo no encontrado')
    const b = cuerpo(op)
    if (!String(b.titulo || '').trim()) return error('Poné el título de la sección.')
    const seccion = { id: nuevoId(), titulo: String(b.titulo).trim(), orden: b.orden ?? p.secciones.length + 1, clases: [] }
    ;(EXTRA_SECC[p.id] ||= []).push(seccion)
    return json(seccion, 201)
  })],
  ['POST', /^\/api\/admin\/secciones\/(\d+)\/clases$/, con('admin', ([, id], op) => {
    const p = programaDeSeccion(Number(id))
    if (!p) return noEncontrado('Sección no encontrada')
    const b = cuerpo(op)
    if (!String(b.titulo || '').trim()) return error('Poné el título de la clase.')
    return json(nuevaClase(p, p.secciones.find((s) => s.id === Number(id)), b), 201)
  })],
]
