// Ventas en el mock: lo que el dueño cambia de cada oportunidad (etapa, llamada, notas, mensajes, calificación) se
// guarda en st.ventas y se aplica encima de los datos de prueba de ventas.mjs. Así la Bandeja de DMs, Oportunidades,
// Contactos y el Reporte muestran lo mismo, y sobrevive a reiniciar el server. No se entrega.
import * as ventas from './ventas.mjs'

const ahoraIso = () => new Date().toISOString()
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

export const semillaVentas = () => ({
  llamadas: { c2: 'vino', c5: 'cerro', c7: 'no_vino', c8: 'agendo' },
  pasos: {},
  notas: [
    { id: 'n1', usuario: 'nati.fit', rol: 'setter', autor: 'Sofía', fecha: new Date(Date.now() - 300 * 60_000).toISOString(), texto: 'Muy interesada; le mandé el link de la agenda.' },
    { id: 'n2', usuario: 'lucasb.coach', rol: 'closer', autor: 'Joaquín', fecha: new Date(Date.now() - 60 * 60_000).toISOString(), texto: 'Vino a la llamada; quiere arrancar en enero.' },
  ],
  enviados: {},
  calif: {},
  historial: [],
})

// Qué etapa del embudo deja cada resultado de llamada.
const PASO_DE_LLAMADA = { agendo: { paso: 'agenda', no_vino: false }, vino: { paso: 'show', no_vino: false }, no_vino: { paso: 'agenda', no_vino: true }, cerro: { paso: 'cierre', no_vino: false } }
const NOMBRE_LLAMADA = { agendo: 'Agendó la llamada', vino: 'Asistió a la llamada', no_vino: 'No asistió a la llamada', cerro: 'Cerró la venta' }
const NOMBRE_PASO = { chat: 'Nuevo', conversacion: 'Conversando', pitch: 'Propuesta', agenda: 'Llamada', show: 'Llamada hecha', cierre: 'Cliente', perdido: 'Descartado' }

export function crearComercial({ st, equipo }) {
  st.ventas ??= semillaVentas()
  const v = st.ventas
  const anotar = (usuario, texto) => v.historial.push({ id: uid('h'), usuario, at: ahoraIso(), texto })
  const usuarioDe = (id) => ventas.bandeja().conversaciones.find((c) => c.id === id)?.usuario

  function bandeja() {
    const d = ventas.bandeja()
    for (const c of d.conversaciones) {
      if (v.calif[c.usuario]) c.calificacion = v.calif[c.usuario]
      const env = v.enviados[c.id]
      if (env?.length) Object.assign(c, { ultimo_mensaje: `Vos: ${env.at(-1).texto}`, actualizado: env.at(-1).fecha, sin_leer: false })
    }
    return d
  }
  function contactos() {
    const d = ventas.contactos()
    for (const c of d.contactos) {
      const o = v.pasos[c.usuario]
      if (o) Object.assign(c, { paso: o.paso ?? c.paso, no_vino: o.no_vino ?? c.no_vino, fechas: { ...c.fechas, ...(o.fechas ?? {}) } })
      const n = v.notas.filter((x) => x.usuario === c.usuario).at(-1)
      if (n) c.ultima_nota = { autor: n.autor, texto: n.texto }
      if (v.calif[c.usuario]) c.calificacion = v.calif[c.usuario]
      const env = v.enviados[c.conversacion]
      if (env?.length) c.ultimo = { fecha: env.at(-1).fecha, de: 'nosotros' }
      c.historial = v.historial.filter((h) => h.usuario === c.usuario)
    }
    return d
  }
  function chat(id) {
    const d = ventas.chat(id)
    d.mensajes.push(...(v.enviados[id] ?? []))
    return d
  }

  function get(p, url) {
    if (p === '/ig/bandeja') return bandeja()
    if (p === '/ig/contactos') return contactos()
    if (p === '/ig/llamadas') return v.llamadas
    if (p.startsWith('/ig/chat/')) return chat(decodeURIComponent(p.slice(9)))
    if (p === '/ig/buscar') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      return { conversaciones: bandeja().conversaciones.filter((c) => `${c.nombre} ${c.usuario}`.toLowerCase().includes(q)) }
    }
    if (p === '/ig/calificados') return { conversaciones: bandeja().conversaciones.filter((c) => c.calificacion.veredicto === 'calificado') }
    if (p === '/ig/calificacion') {
      const u = url.searchParams.get('usuario')
      return bandeja().conversaciones.find((c) => c.usuario === u)?.calificacion ?? { veredicto: 'pendiente' }
    }
    if (p === '/ig/notas') {
      const u = url.searchParams.get('usuario')
      return { notas: v.notas.filter((n) => !u || n.usuario === u) }
    }
    return undefined
  }

  function post(p, c, metodo) {
    let m
    // El resultado de la llamada: también mueve la etapa (agendó → llamada, cerró → cliente).
    if ((m = /^\/ig\/llamada\/([^/]+)$/.exec(p))) {
      const id = decodeURIComponent(m[1])
      const estado = c.estado || null
      if (estado) v.llamadas[id] = estado
      else delete v.llamadas[id]
      const usuario = usuarioDe(id)
      if (usuario && estado) {
        const o = PASO_DE_LLAMADA[estado]
        v.pasos[usuario] = { ...(v.pasos[usuario] ?? {}), ...o, fechas: { ...(v.pasos[usuario]?.fechas ?? {}), [o.paso]: ahoraIso() } }
      }
      if (usuario) anotar(usuario, estado ? NOMBRE_LLAMADA[estado] : 'Se sacó la llamada')
      return { ok: true, estado }
    }
    // Mover la oportunidad de etapa a mano (o descartarla).
    if (p === '/ig/etapa') {
      if (!c.usuario || !NOMBRE_PASO[c.paso]) return { error: 'Falta la etapa' }
      v.pasos[c.usuario] = { ...(v.pasos[c.usuario] ?? {}), paso: c.paso, no_vino: false, fechas: { ...(v.pasos[c.usuario]?.fechas ?? {}), [c.paso]: ahoraIso() } }
      if (c.conversacion && ['chat', 'conversacion', 'pitch', 'perdido'].includes(c.paso)) delete v.llamadas[c.conversacion]
      anotar(c.usuario, c.paso === 'perdido' ? 'Se descartó la oportunidad' : `Pasó a «${NOMBRE_PASO[c.paso]}»`)
      return { ok: true }
    }
    if (p === '/ig/notas' && metodo !== 'DELETE') {
      const texto = String(c.texto ?? '').trim()
      if (!c.usuario || !texto) return { error: 'La nota está vacía' }
      const nota = { id: uid('n'), usuario: c.usuario, rol: c.rol === 'closer' ? 'closer' : 'setter', autor: st.settings?.owner?.name?.split(' ')[0] ?? 'Vos', fecha: ahoraIso(), texto }
      v.notas.push(nota)
      anotar(c.usuario, 'Se agregó una nota')
      return { ok: true, nota }
    }
    if ((m = /^\/ig\/notas\/([^/]+)$/.exec(p))) {
      v.notas = v.notas.filter((n) => n.id !== m[1])
      return { ok: true }
    }
    // Mandar un DM: queda en el chat como mensaje de la cuenta (en la app real sale por Instagram).
    if (p === '/ig/enviar') {
      const texto = String(c.texto ?? '').trim()
      if (!c.id || !texto) return { error: 'El mensaje está vacío' }
      ;(v.enviados[c.id] ??= []).push({ quien: 'nosotros', texto, fecha: ahoraIso(), nombre: 'Vos', clave: c.clave })
      const usuario = usuarioDe(c.id)
      if (usuario) anotar(usuario, 'Le escribiste por DM')
      return { ok: true }
    }
    // Calificar: el Setter lo mira y deja el puntaje a los pocos segundos.
    if (p === '/ig/calificar') {
      const u = String(c.usuario ?? '').toLowerCase()
      const base = ventas.bandeja().conversaciones.find((x) => x.usuario === u)
      if (!base) return { error: 'No encontré a esa persona' }
      setTimeout(() => {
        const puntaje = base.calificacion.puntaje ?? 6.1
        v.calif[u] = { veredicto: puntaje >= 6 ? 'calificado' : 'no', puntaje, razon: base.calificacion.razon || 'Tiene un negocio funcionando y preguntó por el programa.', dimensiones: { negocio: 7, financiero: 6, avatar: 8 } }
        anotar(u, 'El Setter lo calificó')
        equipo.guardar?.()
      }, 3000)
      return { ok: true }
    }
    // Revisar el seteo: se le pide al Setter, que contesta en su chat.
    if (p === '/ig/revisar') {
      const setter = st.agents.find((a) => a.role === 'setter') ?? st.agents.find((a) => a.department === 'ventas')
      if (!setter) return { error: 'No hay setter en el equipo' }
      equipo.pedir(setter.id, `Revisá cómo se seteó la charla con ${c.nombre ?? 'esta persona'} y decime qué cambiarías.`)
      const usuario = usuarioDe(c.id)
      if (usuario) anotar(usuario, `Se le pidió a ${setter.name} revisar el seteo`)
      return { ok: true, agente: setter.id }
    }
    return postContenido(p, c)
  }

  // ---------- Contenido: etiquetas corregidas, estado de cada paso de una secuencia y lo que se le pide al equipo ----------
  st.contenido ??= { etiquetas: {}, pasos: {}, leido: false }
  const ct = st.contenido
  function vista() {
    const d = ventas.vista()
    for (const x of [...d.secuencias, ...d.ideas]) {
      const e = ct.etiquetas[x.id] ?? x.versiones?.map((y) => ct.etiquetas[y.id]).find(Boolean)
      if (e) x.etiqueta = { ...x.etiqueta, ...e }
    }
    for (const s of d.secuencias) {
      s.historias.forEach((h, i) => {
        h.estado = s.plan?.[i]?.estado ?? 'publicada'
        if (s.plan?.[i]?.fecha) h.fecha = s.plan[i].fecha
        if (s.pasos?.[i]) h.texto = s.pasos[i]
        Object.assign(h, ct.pasos[`${s.id}:${i}`] ?? {})
      })
    }
    if (ct.leido) d.sinLeer = 0
    return d
  }
  const persona = (rol, dep) => st.agents.find((a) => a.role === rol) ?? st.agents.find((a) => a.department === dep)
  function postContenido(p, c) {
    if (p === '/ig/etiqueta') {
      for (const pieza of c.piezas ?? []) if (pieza.id) ct.etiquetas[pieza.id] = { ...(ct.etiquetas[pieza.id] ?? {}), ...Object.fromEntries(Object.entries(pieza).filter(([k, val]) => k !== 'id' && val !== undefined)) }
      return { ok: true }
    }
    if (p === '/contenido/leer') {
      const a = persona('analista', 'marketing')
      if (a) equipo.pedir(a.id, 'Leé las piezas de contenido que faltan y etiquetalas: etapa, dolor, ángulo y pedido.')
      setTimeout(() => {
        ct.leido = true
        equipo.guardar?.()
      }, 6000)
      return { ok: true, nombre: a?.name ?? 'El Analista' }
    }
    if (p === '/contenido/versiones') {
      const g = persona('guionista', 'contenido')
      if (!g) return { error: 'No hay guionista en el equipo' }
      equipo.pedir(g.id, `Escribí 3 versiones nuevas de «${c.titulo ?? 'esta pieza'}» (${c.que ?? ''}).`)
      return { ok: true, nombre: g.name }
    }
    // Un paso de una secuencia: pedírselo al Guionista, programarlo, publicarlo o volverlo a pendiente.
    if (p === '/ig/contenido/paso') {
      const s = ventas.vista().secuencias.find((x) => x.id === c.secuencia)
      if (!s || !s.historias[c.paso]) return { error: 'No existe ese paso' }
      const k = `${s.id}:${c.paso}`
      if (c.accion === 'pedir') {
        const g = persona('guionista', 'contenido')
        if (g) equipo.pedir(g.id, `Armá la historia ${Number(c.paso) + 1} de «${s.etiqueta.titulo}»: ${s.pasos?.[c.paso] ?? ''}.`)
        ct.pasos[k] = { estado: 'en_preparacion' }
      } else if (c.accion === 'programar') ct.pasos[k] = { estado: 'programada', fecha: new Date(Date.now() + 24 * 3600_000).toISOString() }
      else if (c.accion === 'publicar') ct.pasos[k] = { estado: 'publicada', fecha: ahoraIso(), vistas: Math.round((s.historias[0].vistas || 1500) * (0.9 - Number(c.paso) * 0.08)) }
      else if (c.accion === 'pendiente') ct.pasos[k] = { estado: 'pendiente', vistas: 0 }
      else return { error: 'Acción desconocida' }
      return { ok: true }
    }
    return undefined
  }

  const getBase = get
  function getTodo(p, url) {
    if (p === '/ig/vista') return vista()
    return getBase(p, url)
  }

  return { get: getTodo, post }
}
