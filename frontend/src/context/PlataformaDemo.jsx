import { createContext, useContext, useMemo, useReducer, useState } from 'react'

// Vista previa de la ATV Platform: mensajes, roadmaps y coaches con datos de ejemplo en memoria.
// Todavía no hay backend: lo que se hace acá se pierde al recargar la página.

export const COACHES = {
  juampi: { id: 'juampi', nombre: 'Juampi', ini: 'JP', rol: 'Revisión de roadmap mensual', area: 'Ventas', color: '#1d9e75', tinta: '#06140f', responde: '~2 h' },
  juan: { id: 'juan', nombre: 'Juan Cruz', ini: 'JC', rol: 'Chat 1-1 · Marketing', area: 'Marketing', color: '#6b95d8', tinta: '#0b0b0c', responde: '~4 h' },
  nick: { id: 'nick', nombre: 'Nick', ini: 'NI', rol: 'Setting y closing', area: 'Closing', color: '#d6a548', tinta: '#0b0b0c', responde: '~3 h' },
  franco: { id: 'franco', nombre: 'Franco', ini: 'FR', rol: 'Sistemas, procesos y equipos', area: 'Sistemas', color: '#8f8c85', tinta: '#0b0b0c', responde: '~6 h' },
}

export const NIVELES = {
  entry: { id: 'entry', nombre: 'Entry', meses: 4, incluye: 'Cimientos: contenido, ventas básicas y oferta' },
  mid: { id: 'mid', nombre: 'Mid', meses: 4, incluye: 'Marketing y Ventas' },
  high: { id: 'high', nombre: 'High', meses: 6, incluye: 'La máquina completa' },
}

const CLIENTES = [
  { id: 'federico', nombre: 'Federico Garbarino', canal: 'federico-garbarino', nivel: 'mid', mes: 2, vence: '21/02/2027', salud: 'activo', sops: [6, 14], cierre: true, mensajesMes: 23, consultasGuia: 9, implementadas: 7, upsell: { titulo: 'Instalación de laboratorio', motivo: 'Pidió métricas semanales dos veces. No está en Mid.' } },
  { id: 'ana', nombre: 'Ana Montaña', canal: 'ana-montana', nivel: 'entry', mes: 1, vence: '25/04/2027', salud: 'activo', sops: [2, 9], cierre: true, mensajesMes: 11, consultasGuia: 14, implementadas: 3 },
  { id: 'inaki', nombre: 'Iñaki · Nexus', canal: 'inaki-nexus', nivel: 'high', mes: 3, vence: '21/03/2027', salud: 'activo', sops: [18, 31], cierre: true, mensajesMes: 41, consultasGuia: 6, implementadas: 15 },
  { id: 'leonel', nombre: 'Leonel Cata', canal: 'leonel-cata', nivel: 'mid', mes: 2, vence: '20/03/2027', salud: 'riesgo', sops: [1, 14], cierre: false, mensajesMes: 2, consultasGuia: 0, implementadas: 1 },
  { id: 'julian', nombre: 'Julián Lucero', canal: 'julian-lucero', nivel: 'mid', mes: 3, vence: '03/03/2027', salud: 'activo', sops: [9, 14], cierre: true, mensajesMes: 17, consultasGuia: 5, implementadas: 10 },
  { id: 'alvaro', nombre: 'Álvaro Larraz', canal: 'alvaro-larraz', nivel: 'entry', mes: 2, vence: '01/03/2027', salud: 'activo', sops: [4, 9], cierre: true, mensajesMes: 8, consultasGuia: 11, implementadas: 5 },
  { id: 'miguel', nombre: 'Miguel Diego', canal: 'miguel-diego', nivel: 'high', mes: 4, vence: '10/02/2027', salud: 'activo', sops: [22, 31], cierre: true, mensajesMes: 29, consultasGuia: 3, implementadas: 19 },
]

// El cliente de la demo es Federico; el coach de la demo es Juampi.
export const CLIENTE_DEMO = 'federico'
export const COACH_DEMO = 'juampi'

const ROADMAPS = [
  { id: 'r1', cliente: 'federico', coach: 'juan', titulo: 'Roadmap inicial', tipo: 'inicial', fecha: '15/08', estado: 'base', detalle: 'Diagnóstico' },
  { id: 'r2', cliente: 'federico', coach: 'juampi', titulo: 'Ventas · v1', tipo: 'revision', fecha: '01/09', estado: 'reemplazado' },
  { id: 'r3', cliente: 'federico', coach: 'juampi', titulo: 'Ventas · v2', tipo: 'revision', fecha: '15/09', estado: 'reemplazado' },
  { id: 'r4', cliente: 'federico', coach: 'juampi', titulo: 'Ventas · v3', tipo: 'revision', fecha: 'Hoy', estado: 'vigente', paso: [3, 7] },
  { id: 'r5', cliente: 'federico', coach: 'nick', titulo: 'Guion de setting · ajustes', tipo: 'complementario', fecha: '22/09', estado: 'complementario' },
  { id: 'r6', cliente: 'ana', coach: 'juan', titulo: 'Roadmap inicial', tipo: 'inicial', fecha: '20/09', estado: 'vigente', paso: [1, 5] },
  { id: 'r7', cliente: 'inaki', coach: 'franco', titulo: 'Sistemas · v2', tipo: 'revision', fecha: '28/09', estado: 'vigente', paso: [4, 9] },
  { id: 'r8', cliente: 'julian', coach: 'juampi', titulo: 'Marketing · v1', tipo: 'revision', fecha: '10/09', estado: 'vigente', paso: [5, 6] },
  { id: 'r9', cliente: 'miguel', coach: 'juampi', titulo: 'Ventas · v2', tipo: 'revision', fecha: '18/09', estado: 'vigente', paso: [6, 8] },
]

let seq = 100
const nuevoId = () => `m${++seq}`

const ahora = () => new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })

// Cada cliente tiene un canal privado, como en Discord: escriben él y todo el equipo de ATV.
// `autor` es el id del coach o "cliente"; `de` dice de qué lado está ("coach" o "cliente").
const C = (id, autor, hora, extra) => ({ id, autor, de: autor === 'cliente' ? 'cliente' : 'coach', hora, tipo: 'texto', ...extra })
const CONVERSACIONES = {
  federico: [
    C('m1', 'juampi', '10:30', { texto: 'Buenas Fede, ¿cómo venís con el roadmap de ventas?' }),
    C('m2', 'cliente', '10:34', { texto: 'Bien, ya completé el SOP de follow-ups. Te lo paso así lo vemos' }),
    C('m3', 'cliente', '10:34', { tipo: 'sop', titulo: 'SOP · ¿Cuántos follow-ups hago?' }),
    C('m4', 'juan', '10:36', { texto: 'Buenísimo Fede. Cuando lo cierres con Juampi lo sumamos al calendario de octubre' }),
    C('m5', 'juampi', '10:40', { responde: 'm2', texto: 'Lo miré. El segundo follow-up está muy largo, dejalo en 2 líneas. El resto está perfecto' }),
    C('m6', 'juampi', '10:41', { tipo: 'roadmap', roadmap: 'r4', reemplaza: 'Ventas · v2' }),
    C('m7', 'juampi', '10:42', { texto: '@Federico te dejé marcado el paso 3. Con eso lo vemos el jueves en el 1-1' }),
    C('m8', 'nick', '11:05', { texto: 'Ajusté el guion de setting con lo que vimos en la clase, te lo dejo acá' }),
    C('m9', 'nick', '11:05', { tipo: 'roadmap', roadmap: 'r5' }),
    C('m10', 'cliente', '11:10', { responde: 'm8', texto: 'Dale, gracias a los dos. Lo implemento esta semana' }),
  ],
  ana: [C('m11', 'cliente', 'hace 1 h', { texto: 'Te mando el calendario para que lo revises' })],
  inaki: [C('m12', 'cliente', 'hace 2 h', { texto: 'Subí el dashboard de métricas, ¿lo ves?' })],
  leonel: [C('m13', 'juampi', 'hace 9 días', { texto: 'Leo, ¿cómo venís? Hace unos días que no te veo por acá' })],
  julian: [C('m14', 'juampi', 'ayer', { texto: 'Perfecto, avanzá con el paso 5' })],
  alvaro: [C('m15', 'juampi', 'lun', { texto: 'Dale, lo vemos en el grupal' })],
  miguel: [C('m16', 'juampi', 'hace 3 días', { texto: 'Lo dejamos listo para el lanzamiento' })],
}

// Quién espera respuesta del coach y desde cuándo (para la bandeja).
const ESPERANDO = { federico: '25 min', ana: '1 h', inaki: '2 h' }

export const CANALES = [
  {
    id: 'lo-nuevo', nombre: 'lo-nuevo', nuevo: true, posts: [
      { id: 'p1', autor: 'juampi', fecha: '01/10', titulo: 'Llega en octubre: agente de setting con IA', texto: 'Configurado con tus llamadas de Fathom. Lo van a tener en su plataforma a mediados de mes.' },
      { id: 'p2', autor: 'juan', fecha: '24/09', titulo: 'Nuevo SOP: calendario de contenido de adquisición', texto: 'Ya está en el classroom, dentro de Advantage. Pídanselo a la guía con "no sé qué contenido subir".' },
    ],
  },
  { id: 'anuncios', nombre: 'anuncios', posts: [{ id: 'p3', autor: 'juan', fecha: '29/09', titulo: 'Nos mudamos a la ATV Platform', texto: 'Dejamos Skool atrás. Todo el programa vive acá: clases, SOPs, mensajes y roadmaps.' }] },
  { id: 'clases-semanales', nombre: 'clases-semanales', posts: [{ id: 'p4', autor: 'nick', fecha: 'Jueves 18:00', titulo: 'Clase semanal de setting y closing', texto: 'Esta semana: cómo manejar el "lo voy a pensar" sin perder autoridad.' }] },
]

const inicial = { clientes: CLIENTES, roadmaps: ROADMAPS, conversaciones: CONVERSACIONES, esperando: ESPERANDO }

function reducer(state, accion) {
  switch (accion.accion) {
    case 'enviar': {
      const { cliente, coach, mensaje } = accion
      const esperando = { ...state.esperando }
      if (mensaje.de === 'coach') delete esperando[cliente]
      else esperando[cliente] = 'ahora'
      const nuevo = { id: nuevoId(), hora: ahora(), autor: mensaje.de === 'coach' ? coach : 'cliente', ...mensaje }
      return { ...state, esperando, conversaciones: { ...state.conversaciones, [cliente]: [...(state.conversaciones[cliente] ?? []), nuevo] } }
    }
    case 'asignar': {
      const { cliente, coach, titulo, tipo, link, vigente, avisar } = accion
      const id = `r${Date.now()}`
      const anterior = vigente ? state.roadmaps.find((r) => r.cliente === cliente && r.estado === 'vigente') : null
      const roadmaps = state.roadmaps.map((r) => (anterior && r.id === anterior.id ? { ...r, estado: 'reemplazado' } : r))
      roadmaps.push({ id, cliente, coach, titulo, tipo, link, fecha: 'Hoy', estado: vigente ? 'vigente' : tipo === 'complementario' ? 'complementario' : 'base', paso: vigente ? [1, 7] : undefined })
      let conversaciones = state.conversaciones
      if (avisar) {
        conversaciones = { ...conversaciones, [cliente]: [...(conversaciones[cliente] ?? []), { id: nuevoId(), autor: coach, de: 'coach', tipo: 'roadmap', roadmap: id, reemplaza: anterior?.titulo, hora: ahora() }] }
      }
      return { ...state, roadmaps, conversaciones }
    }
    default:
      return state
  }
}

const Ctx = createContext(null)

export function PlataformaDemoProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, inicial)
  // Estilo visual de la vista previa: "atv" (el del classroom) o "mac" (ventana de macOS). Se recuerda por navegador.
  const [estilo, setEstiloState] = useState(() => {
    try {
      return localStorage.getItem('atv_estilo') === 'mac' ? 'mac' : 'atv'
    } catch {
      return 'atv'
    }
  })
  const valor = useMemo(
    () => ({
      ...state,
      estilo,
      setEstilo: (e) => {
        setEstiloState(e)
        try {
          localStorage.setItem('atv_estilo', e)
        } catch {
          // sin almacenamiento, el estilo vale mientras la página esté abierta
        }
      },
      cliente: (id) => state.clientes.find((c) => c.id === id),
      roadmapsDe: (cliente) => state.roadmaps.filter((r) => r.cliente === cliente),
      vigenteDe: (cliente) => state.roadmaps.find((r) => r.cliente === cliente && r.estado === 'vigente'),
      roadmap: (id) => state.roadmaps.find((r) => r.id === id),
      // El canal privado del cliente (el coach ya no separa conversaciones: es un canal compartido).
      conversacion: (cliente) => state.conversaciones[cliente] ?? [],
      mensaje: (cliente, id) => (state.conversaciones[cliente] ?? []).find((m) => m.id === id),
      enviar: (cliente, coach, mensaje) => dispatch({ accion: 'enviar', cliente, coach, mensaje }),
      asignar: (datos) => dispatch({ ...datos, accion: 'asignar' }),
    }),
    [state, estilo],
  )
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function usePlataforma() {
  return useContext(Ctx)
}
