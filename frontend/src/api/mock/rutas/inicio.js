// Rutas del mock: Inicio (la guía, los frentes, la consulta al coach y la solicitud de SOP) y lo que faltaba
// de Mi cuenta (foto, nombre, dispositivos, voz). Ver util.js para la forma de cada ruta.
// Mismas formas que el backend: frente_controller / guia_service / buscador_sops_service / frente_service /
// solicitud_service / cuenta_controller.

import { detalleClase, detallePrograma, listaProgramas } from '../classroom'
import { frentesDelCliente } from '../extras'
import { cuerpo, dia, iso, json, noEncontrado, nuevoId, quien, sinContenido } from '../util'

// ---------------------------------------------------------------- Clases del classroom
const normal = (t) =>
  String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const VACIAS = new Set(['para', 'como', 'cómo', 'que', 'qué', 'una', 'uno', 'unos', 'unas', 'los', 'las', 'del', 'con', 'sin', 'por', 'mis', 'tus', 'sus', 'est', 'esta', 'este', 'esto', 'todo', 'nada', 'muy', 'mas', 'pero', 'porque', 'cuando', 'hay', 'tengo', 'tener', 'hacer', 'quiero', 'necesito', 'busco', 'sop', 'sops', 'plantilla', 'guion', 'de', 'el', 'la', 'en', 'mi', 'me', 'se', 'lo', 'le', 'no', 'si', 'ya'])
const raiz = (p) => (p.length > 5 && p.endsWith('es') ? p.slice(0, -2) : p.length > 4 && p.endsWith('s') ? p.slice(0, -1) : p)
const palabras = (t) => normal(t).split(' ').filter((p) => p.length > 2 && !VACIAS.has(p)).map(raiz)

let indice = null
function clases() {
  if (indice) return indice
  indice = listaProgramas().flatMap((p) => {
    const d = detallePrograma(p.id)
    return (d?.secciones || []).flatMap((s) => s.clases.map((c) => ({ id: c.id, titulo: c.titulo, modulo: p.titulo, seccion: s.titulo, programa_id: p.id, portada: p.cover_url, claves: palabras(`${c.titulo} ${s.titulo}`) })))
  })
  return indice
}
const porTitulo = (titulo) => clases().find((c) => normal(c.titulo) === normal(titulo))

// coaches.json del backend
const COACHES = {
  'juan-cruz': { clave: 'juan-cruz', nombre: 'Juan Cruz', area: 'Misión, visión y marketing' },
  juampi: { clave: 'juampi', nombre: 'Juampi', area: 'Ads y lanzamientos' },
  lucas: { clave: 'lucas', nombre: 'Lucas', area: 'Ventas' },
  nick: { clave: 'nick', nombre: 'Nick', area: 'Closing' },
  franco: { clave: 'franco', nombre: 'Franco', area: 'Sistemas, procesos y equipos' },
}

// La tarjeta de una clase recomendada (guia_service._tarjeta).
function tarjeta(c, cubre = null, coach = null) {
  const d = detalleClase(c.id)
  return {
    clase_id: c.id,
    titulo: c.titulo,
    modulo: c.modulo,
    seccion: c.seccion,
    programa_id: c.programa_id,
    recursos: d?.recursos || [],
    cubre,
    resumen: d?.resumen || null,
    coach,
  }
}

// ---------------------------------------------------------------- Frentes
// Los problemas del catálogo (problemas.json): qué clases lo resuelven, de qué coach es y con qué palabras se
// reconoce cuando el cliente lo cuenta en la guía.
const PROBLEMAS = {
  'lo-voy-a-pensar': {
    coach: 'nick',
    resolver: ['Manejo de objeciones', 'Cierre y próximos pasos', 'Seguimiento sin presionar'],
    sop: 'Cierre y próximos pasos',
    claves: ['pensar', 'objecion', 'cierre', 'cerrar', 'cierro', 'caro', 'precio', 'decid', 'compran', 'no compra'],
    cubrir: ['Las 3 objeciones que más escuchás y tu respuesta a cada una', 'Cómo pedís la decisión al final de la llamada', 'Qué pasa si dice "lo voy a pensar": el seguimiento con fecha'],
  },
  'no-se-presentan': {
    coach: 'lucas',
    resolver: ['Agenda de llamadas', 'Calificar leads'],
    sop: 'Agenda de llamadas',
    claves: ['presentan', 'presenta', 'agenda', 'agendan', 'aparecen', 'faltan', 'no show', 'confirm', 'plantan'],
    cubrir: ['El mensaje de confirmación 24 h y 1 h antes', 'Qué hacés si no aparece en los primeros 5 minutos', 'Cómo calificás antes de darle un turno'],
  },
  'todo-depende-de-mi': {
    coach: 'franco',
    resolver: ['Delegar sin perder control', 'Rutina semanal del dueño', 'Onboarding de clientes', 'Escalar la entrega'],
    sop: 'Delegar sin perder control',
    claves: ['depende', 'delegar', 'delego', 'equipo', 'tiempo', 'solo', 'sola', 'todo yo', 'proceso', 'manual', 'desborda', 'no doy abasto'],
    cubrir: ['Las tareas que hacés vos y quién podría hacerlas', 'Cómo se entrega cada tarea: el paso a paso', 'Cómo controlás sin estar encima'],
  },
}
// Temas que no son un frente, pero igual tienen clases (la guía recomienda igual).
const TEMAS = [
  { claves: ['plata', 'ganando', 'gano', 'numero', 'margen', 'rentab', 'factur', 'costo', 'metrica'], clases: ['Números que importan', 'Tablero de métricas', 'Metas trimestrales'], coach: 'franco' },
  { claves: ['anuncio', 'ads', 'meta', 'campana', 'creativo', 'pauta', 'leads caros'], clases: ['Estructura de campañas', 'Creativos que convierten', 'Leer las métricas'], coach: 'juampi' },
  { claves: ['contenido', 'instagram', 'reels', 'seguidores', 'marca', 'posicion'], clases: ['Pilares de contenido', 'Ganchos que retienen', 'Guiones para reels'], coach: 'juan-cruz' },
  { claves: ['oferta', 'nicho', 'avatar', 'cliente ideal', 'garantia'], clases: ['Armar la oferta irresistible', 'Elegir tu nicho', 'Tu avatar ideal'], coach: 'juan-cruz' },
  { claves: ['setter', 'vendedor', 'closer', 'comercial'], clases: ['Contratar setters', 'Guion de setter', 'Métricas del equipo comercial'], coach: 'lucas' },
]

const catalogo = frentesDelCliente()
// El frente abierto de cada problema, por persona (cliente / admin / coach). Arranca con los del catálogo.
const frentes = { admin: {}, coach: {}, cliente: {} }
for (const p of catalogo.problemas) for (const k of Object.keys(frentes)) frentes[k][p.slug] = p.frente ? { ...p.frente, sops: {} } : null

const clasesDe = (slug) => PROBLEMAS[slug].resolver.map(porTitulo).filter(Boolean)
const plantillas = (slug) => {
  const vistos = new Set()
  return [...clasesDe(slug), porTitulo(PROBLEMAS[slug].sop)].filter(Boolean).flatMap((c) =>
    (detalleClase(c.id)?.recursos || [])
      .filter((r) => !vistos.has(r.url + c.id) && vistos.add(r.url + c.id))
      .map((r) => ({ ...r, clase_id: c.id, clase_titulo: c.titulo, completable: /docs\.google\.com/.test(r.url) })),
  )
}

// 0 resolver, 1 documentar, 2 revisar, 3 listo (frente_service._paso).
function paso(slug, f) {
  if (!f) return 0
  if (!clasesDe(slug).every((c) => f.vistas.includes(c.id))) return 0
  if (!f.sop_link && !Object.keys(f.sops || {}).length) return 1
  return f.revisado ? 3 : 2
}

const listaFrentes = (sesion) => ({
  ...catalogo,
  problemas: catalogo.problemas.map((p) => ({ ...p, frente: frentes[sesion][p.slug] })),
})

function detalleFrente(slug, sesion) {
  const p = catalogo.problemas.find((x) => x.slug === slug)
  if (!p) return null
  const sop = porTitulo(PROBLEMAS[slug].sop)
  return {
    slug,
    area: p.area,
    titulo: p.titulo,
    sintoma: p.sintoma,
    resolver: clasesDe(slug).map((c) => {
      const d = detalleClase(c.id)
      return {
        id: c.id,
        titulo: c.titulo,
        video_url: d?.video_url ?? null,
        video_proximamente: d?.video_proximamente ?? true,
        video_bloqueado_para: d?.video_bloqueado_para ?? [],
        modulo: c.modulo,
        portada: c.portada,
        programa_id: c.programa_id,
        recursos: d?.recursos || [],
        resumen: d?.resumen || null,
        claves: d?.claves || [],
      }
    }),
    plantillas: plantillas(slug),
    sop: { nombre: p.sop_nombre, recursos: sop ? detalleClase(sop.id)?.recursos || [] : [], cubrir: PROBLEMAS[slug].cubrir },
    frente: frentes[sesion][slug],
    coach: COACHES[PROBLEMAS[slug].coach],
  }
}

function actualizarFrente(slug, sesion, cambios) {
  const f = frentes[sesion][slug] || { vistas: [], sop_link: null, sops: {}, revisado: false, paso: 0, actualizado_en: iso() }
  const permitidas = new Set(clasesDe(slug).map((c) => c.id))
  if (Array.isArray(cambios.vistas)) f.vistas = [...new Set(cambios.vistas.filter((i) => permitidas.has(i)))].sort((a, b) => a - b)
  if ('sop_link' in cambios) {
    const link = String(cambios.sop_link || '').trim()
    if (link && !/^https?:\/\//.test(link)) return json({ detail: 'El link del SOP tiene que empezar con https://' }, 400)
    f.sop_link = link || null
  }
  if (cambios.sops && typeof cambios.sops === 'object') {
    f.sops = { ...(f.sops || {}) }
    for (const [id, valor] of Object.entries(cambios.sops)) {
      const link = String(valor || '').trim()
      if (link && !/^https?:\/\//.test(link)) return json({ detail: 'El link tiene que empezar con https://' }, 400)
      if (link) f.sops[id] = link
      else delete f.sops[id]
    }
  }
  if (cambios.revisado != null) f.revisado = Boolean(cambios.revisado)
  f.actualizado_en = iso()
  f.paso = paso(slug, f)
  frentes[sesion][slug] = f
  return json(f)
}

// ---------------------------------------------------------------- La guía
// Si parece la búsqueda de un SOP ("SOP de onboarding", "guion de cierre") lista los que hay; si cuenta un
// problema, recomienda las clases que lo resuelven, lo asocia a un frente y lo deriva al coach del tema.
const pideSop = (texto) => {
  const q = normal(texto)
  if (/\b(sop|sops|plantilla|plantillas|guion|template|checklist)\b/.test(q)) return true
  return q.split(' ').length <= 4 && !/\b(no|me|nos|tengo|estoy|cuesta|puedo|dicen|depende)\b/.test(q)
}
const contiene = (q, claves) => claves.some((k) => q.includes(k))
const puntaje = (c, buscadas) => c.claves.filter((k) => buscadas.some((b) => k.startsWith(b) || b.startsWith(k))).length

function buscarClases(texto, max) {
  const buscadas = palabras(texto)
  if (!buscadas.length) return []
  return clases()
    .map((c) => [puntaje(c, buscadas), c])
    .filter(([n]) => n > 0)
    .sort((a, b) => b[0] - a[0])
    .slice(0, max)
    .map(([, c]) => c)
}

function guia(texto) {
  const q = normal(texto)
  const tema = TEMAS.find((t) => contiene(q, t.claves))

  if (pideSop(texto)) {
    const encontradas = buscarClases(texto, 5)
    const coach = COACHES[tema?.coach || 'franco']
    return { modo: 'sops', sops: encontradas.map((c) => ({ ...tarjeta(c, null, coach), fuente: 'classroom' })), recomendaciones: [], coach, frente: null, fuente: 'palabras' }
  }

  const slug = Object.keys(PROBLEMAS).find((s) => contiene(q, PROBLEMAS[s].claves))
  if (slug) {
    const coach = COACHES[PROBLEMAS[slug].coach]
    const extra = buscarClases(texto, 6).filter((c) => !PROBLEMAS[slug].resolver.includes(c.titulo))
    const elegidas = [...clasesDe(slug), ...extra].slice(0, 4)
    // La cita solo si está en el mensaje (como el backend): la frase corta que escribió.
    const cita = texto.trim().length <= 90 ? texto.trim().replace(/[?.!]+$/, '') : null
    return {
      modo: 'guia',
      recomendaciones: elegidas.map((c, i) => tarjeta(c, i === 0 ? cita : null, coach)),
      coach,
      frente: { slug, titulo: catalogo.problemas.find((p) => p.slug === slug).titulo },
      fuente: 'palabras',
    }
  }

  const delTema = tema ? tema.clases.map(porTitulo).filter(Boolean) : []
  const elegidas = [...delTema, ...buscarClases(texto, 4).filter((c) => !delTema.includes(c))].slice(0, 4)
  const coach = COACHES[tema?.coach || 'lucas']
  return { modo: 'guia', recomendaciones: elegidas.map((c) => tarjeta(c, null, coach)), coach, frente: null, fuente: 'palabras' }
}

// ---------------------------------------------------------------- Mi cuenta
// Lo que se cambia en Mi cuenta (foto, nombre) y los dispositivos cerrados: handler.js lo suma a
// GET /api/cuenta y GET /api/cuenta/dispositivos, que viven allá.
export const cambiosCuenta = { admin: {}, coach: {}, cliente: {} }
export const dispositivosCerrados = new Set()
export const vozElegida = { admin: 3, coach: 3, cliente: null }

// ---------------------------------------------------------------- Rutas
export const rutas = [
  // Frentes (GET /api/frentes vive acá, con el estado de cada persona)
  ['GET', /^\/api\/frentes$/, (_, opciones) => json(listaFrentes(quien(opciones)))],
  ['GET', /^\/api\/frentes\/([^/]+)$/, ([, slug], opciones) => {
    const d = detalleFrente(decodeURIComponent(slug), quien(opciones))
    return d ? json(d) : noEncontrado('Ese frente no existe.')
  }],
  ['PUT', /^\/api\/frentes\/([^/]+)$/, ([, slug], opciones) => {
    const s = decodeURIComponent(slug)
    if (!PROBLEMAS[s]) return noEncontrado('Ese frente no existe.')
    return actualizarFrente(s, quien(opciones), cuerpo(opciones))
  }],
  ['DELETE', /^\/api\/frentes\/([^/]+)$/, ([, slug], opciones) => {
    const s = decodeURIComponent(slug)
    const sesion = quien(opciones)
    if (!frentes[sesion][s]) return noEncontrado('Ese frente no está abierto.')
    frentes[sesion][s] = null
    return sinContenido()
  }],

  // La guía del Inicio
  ['POST', /^\/api\/guia$/, (_, opciones) => {
    const texto = String(cuerpo(opciones).texto || '').trim()
    if (texto.length < 3) return json({ detail: [{ msg: 'Contá un poco más (al menos 3 letras).' }] }, 422)
    return json(guia(texto))
  }],

  // Consulta del cliente a su coach (frente_controller.consulta_coach). Con { pregunta } es la del equipo al
  // Cerebro: se deja pasar a rutas/admin.js.
  ['POST', /^\/api\/consultas$/, (_, opciones) => {
    const { texto, slug } = cuerpo(opciones)
    if (texto == null) return null
    const coach = slug && PROBLEMAS[slug] ? COACHES[PROBLEMAS[slug].coach] : null
    return json({ id: nuevoId(), texto, slug: slug || null, creado_en: iso(), avisado: true, coach: coach ? coach.nombre : null })
  }],

  // Pedir un SOP que no existe (solicitud_service.crear)
  ['POST', /^\/api\/solicitudes-sop$/, () => json({ id: nuevoId(), estado: 'pendiente', entrega_desde: dia(5), entrega_hasta: dia(7) }, 201)],

  // Mi cuenta
  ['POST', /^\/api\/cuenta\/foto$/, (_, opciones) => {
    const archivo = opciones?.body instanceof FormData ? opciones.body.get('archivo') : null
    if (!archivo) return json({ detail: 'Elegí una foto.' }, 422)
    const foto_url = URL.createObjectURL(archivo)
    Object.assign(cambiosCuenta[quien(opciones)], { foto_url, foto_propia: true })
    return json({ foto_url })
  }],
  ['DELETE', /^\/api\/cuenta\/foto$/, (_, opciones) => {
    Object.assign(cambiosCuenta[quien(opciones)], { foto_url: null, foto_propia: false })
    return json({ foto_url: null })
  }],
  ['PUT', /^\/api\/cuenta\/nombre$/, (_, opciones) => {
    const nombre = String(cuerpo(opciones).nombre || '').trim()
    if (nombre.length < 2) return json({ detail: 'Poné tu nombre (al menos 2 letras).' }, 422)
    cambiosCuenta[quien(opciones)].nombre = nombre
    return json({ nombre })
  }],
  ['DELETE', /^\/api\/cuenta\/dispositivos\/(\d+)$/, ([, id]) => {
    dispositivosCerrados.add(Number(id))
    return sinContenido()
  }],
  ['PUT', /^\/api\/cuenta\/voz$/, (_, opciones) => {
    const sesion = quien(opciones)
    if (sesion === 'cliente') return json({ detail: 'Solo el equipo elige la voz del Tab.' }, 403)
    vozElegida[sesion] = Number(cuerpo(opciones).admin_id) || null
    return json({ elegida: vozElegida[sesion], propia: true })
  }],
]
