// Datos de prueba del Cerebro (admin): el grafo y el detalle de cada neurona.
// Forma de backend/src/services/cerebro_service.py (_construir, nodo y los _detalle_*).
// Se arma una sola vez, de forma determinista, con los clientes, clases y frentes del resto del mock.

import { CANALES, MENSAJES } from './datos'
import { detalleClase, detallePrograma, listaProgramas } from './classroom'
import { frentesDelCliente } from './extras'
import { dia, iso } from './util'

// ---------------------------------------------------------------- catálogo fijo
const CONCEPTOS = [
  ['avatar', 'Avatar', 'La persona concreta a la que le vendés: qué le duele, qué quiere y cómo habla.'],
  ['oferta', 'Oferta', 'Lo que prometés, a quién y por cuánto: el resultado que el cliente compra, no el producto.'],
  ['precio', 'Precio', 'El número que acompaña a la promesa. Se valida con ventas reales, no con opiniones.'],
  ['garantia', 'Garantía', 'La forma de bajar el riesgo del comprador para que decida sin miedo.'],
  ['nicho', 'Nicho', 'El segmento del mercado donde tu oferta es la opción obvia.'],
  ['embudo', 'Embudo de ventas', 'El recorrido que hace un desconocido hasta convertirse en cliente.'],
  ['lead', 'Lead', 'Una persona que levantó la mano y todavía no compró.'],
  ['calificacion', 'Calificación de leads', 'Filtrar quién puede y quiere comprar antes de gastar una llamada.'],
  ['llamada', 'Llamada de ventas', 'La conversación de diagnóstico y cierre, estructurada en pasos.'],
  ['objeciones', 'Manejo de objeciones', 'Responder el "lo voy a pensar" y el "no tengo plata" sin presionar.'],
  ['seguimiento', 'Seguimiento', 'Volver a escribirle al lead que no contestó, con algo de valor.'],
  ['setter', 'Setter', 'Quien conversa con los leads y los pasa a llamada.'],
  ['closer', 'Closer', 'Quien hace la llamada de cierre.'],
  ['contenido', 'Contenido', 'Lo que publicás para atraer a tu avatar: reels, historias, emails.'],
  ['gancho', 'Gancho', 'Los primeros segundos de un contenido: lo que decide si lo siguen viendo.'],
  ['reels', 'Reels', 'Videos cortos verticales, el formato principal de alcance orgánico.'],
  ['meta-ads', 'Meta Ads', 'Publicidad paga en Instagram y Facebook.'],
  ['creativos', 'Creativos', 'Las piezas (video o imagen) de un anuncio. El creativo es la palanca más grande.'],
  ['retargeting', 'Retargeting', 'Volver a mostrarle anuncios a quien ya te visitó o interactuó.'],
  ['metricas', 'Métricas', 'Los pocos números que dicen si el negocio está sano.'],
  ['sop', 'SOP', 'Procedimiento operativo estándar: un proceso documentado paso a paso.'],
  ['automatizacion', 'Automatización', 'Que el sistema haga solo lo repetitivo: avisos, seguimientos, reportes.'],
  ['crm', 'CRM', 'Donde viven los leads y su etapa. Sin esto se pierden ventas.'],
  ['onboarding', 'Onboarding de clientes', 'Los primeros días del cliente: que llegue rápido a su primer resultado.'],
  ['retencion', 'Retención', 'Que el cliente se quede y renueve.'],
  ['delegar', 'Delegar', 'Sacarte de las tareas que otro puede hacer mejor y más barato.'],
  ['lanzamiento', 'Lanzamiento', 'Una venta concentrada en pocos días con carrito abierto.'],
  ['testimonios', 'Testimonios', 'Prueba social: resultados contados por clientes reales.'],
]
const NOMBRE_CONCEPTO = Object.fromEntries(CONCEPTOS.map(([id, nombre]) => [id, nombre]))

const NICHOS = [
  ['fitness', 'Fitness'],
  ['marketing-digital', 'Marketing digital'],
  ['finanzas-trading', 'Finanzas y trading'],
  ['desarrollo-personal', 'Desarrollo personal'],
  ['idiomas', 'Idiomas'],
  ['belleza-estetica', 'Belleza y estética'],
  ['educacion', 'Educación'],
  ['contenido-creadores', 'Creadores de contenido'],
]

const COACHES = {
  'coach:juan-cruz': { nombre: 'Juan Cruz', area: 'Misión, visión y marketing', admin: null },
  'coach:juampi': { nombre: 'Juampi', area: 'Ventas y setters', admin: null },
  'coach:lucas': { nombre: 'Lucas', area: 'Sistemas y automatizaciones', admin: 6 },
  'equipo:5': { nombre: 'Alejandro', area: 'ventas', admin: 5 },
  'equipo:7': { nombre: 'Lucho Vicente', area: 'fulfillment', admin: 7 },
  'equipo:8': { nombre: 'Nick', area: 'ventas', admin: 8 },
}
const COACH_DE_RESPONSABLE = { Alejandro: 'equipo:5', Lucas: 'coach:lucas', 'Lucho Vicente': 'equipo:7' }
const COACH_DE_MODULO = ['coach:juan-cruz', 'coach:juampi', 'coach:lucas']

const VINCULO_HECHO = {
  tema: 'habló de', dolor: 'le duele', objecion: 'objetó', pedido: 'pidió',
  recomendacion: 'le recomendaron', le_funciono: 'le funcionó', no_le_funciono: 'no le funcionó', logro: 'logró',
}
const VINCULO_NICHO = { dolor: 'les duele', objecion: 'objetan', le_funciono: 'les funcionó', no_le_funciono: 'no les funcionó' }

// Cómo se redacta cada hecho aprendido (el %c es el concepto en minúscula).
const FRASES = {
  tema: ['Preguntó por %c y cómo aplicarlo esta semana.', 'Quiere entender mejor %c antes de seguir.'],
  dolor: ['Le cuesta %c: no sabe por dónde arrancar.', 'Se frena con %c y lo posterga hace semanas.', 'Dice que %c le consume demasiado tiempo.'],
  objecion: ['Duda de que %c funcione en su caso.', 'Le preocupa invertir en %c sin ver resultados primero.'],
  pedido: ['Pidió un SOP de %c.', 'Pidió una llamada para revisar %c.'],
  recomendacion: ['Le recomendaron revisar la clase de %c.', 'Le sugirieron empezar por %c antes de escalar.'],
  le_funciono: ['Le funcionó trabajar %c con un caso real.', 'Mejoró sus números después de ordenar %c.'],
  no_le_funciono: ['Probó %c por su cuenta y no le dio resultado.'],
  logro: ['Logró cerrar su primera venta aplicando %c.', 'Consiguió 3 llamadas agendadas gracias a %c.'],
}
const CITAS = {
  tema: ['che, ¿cómo era lo de %c?', 'quería preguntarles por %c'],
  dolor: ['no me sale %c, me trabo siempre', 'es lo que más me cuesta, %c'],
  objecion: ['no sé si %c va a andar en mi nicho', 'me da miedo gastar en %c'],
  pedido: ['¿me pueden pasar algo de %c?', 'necesito ayuda con %c'],
  recomendacion: ['me dijeron que mire %c', 'Alejandro me recomendó %c'],
  le_funciono: ['con %c subí bastante', 'lo de %c me ordenó todo'],
  no_le_funciono: ['probé %c y nada'],
  logro: ['cerré el primero con %c!!', 'salió, gracias por lo de %c'],
}

const NOMBRES_CLIENTE_VENDE = [
  'Programa de entrenamiento online', 'Mentoría de ventas para coaches', 'Curso de inglés conversacional', 'Asesoría de trading',
  'Programa de hábitos y mentalidad', 'Servicio de diseño de marca', 'Curso de maquillaje profesional', 'Comunidad para creadores',
]

// ---------------------------------------------------------------- azar determinista
function semilla(n) {
  let a = n >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const azar = semilla(20261125)
const elegir = (lista) => lista[Math.floor(azar() * lista.length)]
const entre = (a, b) => a + Math.floor(azar() * (b - a + 1))
const mezclar = (lista) => [...lista].sort(() => azar() - 0.5)
const hace = (dias) => iso(dias * 1440 + entre(0, 700))

const bonito = (t) => t // los títulos del mock ya vienen como frase normal
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1)

// ---------------------------------------------------------------- armado del grafo
let armado = null

function armar() {
  const nodos = new Map()
  const enlaces = new Map()
  const nodo = (id, tipo, nombre, extra = {}) => {
    if (!nodos.has(id)) nodos.set(id, { id, tipo, nombre, creado_en: null, ...extra })
  }
  const enlace = (a, b, tipo, creado = null) => {
    if (!nodos.has(a) || !nodos.has(b) || a === b) return
    const clave = [a < b ? a : b, a < b ? b : a, tipo].join('|')
    const previo = enlaces.get(clave)
    if (!previo) enlaces.set(clave, { a, b, tipo, creado_en: creado, veces: 1 })
    else {
      previo.veces += 1
      if (creado && (!previo.creado_en || creado < previo.creado_en)) previo.creado_en = creado
    }
  }
  const detalles = {} // id → detalle que no se calcula al vuelo

  // Conocimiento: módulos → clases → conceptos
  const clases = []
  for (const { id: programaId } of listaProgramas()) {
    const p = detallePrograma(programaId)
    nodo(`modulo:${p.id}`, 'modulo', bonito(p.titulo), { bloqueado: listaProgramas().find((x) => x.id === p.id)?.bloqueado || false })
    detalles[`modulo:${p.id}`] = { descripcion: p.descripcion || `Módulo ${p.titulo} del classroom.`, bloqueado: false, enlace: `/classroom/${p.id}` }
    const coachClave = COACH_DE_MODULO[p.id % COACH_DE_MODULO.length]
    for (const s of p.secciones) {
      for (const c of s.clases) {
        nodo(`clase:${c.id}`, 'clase', bonito(c.titulo))
        enlace(`modulo:${p.id}`, `clase:${c.id}`, 'contiene')
        clases.push({ id: c.id, modulo: p, seccion: s, coachClave })
      }
    }
  }
  for (const [id, nombre, definicion] of CONCEPTOS) {
    nodo(`concepto:${id}`, 'concepto', nombre)
    detalles[`concepto:${id}`] = { definicion }
  }
  for (const [clave, c] of Object.entries(COACHES)) {
    nodo(clave, 'coach', c.nombre, { area: c.area })
  }
  for (const c of clases) {
    enlace(c.coachClave, `clase:${c.id}`, 'enseña')
    for (const cid of mezclar(CONCEPTOS).slice(0, entre(1, 3))) enlace(`clase:${c.id}`, `concepto:${cid[0]}`, 'trata')
  }
  for (const [slug, nombre] of NICHOS) {
    nodo(`nicho:${slug}`, 'nicho', nombre)
  }

  // Frentes (el catálogo de problemas de Inicio)
  const frentes = frentesDelCliente().problemas
  for (const f of frentes) {
    nodo(`frente:${f.slug}`, 'frente', f.titulo)
    detalles[`frente:${f.slug}`] = { sintoma: f.sintoma, senales: [f.sintoma, `Aparece en ${f.area.toLowerCase()}`, 'Se repite en varias llamadas'], area: f.area, enlace: `/frentes/${f.slug}` }
    for (const c of mezclar(clases).slice(0, f.clases_resolver + 1)) enlace(`frente:${f.slug}`, `clase:${c.id}`, 'se resuelve con')
  }

  // Clientes con acceso (los del mock que no están vencidos ni dados de baja)
  const clientes = CANALES.filter((c) => c.tipo === 'cliente' && c.cliente && !c.vencido && !c.inactivo)
  const nichoDe = {}
  let solicitudes = 0
  clientes.forEach((canal, i) => {
    const cli = canal.cliente
    const cid = `cliente:${cli.id}`
    const plan = (cli.plan || 'sin plan').toLowerCase()
    nodo(`plan:${plan}`, 'plan', cap(plan))
    nodo(cid, 'cliente', cli.nombre)
    enlace(cid, `plan:${plan}`, 'tiene el plan')

    const [nichoSlug] = NICHOS[i % NICHOS.length]
    nichoDe[cli.id] = nichoSlug
    enlace(cid, `nicho:${nichoSlug}`, 'es del nicho', hace(entre(5, 60)))

    // Hechos aprendidos
    const hechos = []
    for (let k = 0; k < entre(4, 7); k += 1) {
      const tipo = elegir(Object.keys(FRASES))
      const concepto = elegir(CONCEPTOS)[0]
      const cuando = hace(entre(1, 80))
      const nombre = NOMBRE_CONCEPTO[concepto].toLowerCase()
      hechos.push({
        tipo,
        concepto,
        texto: elegir(FRASES[tipo]).replace('%c', nombre),
        cita: elegir(CITAS[tipo]).replace('%c', nombre),
        dicho_en: cuando,
      })
      enlace(cid, `concepto:${concepto}`, VINCULO_HECHO[tipo], cuando)
      if (VINCULO_NICHO[tipo]) enlace(`nicho:${nichoSlug}`, `concepto:${concepto}`, VINCULO_NICHO[tipo], cuando)
    }
    hechos.sort((x, y) => (x.dicho_en < y.dicho_en ? 1 : -1))

    // Lo que hizo: clases completadas, charla con su coach
    for (const c of mezclar(clases).slice(0, entre(2, 9))) enlace(cid, `clase:${c.id}`, 'completó', hace(entre(1, 70)))
    const coach = COACH_DE_RESPONSABLE[cli.responsable]
    if (coach) {
      for (let k = 0; k < entre(1, 3); k += 1) enlace(cid, coach, 'conversó con', hace(entre(1, 40)))
    }
    if (i % 4 === 0) enlace(cid, `frente:${frentes[i % frentes.length].slug}`, 'trabaja el frente', hace(entre(2, 30)))
    if (i % 5 === 1) {
      solicitudes += 1
      const sid = `solicitud:${solicitudes}`
      const cuando = hace(entre(1, 25))
      const problemas = ['SOP para calificar leads', 'Guion de llamada de cierre', 'Checklist de lanzamiento', 'Plantilla de seguimiento']
      nodo(sid, 'solicitud', problemas[solicitudes % problemas.length], { creado_en: cuando })
      enlace(cid, sid, 'pidió un SOP', cuando)
      enlace(sid, `concepto:${['sop', 'llamada', 'lanzamiento', 'seguimiento'][solicitudes % 4]}`, 'trata', cuando)
      detalles[sid] = { area: ['Sistemas', 'Ventas', 'Marketing', 'Ventas'][solicitudes % 4], consulta: `Necesito material sobre ${problemas[solicitudes % problemas.length].toLowerCase()}.`, estado: solicitudes % 2 ? 'pendiente' : 'resuelto', creado_en: cuando }
    }
    detalles[cid] = { _hechos: hechos, _canal: canal, _indice: i }
  })
  detalles._nichoDe = nichoDe

  // Se ignoran neuronas sueltas (menos clientes y módulos), como el backend.
  const conectados = new Set()
  for (const e of enlaces.values()) {
    conectados.add(e.a)
    conectados.add(e.b)
  }
  const lista = [...nodos.values()].filter((n) => conectados.has(n.id) || n.tipo === 'cliente' || n.tipo === 'modulo')
  const listaEnlaces = [...enlaces.values()]
  const fechas = listaEnlaces.map((e) => e.creado_en).filter(Boolean)
  const porTipo = {}
  for (const n of lista) porTipo[n.tipo] = (porTipo[n.tipo] || 0) + 1
  const grafo = {
    nodos: lista,
    enlaces: listaEnlaces,
    resumen: { neuronas: lista.length, conexiones: listaEnlaces.length, aprendidas: fechas.length, ultima: fechas.length ? fechas.reduce((a, b) => (a > b ? a : b)) : null, por_tipo: porTipo },
    generado_en: iso(0),
  }
  return { grafo, detalles, clases }
}

const cerebro = () => (armado ||= armar())

export const grafoCerebro = () => cerebro().grafo

// ---------------------------------------------------------------- detalle por neurona
const ESTADOS_PASO = ['hecho', 'hecho', 'parcial', 'no_hecho', 'no_se_hablo']
const PASOS = ['Grabar 3 historias por día con el CTA', 'Armar el Typeform de calificación', 'Documentar el onboarding en un SOP', 'Pasar las conversaciones a llamada', 'Revisar los números de la semana']

function roadmapsDe(indice) {
  return [
    {
      titulo: indice % 2 ? 'Ventas' : 'Sistemas',
      fecha: dia(-30 - indice),
      coach: indice % 2 ? 'Alejandro Pérez' : 'Lucho Vicente',
      hechos: 3,
      total: 5,
      resultado: PASOS.map((paso, k) => ({
        paso,
        estado: ESTADOS_PASO[(k + indice) % ESTADOS_PASO.length],
        resultado: k % 2 ? 'Lo hizo a medias: avanzó con dos de las tres historias.' : null,
      })),
    },
  ]
}

function detalleCliente(id) {
  const { detalles } = cerebro()
  const d = detalles[id]
  if (!d) return {}
  const canal = d._canal
  const cli = canal.cliente
  const i = d._indice
  const mensajes = (MENSAJES[canal.id] || [])
    .filter((m) => !m.borrado)
    .slice(-6)
    .map((m) => ({ autor: m.autor.nombre, texto: (m.texto || 'Archivo adjunto').slice(0, 240), creado_en: m.creado_en }))
  const nicho = NICHOS[i % NICHOS.length]
  const vence = cli.vence
  const diasRestantes = vence ? Math.round((new Date(`${vence}T00:00:00`) - Date.now()) / 864e5) : null
  return {
    email: `${cli.slug.replace(/-/g, '.')}@ejemplo.com`,
    plan: cli.plan,
    vence,
    dias_restantes: diasRestantes,
    responsable: cli.responsable,
    mensajes,
    consultas: [
      { texto: 'cómo hago para que no se me caigan las llamadas agendadas?', creado_en: hace(entre(2, 20)) },
      { texto: 'qué clase tengo que ver primero para armar mi oferta', creado_en: hace(entre(21, 40)) },
    ],
    perfil: {
      nicho: nicho[0],
      nicho_nombre: nicho[1],
      nicho_texto: nicho[1],
      que_vende: NOMBRES_CLIENTE_VENDE[i % NOMBRES_CLIENTE_VENDE.length],
      etapa: ['Arrancando', 'Primeras ventas', 'Escalando'][i % 3],
      facturacion: ['USD 1.500/mes', 'USD 4.000/mes', 'USD 9.000/mes'][i % 3],
      objetivo: 'Cerrar 3 clientes nuevos por mes con un proceso repetible',
      tono_cliente: ['informal, voseo, mensajes cortos', 'cuidadoso, pregunta mucho', 'directo, va al grano'][i % 3],
    },
    aprendido: d._hechos.slice(0, 15).map(({ tipo, texto, cita, dicho_en }) => ({ tipo, texto, cita, dicho_en })),
    roadmaps: roadmapsDe(i),
    onboarding: {
      respondido_en: hace(entre(40, 120)),
      ficha: {
        oferta: NOMBRES_CLIENTE_VENDE[i % NOMBRES_CLIENTE_VENDE.length],
        precio: ['USD 297', 'USD 497', 'USD 1.200'][i % 3],
        avatar: 'Personas de 28 a 45 años que quieren resultados sin complicarse',
        facturacion: ['USD 1.500/mes', 'USD 4.000/mes', 'USD 9.000/mes'][i % 3],
        canales: 'Instagram y WhatsApp',
        chats_por_mes: String(20 + i * 7),
        cierre: `${15 + (i % 4) * 5}%`,
        clientes_activos: String(4 + i),
        equipo: i % 2 ? 'Yo solo/a' : 'Un setter part-time',
        problemas: 'Conseguir leads calificados, cerrar más llamadas, ordenar el seguimiento',
        freno: 'No tengo un proceso de ventas repetible',
        objetivo: 'Llegar a USD 10K/mes en 4 meses',
        probo_antes: 'Un curso grabado y una agencia que no funcionó',
        por_que_entro: 'Quería acompañamiento de gente que ya lo hizo',
      },
    },
    enlace: `/mensajes?c=${canal.id}`,
  }
}

function detalleCoach(clave) {
  const c = COACHES[clave]
  if (!c) return {}
  const conAdmin = c.admin != null
  return {
    area: c.area,
    voz: conAdmin
      ? {
          mensajes: 1240,
          palabras_promedio: 18,
          todo_minuscula_pct: 12,
          mayuscula_inicial_pct: 88,
          punto_final_pct: 15,
          preguntas_pct: 34,
          voseo_pct: 71,
          alarga_palabras_pct: 6,
          emojis_pct: 22,
          muletillas: ['dale', 'perfecto', 'buenísimo'],
          abreviaturas: ['q', 'xq', 'tmb'],
          palabras_propias: ['destrabar', 'cuello de botella', 'loom'],
          aperturas_top: ['Hola', 'Buenas', 'Genial'],
          emojis_top: ['🙌', '👋', '🔥'],
        }
      : null,
    roadmaps: conAdmin
      ? {
          guardados: 38,
          borradores: 44,
          enviados: 35,
          sin_cambios: 21,
          pasos_sacados: 17,
          pasos_agregados: 12,
          pasos_reescritos: 29,
          cumplimiento: 64,
          ultimos: [
            { cliente: 'Alan Klein', sin_cambios: false, sacados: ['Leé un libro de marketing'], agregados: ['Mandame el Typeform'], reescritos: [{ antes: 'Grabá historias', despues: 'Grabá 3 historias por día con el CTA PLAN' }] },
            { cliente: 'Ema Romero', sin_cambios: true, sacados: [], agregados: [], reescritos: [] },
          ],
        }
      : null,
  }
}

function detalleNicho(slug) {
  const { detalles } = cerebro()
  const clientes = CANALES.filter((c) => detalles[`cliente:${c.cliente?.id}`] && detalles._nichoDe[c.cliente.id] === slug)
  const dolores = [{ que: 'Calificación de leads', veces: 5 }, { que: 'Seguimiento', veces: 3 }, { que: 'Oferta', veces: 2 }]
  const hecho = (cliente, texto, cita) => ({ cliente, texto, cita })
  return {
    clientes: clientes.map((c, i) => ({ id: c.cliente.id, nombre: c.cliente.nombre, que_vende: NOMBRES_CLIENTE_VENDE[i % NOMBRES_CLIENTE_VENDE.length], etapa: null, subnicho: null })),
    dolores,
    objeciones: [{ que: 'Precio', veces: 4 }, { que: 'Garantía', veces: 2 }],
    recomendaciones: [{ que: 'SOP', veces: 3 }, { que: 'Llamada de ventas', veces: 2 }],
    le_funciono: clientes.slice(0, 2).map((c) => hecho(c.cliente.nombre, 'Ordenó el seguimiento con una planilla simple.', 'con la planilla ya no se me pierde ninguno')),
    no_le_funciono: clientes.slice(2, 3).map((c) => hecho(c.cliente.nombre, 'Probó anuncios sin tener la oferta clara.', 'gasté y no entró nadie')),
  }
}

function detalleClaseCerebro(id) {
  const { clases } = cerebro()
  const claseId = Number(id.split(':')[1])
  const c = clases.find((x) => x.id === claseId)
  const d = detalleClase(claseId)
  if (!c || !d) return {}
  return {
    modulo: bonito(c.modulo.titulo),
    seccion: bonito(c.seccion.titulo),
    resumen: d.resumen,
    claves: d.claves,
    sintomas: ['no sé por dónde arrancar con esto', 'me trabo cuando tengo que aplicarlo', 'lo vi pero no lo implementé'],
    recursos: d.recursos.map((r) => ({ titulo: r.titulo, url: r.url })),
    enlace: `/classroom/${c.modulo.id}?clase=${claseId}`,
  }
}

/** /api/admin/cerebro/nodo: la neurona con su contenido y sus vecinas. null si no existe. */
export function nodoCerebro(id) {
  const { grafo, detalles } = cerebro()
  const base = grafo.nodos.find((n) => n.id === id)
  if (!base) return null
  const porId = new Map(grafo.nodos.map((n) => [n.id, n]))
  const vecinos = []
  for (const e of grafo.enlaces) {
    if (e.a !== id && e.b !== id) continue
    const otro = porId.get(e.a === id ? e.b : e.a)
    if (otro) vecinos.push({ id: otro.id, tipo: otro.tipo, nombre: otro.nombre, vinculo: e.tipo, veces: e.veces, creado_en: e.creado_en })
  }
  vecinos.sort((x, y) => !x.creado_en - !y.creado_en || (x.creado_en || '').localeCompare(y.creado_en || '') || x.nombre.localeCompare(y.nombre))
  const [tipo, clave] = id.split(':')
  let detalle = {}
  if (tipo === 'cliente') detalle = detalleCliente(id)
  else if (tipo === 'clase') detalle = detalleClaseCerebro(id)
  else if (tipo === 'coach' || tipo === 'equipo') detalle = detalleCoach(id)
  else if (tipo === 'nicho') detalle = detalleNicho(clave)
  else if (tipo === 'plan') detalle = {}
  else detalle = detalles[id] || {}
  return { ...base, detalle, vecinos }
}
