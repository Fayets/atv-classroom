// Datos de prueba para trabajar el diseño sin backend ni base de datos.
// Solo se cargan cuando VITE_MOCK_API=1 (ver api/client.js). Editá libremente:
// nada de esto llega a producción.
//
// Las formas siguen exactamente lo que devuelve el backend real. Si cambiás un
// nombre de campo acá, la pantalla se rompe igual que se rompería con la API.

const AHORA = Date.now()

/** ISO en UTC sin milisegundos, igual que `_iso()` del backend. */
const haceMinutos = (minutos) => new Date(AHORA - minutos * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z')

export const USUARIO = {
  usuario_id: 3,
  nombre: 'Laureano Sierra',
  email: 'laureano@atvos.io',
  // 'admin' ve todos los canales y puede administrarlos: es lo más cómodo para
  // diseñar. Cambiá a 'coach' para ver la versión recortada del equipo.
  rol: 'admin',
  dias_restantes: null,
  foto_url: null,
  miembro: null,
}

// Para ver la app como cliente: entrá con un email que diga "cliente" (por ejemplo cliente@atv.io).
// Es Alan Klein, plan Boost; su canal privado es el 41. Forma de /api/auth/me para un cliente.
export const CLIENTE = {
  usuario_id: 141,
  nombre: 'Alan Klein',
  email: 'alan@ejemplo.com',
  rol: 'boost',
  pausa: false,
  contacto_pausa: null,
  motivo_pausa: null,
  permisos: { roadmaps: 'si', tools: 'si', chat: 'si' },
  dias_restantes: 87,
  fecha_vencimiento: '2027-02-19',
  foto_url: null,
  miembro: null,
}

// Para ver la app como alguien del equipo que no es admin: entrá con un email que diga "coach".
// Es Lucho Vicente, coach de Fulfillment: no ve lo de plata (pasar a Pausa o Vencidos, cambiar el plan)
// y, como en el backend (mensajeria_service.canales_de_coach), solo ve los chats de clientes donde lo
// etiquetaron, que dio de alta o con los que tuvo una llamada.
export const COACH = {
  usuario_id: 7,
  nombre: 'Lucho Vicente',
  email: 'lucho@atvos.io',
  rol: 'coach',
  dias_restantes: null,
  fecha_vencimiento: null,
  foto_url: null,
  miembro: null,
}
// Sus chats de clientes: Alan Klein (escribió ahí) y Facundo Martinez (es su responsable).
export const CHATS_DEL_COACH = [41, 50]

export const EQUIPO = [
  { id: 3, nombre: 'Laureano Sierra', area: 'Marketing', rol: 'admin', foto_url: null },
  { id: 5, nombre: 'Alejandro', area: 'Ventas', rol: 'coach', foto_url: null },
  { id: 6, nombre: 'Lucas', area: 'Sistemas', rol: 'coach', foto_url: null },
  { id: 7, nombre: 'Lucho Vicente', area: 'Fulfillment', rol: 'coach', foto_url: null },
  { id: 8, nombre: 'Nick', area: 'Ventas', rol: 'coach', foto_url: null },
]

const canalGrupo = (id, nombre, { orden, no_leidos = 0, menciones = 0, ultimo = null, tipo = 'grupo' }) => ({
  id,
  tipo,
  nombre,
  con: null,
  descripcion: null,
  cliente: null,
  bloqueado: false,
  ultimo,
  no_leidos,
  menciones,
  esperando_desde: null,
  roles: ['equipo', 'high', 'dfy', 'boost', 'mid', 'entry', 'mentoria'],
  creado_por: 3,
  orden,
  inactivo: false,
  pausa: false,
  vencido: false,
  archivo: null,
  puede_administrar: true,
})

const canalCliente = (
  id,
  nombre,
  plan,
  { no_leidos = 0, menciones = 0, ultimo = null, esperando_desde = null, responsable = null, vence = '2027-02-19', pausa = false, vencido = false, inactivo = false },
) => ({
  id,
  tipo: 'cliente',
  nombre,
  con: null,
  descripcion: null,
  cliente: {
    id: id + 100,
    nombre,
    plan,
    responsable,
    vence,
    slug: nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  },
  bloqueado: false,
  ultimo,
  no_leidos,
  menciones,
  esperando_desde,
  roles: null,
  creado_por: null,
  orden: null,
  inactivo,
  pausa,
  vencido,
  archivo: null,
  puede_administrar: false,
})

// Un chat directo: 'directo' (entre dos del equipo) o 'dm' (alguien del equipo con un cliente).
// `con` es la otra persona; el nombre del canal es su nombre.
const canalDirecto = (id, tipo, con, { no_leidos = 0, ultimo = null } = {}) => ({
  id,
  tipo,
  nombre: con.nombre,
  con: { ...con, foto_url: null },
  descripcion: null,
  cliente: null,
  bloqueado: false,
  ultimo,
  no_leidos,
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
})

const ultimo = (texto, autor_nombre, de, minutos) => ({
  texto,
  autor_nombre,
  de,
  creado_en: haceMinutos(minutos),
})

export const CANALES = [
  canalGrupo(1, '🔔┊updates', { orden: 1, ultimo: ultimo('Nueva versión del roadmap', 'Lucas', 'equipo', 600) }),
  canalGrupo(2, '📣┊anuncios', {
    orden: 2,
    tipo: 'anuncios',
    ultimo: ultimo('Se envió el reporte de cierre de mes', 'Franco', 'equipo', 180),
  }),
  canalGrupo(3, '👋┊presentación', { orden: 3, no_leidos: 4, ultimo: ultimo('Hola! Soy Ema, arranco esta semana', 'Ema Romero', 'cliente', 95) }),
  canalGrupo(4, '📚┊clases', { orden: 4, no_leidos: 12, ultimo: ultimo('Quedó grabada la clase de Sistemas', 'Lucho Vicente', 'equipo', 240) }),
  canalGrupo(5, '👥┊equipo', { orden: 5, ultimo: ultimo('Reunión movida a las 16', 'Alejandro', 'equipo', 1400) }),
  canalGrupo(6, '🏠┊general', { orden: 6, no_leidos: 3, menciones: 1, ultimo: ultimo('@everyone recuerden completar el cierre', 'Franco', 'equipo', 60) }),
  canalGrupo(7, '⚡┊boost', { orden: 7, no_leidos: 2, ultimo: ultimo('Arrancamos el ciclo nuevo', 'Lucas', 'equipo', 300) }),
  canalGrupo(8, '🏅┊wins-personales', { orden: 8, no_leidos: 6, ultimo: ultimo('Primera venta del mes 🎉', 'Alvaro Larraz', 'cliente', 45) }),
  canalGrupo(9, '🏆┊wins', { orden: 9, no_leidos: 9, ultimo: ultimo('Cerramos 4k esta semana', 'Cristopher Gonzalez', 'cliente', 120) }),
  canalGrupo(10, '📱┊cómo-usar-la-plataforma', { orden: 10, ultimo: ultimo('Guía actualizada', 'Lucas', 'equipo', 4000) }),

  canalCliente(20, 'Martín Ibarra', 'high', {
    responsable: 'Alejandro',
    ultimo: ultimo('Dale, lo reviso y te aviso', 'Martín Ibarra', 'cliente', 320),
  }),

  canalCliente(30, 'La Biblioteca de los Productos Digitales', 'dfy', {
    responsable: 'Lucas',
    ultimo: ultimo('Subimos los creativos nuevos', 'Lucas', 'equipo', 800),
  }),
  canalCliente(31, 'Paulina Taurian', 'dfy', {
    no_leidos: 3,
    responsable: 'Lucas',
    esperando_desde: haceMinutos(200),
    ultimo: ultimo('¿Pudieron ver el último ad?', 'Paulina Taurian', 'cliente', 200),
  }),

  canalCliente(41, 'Alan Klein', 'boost', {
    responsable: 'Alejandro',
    vence: '2027-02-06',
    ultimo: ultimo('¿Qué objetivos te pusiste esta semana?', 'Alejandro', 'equipo', 30),
    esperando_desde: null,
  }),
  canalCliente(42, 'Alicia Damian', 'boost', {
    responsable: 'Alejandro',
    ultimo: ultimo('Perfecto, gracias!', 'Alicia Damian', 'cliente', 500),
  }),
  canalCliente(43, 'Alvaro Larraz', 'boost', {
    no_leidos: 2,
    menciones: 1,
    responsable: 'Lucas',
    esperando_desde: haceMinutos(140),
    ultimo: ultimo('Che @Lucas, me traba el checkout', 'Alvaro Larraz', 'cliente', 140),
  }),
  canalCliente(44, 'Cristopher Gonzalez', 'boost', {
    responsable: 'Alejandro',
    ultimo: ultimo('Te mando el loom mañana', 'Alejandro', 'equipo', 900),
  }),
  canalCliente(45, 'Ema Romero', 'boost', {
    no_leidos: 5,
    responsable: null,
    esperando_desde: haceMinutos(70),
    ultimo: ultimo('Quedé trabada con el avatar', 'Ema Romero', 'cliente', 70),
  }),

  canalCliente(50, 'Facundo Martinez', 'mid', {
    no_leidos: 1,
    responsable: 'Lucho Vicente',
    ultimo: ultimo('Listo, lo subí', 'Facundo Martinez', 'cliente', 260),
  }),
  canalCliente(60, 'Har Program', 'entry', {
    responsable: null,
    ultimo: ultimo('Bienvenidos!', 'Lucas', 'equipo', 2600),
  }),
  canalCliente(70, 'Rocío Fernández', 'mentoria', {
    no_leidos: 4,
    responsable: 'Alejandro',
    esperando_desde: haceMinutos(420),
    ultimo: ultimo('¿Cuándo es la próxima live?', 'Rocío Fernández', 'cliente', 420),
  }),
  canalCliente(80, 'Nicolás Ayala', '2k', {
    responsable: null,
    ultimo: ultimo('Gracias!', 'Nicolás Ayala', 'cliente', 3000),
  }),
  canalCliente(90, 'Cuenta sin asignar', 'sin-plan', {
    responsable: null,
    vence: null,
    ultimo: null,
  }),

  canalCliente(100, 'Rodrigo Medina', 'mid', {
    vencido: true,
    responsable: 'Lucas',
    vence: '2026-10-01',
    ultimo: ultimo('Se venció el acceso', 'Lucas', 'equipo', 10000),
  }),
  canalCliente(110, 'Sofía Gauna', 'boost', {
    pausa: true,
    responsable: 'Alejandro',
    ultimo: ultimo('Pausamos un mes', 'Alejandro', 'equipo', 20000),
  }),
  canalCliente(120, 'Tomás Beltrán', 'entry', {
    inactivo: true,
    responsable: null,
    ultimo: ultimo('Dio de baja', 'Lucas', 'equipo', 40000),
  }),

  // Mensajes directos: uno con alguien del equipo (2 sin leer) y uno privado del equipo con una clienta.
  canalDirecto(300, 'directo', { id: 5, tipo: 'equipo', nombre: 'Alejandro' }, {
    no_leidos: 2,
    ultimo: ultimo('Dale, lo vemos mañana a primera hora', 'Alejandro', 'equipo', 25),
  }),
  canalDirecto(301, 'dm', { id: 131, tipo: 'cliente', nombre: 'Paulina Taurian' }, {
    ultimo: ultimo('Gracias! Lo reviso hoy', 'Paulina Taurian', 'cliente', 320),
  }),
]

const yo = { tipo: 'equipo', id: 3, nombre: 'Laureano Sierra', foto_url: null, rol: 'admin', area: 'Marketing' }
const alejandro = { tipo: 'equipo', id: 5, nombre: 'Alejandro', foto_url: null, rol: 'coach', area: 'Ventas' }
const lucas = { tipo: 'equipo', id: 6, nombre: 'Lucas', foto_url: null, rol: 'coach', area: 'Sistemas' }
const lucho = { tipo: 'equipo', id: 7, nombre: 'Lucho Vicente', foto_url: null, rol: 'coach', area: 'Fulfillment' }
const cliente = (id, nombre) => ({ tipo: 'cliente', id, nombre, foto_url: null, rol: null, area: null })

const mensaje = (id, canal_id, autor, texto, minutos, extra = {}) => ({
  id,
  canal_id,
  autor,
  texto,
  adjuntos: [],
  borrado: false,
  editado: false,
  respuesta_a: null,
  reacciones: [],
  creado_en: haceMinutos(minutos),
  origen: null,
  menciones: [],
  tildes: [],
  ...extra,
})

/** Mensajes por canal. Un canal sin entrada acá arranca vacío. */
export const MENSAJES = {
  300: [
    mensaje(701, 300, yo, '¿Pudiste ver el roadmap de Alan? Quiero mandárselo hoy', 95),
    mensaje(702, 300, alejandro, 'Sí, está bien armado. Solo cambiaría el paso 3 por la llamada de diagnóstico', 40),
    mensaje(703, 300, alejandro, 'Dale, lo vemos mañana a primera hora', 25),
  ],
  301: [
    mensaje(711, 301, yo, 'Paulina, te dejé el SOP de anuncios en tu canal 🙌', 360),
    mensaje(712, 301, cliente(131, 'Paulina Taurian'), 'Gracias! Lo reviso hoy', 320),
  ],
  41: [
    mensaje(101, 41, lucas, '@everyone hoy tenemos clase en vivo con @nick 🎙️ Traigan sus dudas, y lo que esté frenando sus ventas ahora mismo.', 10080, { menciones: [8] }),
    mensaje(102, 41, cliente(141, 'Alan Klein'), 'Buenísimo, ahí me sumo', 10020),
    mensaje(103, 41, lucho, '@everyone ¡únanse a la clase de Sistemas! 🎙️ traigan sus dudas que los esté frenando esta semana, que la resolvemos ahí', 8640),
    mensaje(104, 41, alejandro, 'feliz inicio de semana Alan! 👋', 35),
    mensaje(105, 41, alejandro, '¿Qué objetivos te pusiste esta semana? Así vemos cómo te damos un SOP, un loom personalizado o un roadmap para lograrlo. Quedo atento, @Alan', 30, {
      reacciones: [{ emoji: '👍', quienes: ['cliente:141'], nombres: ['Alan Klein'] }],
    }),
    // El último es del cliente: así el Tab sugiere una respuesta y aparece "Qué pensó".
    mensaje(106, 41, cliente(141, 'Alan Klein'), 'Quiero cerrar 3 clientes nuevos este mes. ¿Me pasan el link de la clase de ventas?', 8),
  ],
  43: [
    mensaje(201, 43, cliente(143, 'Alvaro Larraz'), 'Che @Lucas, me traba el checkout, no me deja cobrar en pesos', 140, { menciones: [6] }),
    mensaje(202, 43, cliente(143, 'Alvaro Larraz'), 'Te paso captura', 139, {
      adjuntos: [{ id: 9, nombre: 'checkout.png', tipo_mime: 'image/png', tamano: 183204, url: 'https://placehold.co/900x520/EBE8E2/1D1D1F?text=checkout.png' }],
      texto: '',
    }),
  ],
  45: [
    mensaje(301, 45, cliente(145, 'Ema Romero'), 'Hola! Quedé trabada con el avatar, no sé si apuntar a principiantes o a los que ya facturan', 70),
    mensaje(302, 45, yo, 'Hola Ema! Te armo un SOP para definirlo. ¿Cuántos clientes cerraste hasta ahora?', 60),
    mensaje(303, 45, cliente(145, 'Ema Romero'), 'Tres, y los tres ya facturaban', 55, {
      respuesta_a: { id: 302, autor_nombre: 'Laureano Sierra', texto: 'Hola Ema! Te armo un SOP para definirlo. ¿Cuántos clientes cerraste hasta ahora?' },
    }),
  ],
  6: [
    mensaje(401, 6, { ...lucas, nombre: 'Franco' }, '@everyone buenas buenas, se envió el #reporte-de-cierre-de-mes, recuerden rellenarlo para que el equipo pueda ayudarlos a destrabar su cuello de botella principal, saludos 🙌', 60),
  ],
}

export const NO_LEIDOS = { no_leidos: 31, esperando: 4 }
