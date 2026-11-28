// Datos de prueba de Ventas (DMs de Instagram, embudo, contactos, automatizaciones) y de Contenido (historias y
// reels con lo que trajeron). Imitan la forma que lee ui/app/07, 08 y 08-z. Todo inventado.
const hace = (min) => new Date(Date.now() - min * 60_000).toISOString()
const dia = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

const GENTE = [
  ['c1', 'Natalia Ferreyra', 'nati.fit', 8, true, 'calificado', 8.2, 'Tiene un estudio de pilates y quiere escalar con online.'],
  ['c2', 'Lucas Benítez', 'lucasb.coach', 22, true, 'calificado', 7.4, 'Coach de running con 3 clientes; busca sistema de ventas.'],
  ['c3', 'Camila Ruiz', 'cami.nutri', 45, false, 'no', 3.1, 'Recién arranca, sin presupuesto por ahora.'],
  ['c4', 'Martín Suárez', 'martin.inmo', 90, false, 'pendiente', null, ''],
  ['c5', 'Sofía Pereyra', 'sofi.makeup', 180, true, 'calificado', 6.8, 'Maquilladora con agenda llena; quiere un curso grabado.'],
  ['c6', 'Diego Romero', 'diegorom', 320, false, 'pendiente', null, ''],
  ['c7', 'Valen Ortiz', 'valen.ortiz', 600, false, 'no', 2.4, 'Busca algo gratis.'],
  ['c8', 'Juli Gómez', 'juli.gomez.ok', 1400, false, 'calificado', 7.9, 'Fotógrafa; ya vende servicios a marcas.'],
]
const ULTIMOS = ['¡Sí! Me interesa, ¿cómo sigue?', 'Te paso mi número para la llamada', 'Gracias, lo voy a pensar', 'Hola, vi tu historia del lanzamiento', 'Me encantó el reel de ayer 🔥', 'Precio?', 'jaja buenísimo', 'Dale, el jueves me viene bien']

export function bandeja() {
  return {
    conversaciones: GENTE.map(([id, nombre, usuario, min, sinLeer, veredicto, puntaje, razon], i) => ({
      id, nombre, usuario, participante: `p-${id}`, foto: null, actualizado: hace(min), sin_leer: sinLeer,
      ultimo_mensaje: ULTIMOS[i], solicitud: i === 6, vino_de_un_anuncio: i === 1 || i === 4, verificado: i === 7,
      seguidores: [1820, 4300, 650, 12100, 23800, 310, 95, 8700][i], te_sigue: i % 3 !== 2, lo_seguis: i % 2 === 0,
      link: `https://www.instagram.com/${usuario}/`, calificacion: { veredicto, puntaje, razon },
    })),
    siguiente: null,
  }
}

export function chat(id) {
  const c = GENTE.find((g) => g[0] === id) ?? GENTE[0]
  const nombre = c[1].split(' ')[0]
  const base = c[3] + 60
  return {
    mensajes: [
      { quien: 'lead', texto: 'Hola! Vi tu historia del lanzamiento del programa', fecha: hace(base), historia: { url: null, guardada: 'historia-1.svg' } },
      { quien: 'nosotros', texto: `¡Hola ${nombre}! Qué bueno que te escribas 🙌 ¿A qué te dedicás hoy?`, fecha: hace(base - 4), nombre: 'Sofía (setter)' },
      { quien: 'lead', texto: 'Tengo un estudio y quiero empezar a vender online, pero no sé por dónde arrancar', fecha: hace(base - 15) },
      { quien: 'nosotros', texto: 'Perfecto, justo eso es lo que trabajamos en el programa. ¿Te parece si lo vemos en una llamada de 20 minutos?', fecha: hace(base - 18), nombre: 'Sofía (setter)' },
      { quien: 'lead', texto: ULTIMOS[GENTE.indexOf(c)], fecha: hace(c[3]) },
    ],
  }
}

export function embudo() {
  const dias = Array.from({ length: 12 }, (_, i) => ({ dia: dia(11 - i), chats: 8 + ((i * 7) % 9), conversaciones: 5 + ((i * 5) % 6), pitches: 2 + (i % 4), calendlys: 1 + (i % 3), shows: i % 3, cierres: i % 5 === 0 ? 1 : 0 }))
  const suma = (k) => dias.reduce((t, d) => t + d[k], 0)
  return {
    desde: dias[0].dia, hasta: dias.at(-1).dia,
    chats: suma('chats'), conversaciones: suma('conversaciones'), pitches: suma('pitches'), calendlys: suma('calendlys'), shows: suma('shows'), noShows: 3, cierres: suma('cierres'), agendas: suma('calendlys') - 2,
    origenes: { historias: 61, reels: 38, otros: 24 },
    registro: { leyendo: false, conversaciones: 123, leidas: 123, total: 123 },
    dias,
    detalle: {},
  }
}

const PASOS = ['chat', 'conversacion', 'pitch', 'agenda', 'show', 'cierre']
export function contactos() {
  return {
    inicio: dia(25),
    registro: { leyendo: false },
    piezas: { h1: { miniatura: 'historia-1.svg', fecha: hace(3000) }, r1: { miniatura: '/media/historias/reel-1.svg', texto: '3 errores que te frenan a vender online', fecha: hace(5000) } },
    contactos: GENTE.map(([id, nombre, usuario, min, , veredicto, puntaje, razon], i) => {
      const paso = PASOS[[2, 4, 0, 1, 5, 0, 1, 3][i]]
      return {
        usuario, nombre, conversacion: id, conversaciones: [id], paso, no_vino: i === 6,
        entradas: [(() => { const origen = ['historia', 'anuncio', 'reel', 'otros', 'anuncio', 'historia', 'reel', 'historia'][i]; return { origen, fecha: hace(min + 2000), ...(origen === 'historia' ? { historia: 'h1' } : {}), ...(origen === 'reel' ? { reel: 'r1', palabra: 'PROGRAMA' } : {}), ...(origen === 'anuncio' ? { anuncio: { nombre: 'Lanzamiento · video testimonio', campana: 'Noviembre' } } : {}) } })()],
        ultimo: { fecha: hace(min), de: i % 2 ? 'nosotros' : 'lead' },
        ultima_nota: i % 3 === 0 ? { autor: 'Sofía', texto: 'Muy interesada, agenda para el jueves.' } : null,
        fechas: { chat: hace(min + 2000), conversacion: hace(min + 1900), pitch: hace(min + 1500), agenda: hace(min + 900), show: hace(min + 300), cierre: hace(min + 100), link: hace(min + 1400) },
        calificacion: { veredicto, puntaje, razon },
      }
    }),
  }
}

export function flujos() {
  const f = (id, nombre, estado, tipo, palabra, mini, entraron, resp, clics, term, ult) => ({ id, nombre, estado, editado: hace(600 + entraron), disparo: { tipo, palabras: [palabra], miniatura: mini, etiqueta: palabra.toLowerCase(), mediaId: mini ? 'm1' : null }, corridas: { empezaron: entraron, terminaron: term }, estadisticas: { respondieron: resp, clics, ultimos7: ult, parcial: false } })
  return {
    automatizaciones: [
      f('a1', 'Lanzamiento del programa', 'active', 'historia', 'PROGRAMA', '/media/historias/historia-1.svg', 214, 171, 96, 88, 42),
      f('a2', 'Reel: 3 errores al vender', 'active', 'reel', 'GUIA', '/media/historias/reel-1.svg', 389, 301, 188, 140, 77),
      f('a3', 'Clase gratis por DM', 'paused', 'dm', 'CLASE', null, 57, 33, 12, 10, 0),
      f('a4', 'Webinar de diciembre', 'draft', 'historia', 'WEBINAR', '/media/historias/historia-2.svg', 0, 0, 0, 0, 0),
    ],
  }
}

const sec = (id, minutos, titulo, etapa, dolor, angulo, pedido, vistas, r, tono, texto, porque) => ({
  k: 's', id, fecha: hace(minutos), historias: vistas.map((v, i) => ({ id: `${id}-${i}`, imagen: `historia-${(i % 4) + 1}.svg`, vistas: v })),
  etiqueta: { titulo, etapa, dolor, angulo, pedido, pedido_en: pedido ? vistas.length : null }, r, lectura: { tono, texto, porque },
})
const idea = (id, minutos, titulo, etapa, dolor, angulo, pedido, versiones, r, extra, tono, texto, porque) => ({
  k: 'r', id, fecha: hace(minutos), vistas: versiones.reduce((t, v) => t + v.vistas, 0),
  versiones: versiones.map((v, i) => ({ id: `${id}-v${i}`, media: `${id}-m${i}`, gancho: v.gancho, vistas: v.vistas, fecha: hace(minutos - i * 1440), imagen: `reel-${(i % 3) + 1}.svg`, segundos: v.seg, duracion: 32, saltan: 41, link: 'https://www.instagram.com/', r: { chats: v.chats } })),
  etiqueta: { titulo, etapa, dolor, angulo, pedido, idea: titulo }, r, ...extra, lectura: { tono, texto, porque },
})
const R = (chats, conversaciones, pitches, agendas, shows, cierres, calificados) => ({ chats, conversaciones, pitches, agendas, shows, cierres, calificados })

export function vista() {
  return {
    seCalifica: true,
    sinLeer: 2,
    dolores: ['No sé cómo vender online', 'No tengo tiempo', 'Miedo a mostrarme'],
    angulos: ['Historia personal', 'Error común', 'Caso de alumno'],
    ventas: { vistas: 48200, chats: 123, conversaciones: 74, pitches: 41, agendas: 19, shows: 14, cierres: 5 },
    origenes: { historias: 61, reels: 38, otros: 24 },
    seVe: [
      { numero: '3×', texto: 'Las secuencias con un caso de alumno traen el triple de chats.', detalle: 'Promedio de 18 chats contra 6 del resto.' },
      { numero: '41 %', texto: 'De los que escriben por un reel llegan al pitch.', detalle: 'Por historias llega el 28 %.' },
      { numero: 'BOFU', texto: 'Falta contenido de cierre para "Miedo a mostrarme".', detalle: 'Hay TOFU y MOFU, pero nada que pida la llamada.' },
    ],
    secuencias: [
      sec('s1', 600, 'Caso de Nati: de 0 a 12 alumnas', 'BOFU', 'No sé cómo vender online', 'Caso de alumno', 'Escribí PROGRAMA', [2100, 1840, 1610, 1390, 1220], R(21, 15, 9, 4, 3, 2, 8), 'ok', 'Funcionó', 'Trajo 21 chats y 8 calificados: la mejor de la semana.'),
      sec('s2', 2100, 'Un día en mi estudio', 'TOFU', 'No tengo tiempo', 'Historia personal', '', [2600, 2010, 1500], R(4, 2, 1, 0, 0, 0, 1), 'neutro', 'Normal', 'Mucha vista y pocos chats: no pedía nada.'),
      // La semana que viene: una secuencia armándose, con pasos pendientes, programados y uno ya publicado.
      { ...sec('s4', 120, 'Semana de lanzamiento: 5 días hacia la llamada', 'BOFU', 'Miedo a mostrarme', 'Caso de alumno', 'Agendá tu llamada', [1650, 0, 0, 0, 0], R(3, 2, 1, 0, 0, 0, 1), 'neutro', 'En curso', 'Salió la primera historia; las otras cuatro se van armando.'), plan: [{ estado: 'publicada' }, { estado: 'programada', fecha: new Date(Date.now() + 20 * 3600_000).toISOString() }, { estado: 'programada', fecha: new Date(Date.now() + 44 * 3600_000).toISOString() }, { estado: 'en_preparacion' }, { estado: 'pendiente' }], pasos: ['El caso de Nati, antes', 'Qué cambió en 90 días', 'El miedo a mostrarse', 'Cómo es la llamada', 'Agendá tu llamada'] },
      sec('s3', 4300, 'El error que más veo', 'MOFU', 'Miedo a mostrarme', 'Error común', 'Respondé GUIA', [1900, 1700, 1480, 1300], R(12, 8, 4, 2, 1, 1, 4), 'ok', 'Funcionó', 'Buena retención: llegó el 68 % hasta el pedido.'),
    ],
    ideas: [
      idea('i1', 1500, '3 errores que te frenan a vender online', 'MOFU', 'No sé cómo vender online', 'Error común', 'Comentá GUIA', [{ gancho: '3 errores que te frenan a vender online', vistas: 18400, seg: 14, chats: 22 }, { gancho: 'Si vendés online, dejá de hacer esto', vistas: 9100, seg: 11, chats: 9 }], R(31, 20, 12, 6, 4, 2, 11), { guardados: 640, compartidos: 212, comentarios: 380 }, 'ok', 'Funcionó', 'La mejor idea del mes: 31 chats entre dos versiones.'),
      idea('i2', 3800, 'Cómo armé mi agenda de 6 meses', 'TOFU', 'No tengo tiempo', 'Historia personal', '', [{ gancho: 'Cómo armé mi agenda de 6 meses', vistas: 7600, seg: 9, chats: 3 }], R(3, 2, 1, 0, 0, 0, 1), { guardados: 120, compartidos: 40, comentarios: 22 }, 'neutro', 'Normal', 'Se vio bien pero no pedía nada.'),
      idea('i3', 6000, 'Mi primera clase grabada', 'TOFU', 'Miedo a mostrarme', 'Historia personal', '', [{ gancho: 'Mi primera clase grabada (y por qué casi no la subo)', vistas: 980, seg: 4, chats: 0 }], R(0, 0, 0, 0, 0, 0, 0), { guardados: 8, compartidos: 2, comentarios: 5 }, 'mal', 'Casi no salió', 'Se cortó a los 4 segundos: el gancho no enganchó.'),
    ],
  }
}

// Miniaturas inventadas: un degradé con una forma, en tonos de la marca, para que las historias y reels tengan imagen.
const TONOS = [['#c0392b', '#571306'], ['#242321', '#5c5953'], ['#d9a066', '#8a5a2b'], ['#1f8a4c', '#0c3d22'], ['#b5562e', '#3a1b0c']]
export function miniatura(nombre) {
  const n = [...nombre].reduce((t, c) => t + c.charCodeAt(0), 0)
  const [a, b] = TONOS[n % TONOS.length]
  const reel = nombre.startsWith('reel')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 270 480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="270" height="480" fill="url(#g)"/><circle cx="${60 + (n % 150)}" cy="${150 + (n % 120)}" r="${70 + (n % 40)}" fill="rgba(255,255,255,.12)"/><rect x="24" y="330" width="180" height="14" rx="7" fill="rgba(255,255,255,.75)"/><rect x="24" y="356" width="130" height="14" rx="7" fill="rgba(255,255,255,.45)"/>${reel ? '<path d="M118 216l44 24-44 24z" fill="rgba(255,255,255,.85)"/>' : ''}</svg>`
}
