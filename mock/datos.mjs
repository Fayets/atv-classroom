// Datos de prueba para ver la interfaz de Leverage sin el servidor real. Imitan la forma de lo que devuelve
// el servidor local (/state y las demás rutas) a partir de lo que lee el código de ui/app/. Todo es inventado.

const ahora = () => Date.now();
export const hace = (min) => new Date(ahora() - min * 60_000).toISOString();

export const DEPARTAMENTOS = ['marketing', 'ventas', 'contenido', 'sistemas'];

export const agentes = [
  { id: 'asistente', name: 'Asistente', role: 'asistente', department: null, connected: true, busy: false, model: 'anthropic/claude-sonnet-5-5' },
  { id: 'mkt-capitan', name: 'Valentina', role: 'captain', department: 'marketing', title: 'Directora de Marketing', connected: true, busy: true, ahora: { kind: 'buscar', text: 'Buscando referencias de anuncios' }, model: 'anthropic/claude-sonnet-5-5' },
  { id: 'mkt-estratega', name: 'Tomás', role: 'estratega', department: 'marketing', connected: true, busy: false, model: 'anthropic/claude-sonnet-5-5' },
  { id: 'mkt-analista', name: 'Lucía', role: 'analista', department: 'marketing', connected: true, busy: false, queued: true, model: 'anthropic/claude-sonnet-5-5' },
  { id: 'ven-capitan', name: 'Martín', role: 'captain', department: 'ventas', title: 'Jefe de Ventas', connected: true, busy: false, model: 'anthropic/claude-sonnet-5-5' },
  { id: 'ven-setter', name: 'Sofía', role: 'setter', department: 'ventas', connected: true, busy: true, ahora: { kind: 'herramienta', text: 'Respondiendo DMs de Instagram' }, model: 'anthropic/claude-sonnet-5-5' },
  { id: 'ven-closer', name: 'Joaquín', role: 'closer', department: 'ventas', connected: true, busy: false, model: 'anthropic/claude-sonnet-5-5' },
  { id: 'con-capitan', name: 'Camila', role: 'head-content', department: 'contenido', title: 'Head de Contenido', connected: true, busy: false, model: 'anthropic/claude-sonnet-5-5' },
  { id: 'con-guionista', name: 'Bruno', role: 'guionista', department: 'contenido', connected: true, busy: false, asleep: true, model: 'anthropic/claude-sonnet-5-5' },
  { id: 'con-editor', name: 'Mateo', role: 'editor', department: 'contenido', connected: true, busy: false, model: 'anthropic/claude-sonnet-5-5' },
  { id: 'sis-capitan', name: 'Nicolás', role: 'captain', department: 'sistemas', title: 'Ops y Sistemas', connected: true, busy: false, model: 'anthropic/claude-sonnet-5-5' },
  { id: 'sis-bugs', name: 'Agustina', role: 'bugs', department: 'sistemas', connected: true, busy: false, model: 'anthropic/claude-sonnet-5-5' },
]

export function estado() {
  return {
    version: 'mock-1',
    login: true,
    conJeremy: true,
    outOfQuota: false,
    memoria: { presion: 'normal' },
    settings: {
      owner: { name: 'Franco Ruiz', company: 'Escala Digital' },
      onboarding: { done: true },
      offTime: null,
      autopiloto: { modo: 'interno' },
      version: 'mock-1',
      motorNuevo: true,
      blocked: [],
    },
    agents: agentes,
    requests: [
      { id: 'r1', kind: 'accion', title: 'GMAIL_SEND_EMAIL', author: 'Martín', agentId: 'ven-capitan', at: hace(18), state: 'pendiente', payload: JSON.stringify({ recipient_email: 'lucas@clientefit.com', subject: 'Tu llamada del jueves', body: 'Hola Lucas, te confirmo la llamada del jueves a las 16 h.' }) },
      { id: 'r2', kind: 'ok', title: 'Plan de anuncios para diciembre', author: 'Valentina', agentId: 'mkt-capitan', at: hace(42), state: 'pendiente', note: 'Tres campañas con presupuesto de USD 1.200 en total.' },
      { id: 'r3', kind: 'entrega', title: 'Guiones de reels de la semana', author: 'Bruno', agentId: 'con-guionista', at: hace(95), state: 'pendiente', file: '/mock/work/guiones-semana.md' },
      { id: 'r4', kind: 'entrega', title: 'Reporte de ventas de noviembre', author: 'Lucía', agentId: 'mkt-analista', at: hace(150), state: 'aprobado', file: '/mock/work/reporte-ventas.pdf' },
      { id: 'r5', kind: 'entrega', title: 'Calendario de contenido', author: 'Camila', agentId: 'con-capitan', at: hace(220), state: 'aprobado', file: '/mock/work/calendario.html' },
      { id: 'r6', kind: 'accion', title: 'INSTAGRAM_POST_MESSAGE', author: 'Sofía', agentId: 'ven-setter', at: hace(7), state: 'pendiente', payload: JSON.stringify({ to: '@nati.fit', message: '¡Hola Nati! Vi que te interesó el programa, ¿te cuento cómo funciona?' }) },
    ],
    kpis: [
      { id: 'k1', name: 'Llamadas agendadas por semana', target: '25', proposedBy: 'Martín', agentId: 'ven-capitan', state: 'propuesta', at: hace(60), command: 'contar agendas de Calendly de los últimos 7 días' },
      { id: 'k2', name: 'Costo por lead', target: 'USD 4', proposedBy: 'Valentina', agentId: 'mkt-capitan', state: 'activo', at: hace(4000) },
    ],
    readings: [],
    ceo: [
      { id: 'c1', agentId: 'asistente', author: 'Asistente', at: hace(300), text: '**Resumen del día**\n\n- Se agendaron 6 llamadas.\n- Salieron 3 reels.\n- El costo por lead bajó a USD 4,20.' },
      { id: 'c2', agentId: 'mkt-capitan', author: 'Valentina', at: hace(55), text: 'Armé el plan de anuncios de diciembre. Está en la Bandeja esperando tu OK.' },
      { id: 'c3', agentId: 'ven-capitan', author: 'Martín', at: hace(20), text: 'Hoy cerramos 2 ventas del programa High Ticket. @Franco, Joaquín te deja las notas de las llamadas.' },
    ],
    comms: [
      { id: 'm1', from: 'asistente', to: 'mkt-capitan', at: hace(25), text: 'Buscá referencias de anuncios de la competencia para la campaña de diciembre.' },
      { id: 'm2', from: 'ven-capitan', to: 'ven-setter', at: hace(12), text: 'Respondé los DMs nuevos y calificá a los que preguntaron por el programa.' },
      { id: 'm3', from: 'dueno', to: 'asistente', at: hace(30), text: 'Quiero el reporte de la semana para mañana a la mañana.' },
      { id: 'm4', from: 'mkt-capitan', to: 'mkt-analista', at: hace(15), text: 'Pasame los números de los anuncios de la última semana.' },
    ],
    beats: {
      'mkt-capitan': { checks: ['Revisar el costo por lead el viernes', 'Ver si los creativos nuevos superan a los viejos'] },
      'ven-capitan': { checks: ['Llamar a los leads que no vinieron'] },
    },
    instagram: { connected: true, username: 'escaladigital', lastSync: hace(40), problem: null, keyMask: 'IGQ…a91' },
    clientes: [
      { id: 'cli-fit', nombre: 'Cliente Fit', pendientes: 2 },
      { id: 'cli-inmo', nombre: 'Inmobiliaria Sur', pendientes: 0 },
    ],
    pendientesPrincipal: 4,
    carpeta: null,
    licencia: { activa: true },
    licenciaEquipo: null,
    claudeLogin: { state: 'done' },
    juanChats: [],
    juanPasos: [],
    tickets: [
      { id: 'T-12', title: 'El calendario no sincroniza con Google', owner: 'sis-bugs', state: 'en curso', detail: 'Desde el martes los eventos nuevos no aparecen en Calendly.', notes: [{ author: 'Agustina', text: 'Reconecté la cuenta; lo vuelvo a probar mañana.' }], at: hace(600) },
      { id: 'T-13', title: 'Landing del webinar', owner: 'mkt-capitan', state: 'abierto', detail: '', notes: [], at: hace(300) },
      { id: 'T-9', title: 'Plantilla de reporte semanal', owner: 'mkt-analista', state: 'hecho', detail: '', notes: [], at: hace(5000) },
    ],
    roadmap: null,
    persona: null,
    pases: [],
    incluidas: [],
    jeremy: null,
    jeremyRevision: null,
    privateHost: false,
    update: null,
    updateCheck: null,
  }
}

export const mensajes = {
  asistente: [
    { id: 'a1', role: 'user', text: 'Quiero el reporte de la semana para mañana a la mañana.', at: hace(30) },
    { id: 'a2', role: 'assistant', at: hace(29), steps: [{ kind: 'leer', text: 'Leyendo los números de la semana' }, { kind: 'herramienta', text: 'Pidiendo datos a Lucía' }] },
    { id: 'a3', role: 'assistant', text: 'Listo, Franco. Le pedí a Lucía los números de anuncios y a Martín los de ventas. Mañana a las 9 h lo tenés en #ceo.', at: hace(28) },
  ],
}

export const rutinas = [
  { id: 'reporte-diario', departamento: 'marketing', rol: 'captain', dias: [1, 2, 3, 4, 5], hora: 19, prendida: true, ultima: hace(1440) },
  { id: 'contenido-diario', departamento: 'contenido', rol: 'head-content', dias: [0, 1, 2, 3, 4, 5, 6], hora: 10, prendida: true, ultima: hace(1500) },
  { id: 'lectura-jueves', departamento: 'marketing', rol: 'analista', dias: [4], hora: 9, prendida: true, ultima: hace(8000) },
  { id: 'reporte-viernes', departamento: 'ventas', rol: 'captain', dias: [5], hora: 17, prendida: true },
  { id: 'guiones-lunes', departamento: 'contenido', rol: 'guionista', dias: [1], hora: 8, prendida: false },
  { id: 'bugs-diario', departamento: 'sistemas', rol: 'bugs', dias: [1, 2, 3, 4, 5], hora: 11, prendida: true },
]

export const uso = {
  accounts: [{ provider: 'anthropic', email: 'franco@escaladigital.com', limits: [{ label: 'Sesión de 5 h', used: 38, resetsAt: new Date(Date.now() + 2 * 3600_000).toISOString() }, { label: 'Semana', used: 72, resetsAt: new Date(Date.now() + 3 * 86_400_000).toISOString() }] }],
  today: 4.12, week: 31.8, month: 118.4,
  rows: agentes.slice(0, 6).map((a, i) => ({ agent: a.name, today: +(1.4 - i * 0.2).toFixed(2), week: +(9 - i).toFixed(2), month: +(34 - i * 4).toFixed(2) })),
}
