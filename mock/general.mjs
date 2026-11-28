// El resto de la app en el mock: Tickets, Configuración (dueño, horario libre, no contactar, agentes, cupo de gasto,
// claves, software), Lo aprendido (reglas y skills), Biblioteca, Automatizaciones y Juan IA (frenar, borrar). Todo se
// guarda en st y se ve al instante. Lo que en la app real sale afuera (Instagram, Composio, el teléfono) acá se simula
// y se dice que es de prueba. No se entrega.
import * as bib from './biblioteca.mjs'
import * as ventas from './ventas.mjs'

const ahoraIso = () => new Date().toISOString()
const hace = (min) => new Date(Date.now() - min * 60_000).toISOString()
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

export function crearGeneral({ st, equipo }) {
  st.biblioteca ??= bib.biblioteca()
  st.flujos ??= ventas.flujos()
  st.gasto ??= {
    cupo: 150, gastado: 63.4,
    porServicio: [{ nombre: 'Meta Ads (lectura)', usd: 0 }, { nombre: 'Apify', usd: 21.3 }, { nombre: 'ElevenLabs', usd: 18.1 }, { nombre: 'Composio', usd: 24 }],
    porAgente: [{ nombre: 'Valentina', usd: 22.5 }, { nombre: 'Sofía', usd: 19.9 }, { nombre: 'Camila', usd: 21 }],
    ultimos: [{ at: hace(40), agente: 'Sofía', servicio: 'Apify', detalle: 'Leer 30 perfiles de Instagram', usd: 1.2 }, { at: hace(180), agente: 'Camila', servicio: 'ElevenLabs', detalle: 'Voz del reel', usd: 0.8 }],
  }
  // Cada automatización con sus cajas (como las arma el editor): disparo → mensaje con botón → espera → etiqueta → fin.
  for (const f of st.flujos.automatizaciones ?? []) {
    if (f.nodos) continue
    const palabra = f.disparo?.palabras?.[0] ?? 'HOLA'
    f.nodos = [
      { id: `${f.id}-t`, type: 'trigger', config: { keywords: [palabra] } },
      { id: `${f.id}-m1`, type: 'send_message', config: { text: `¡Hola! Gracias por escribir ${palabra} 🙌 Te paso la info.`, buttons: [{ type: 'postback', title: 'Quiero saber más' }] } },
      { id: `${f.id}-w`, type: 'wait_for_reply', config: { timeoutMinutes: 1440 } },
      { id: `${f.id}-m2`, type: 'send_message', config: { text: 'Buenísimo. ¿Te queda bien una llamada de 20 minutos esta semana?', buttons: [{ type: 'web_url', title: 'Agendar', url: 'https://calendly.com/' }] } },
      { id: `${f.id}-tag`, type: 'add_tag', config: { tag: palabra.toLowerCase() } },
      { id: `${f.id}-fin`, type: 'end', config: {} },
    ]
    f.aristas = f.nodos.slice(1).map((n, i) => ({ id: `${f.id}-e${i}`, source: f.nodos[i].id, target: n.id }))
    f.actualizado = f.editado
  }
  st.aprendido ??= [
    { id: 'R-1', origen: 'dueno', agente: '', tema: 'Ventas', at: hace(2000), texto: 'Nunca mandar el precio por DM: siempre en la llamada.' },
    { id: 'R-2', origen: 'agente', agente: 'Camila', tema: 'Contenido', at: hace(900), texto: 'Las secuencias con un caso real van con el nombre del alumno.' },
  ]
  st.skills ??= [{ nombre: 'reporte-semanal', origen: 'base' }, { nombre: 'propia-guion-reel-error-comun', origen: 'propia' }]
  st.software ??= [{ id: 'sw1', nombre: 'Calendly', permiso: 'leer' }, { id: 'sw2', nombre: 'Google Sheets', permiso: 'editar' }]
  st.claves ??= []
  st.settings.offTime ??= { on: true, from: 23, to: 8 }
  st.settings.blocked ??= []

  const agente = (id) => st.agents.find((a) => a.id === id)

  function get(p) {
    if (p === '/library') return st.biblioteca
    if (p === '/gasto') return st.gasto
    if (p === '/decisiones') return st.aprendido
    if (p === '/skills') return st.skills
    if (p === '/software') return st.software
    // Píxel de Meta e Importar: datos de prueba con la forma que leen esas secciones de Configuración.
    if (p === '/conversiones') return { pixeles: [{ id: '1234567890', nombre: 'Píxel Escala Digital', cuenta: 'Escala Digital Ads', dias_sin_disparar: 0, muerto: false }], estado: { token_cargado: true, probado: hace(300), termina: null, avisos: [] }, linea: null }
    if (p === '/import') return { skills: [{ name: 'guion-reel', from: 'Claude Code', imported: Boolean(st.importado) }, { name: 'reporte-semanal', from: 'Claude Code', imported: true }], instructions: [{ from: 'CLAUDE.md de tu carpeta' }] }
    if (p === '/ig/flujos') return st.flujos
    let m
    if ((m = /^\/ig\/flujos\/([^/]+)$/.exec(p))) return st.flujos.automatizaciones?.find((f) => f.id === m[1]) ?? { error: 'No existe' }
    // Los números de cada caja y quiénes entraron: salen de las corridas de la automatización (inventadas).
    if ((m = /^\/ig\/flujos\/([^/]+)\/estadisticas$/.exec(p))) {
      const f = st.flujos.automatizaciones?.find((x) => x.id === m[1])
      if (!f) return { error: 'No existe' }
      const base = f.corridas?.empezaron ?? 0
      return { entraron: base, porCaja: Object.fromEntries((f.nodos ?? []).map((n, i) => [n.id, { pasaron: Math.round(base * Math.pow(0.78, i)), ...(n.type === 'send_message' ? { clics: Math.round(base * Math.pow(0.78, i) * 0.4) } : {}) }])), parcial: false }
    }
    if ((m = /^\/ig\/flujos\/([^/]+)\/corridas$/.exec(p))) {
      const f = st.flujos.automatizaciones?.find((x) => x.id === m[1])
      const gente = ventas.bandeja().conversaciones.slice(0, Math.min(6, f?.corridas?.empezaron ?? 0))
      return { total: f?.corridas?.empezaron ?? 0, contactos: gente.length, corridas: gente.map((c, i) => ({ id: `${m[1]}-r${i}`, nombre: c.nombre, usuario: c.usuario, conversacion: c.id, empezo: hace(60 * (i + 1)), estado: i % 3 === 2 ? 'waiting' : 'completed', esperando: 'reply', paso: i % 3 === 2 ? 'Mensaje 1' : 'Fin' })) }
    }
    return undefined
  }

  function post(p, c, metodo) {
    let m
    // ---------- Tickets: el responsable lo toma y deja una nota ----------
    if (p === '/tickets') {
      const title = String(c.title ?? '').trim()
      if (!title) return { error: 'Falta el título del ticket' }
      const n = Math.max(0, ...st.tickets.map((t) => Number(String(t.id).replace(/\D/g, '')) || 0)) + 1
      const t = { id: `T-${n}`, title, owner: c.owner || 'asistente', state: 'abierto', detail: String(c.detail ?? ''), notes: [], at: ahoraIso() }
      st.tickets.push(t)
      const a = agente(t.owner)
      if (a) {
        equipo.pedir(a.id, `Te asigné el ticket ${t.id}: ${title}.`)
        setTimeout(() => {
          if (t.state === 'abierto') t.state = 'en curso'
          t.notes.push({ author: a.name, text: 'Lo tomo. Te aviso cuando esté.' })
          equipo.guardar?.()
        }, 5000)
      }
      return { ok: true, ticket: t }
    }
    if ((m = /^\/tickets\/([^/]+)$/.exec(p))) {
      const t = st.tickets.find((x) => x.id === decodeURIComponent(m[1]))
      if (!t) return { error: 'No existe ese ticket' }
      if (c.state) t.state = c.state
      if (c.note) t.notes.push({ author: st.settings.owner?.name ?? 'Vos', text: c.note })
      return { ok: true }
    }
    // ---------- Configuración ----------
    if (p === '/settings/owner') {
      st.settings.owner = { ...st.settings.owner, name: String(c.name ?? '').trim() || st.settings.owner.name, company: String(c.company ?? '').trim() || st.settings.owner.company }
      return { ok: true }
    }
    if (p === '/settings/off-time') {
      st.settings.offTime = { on: Boolean(c.on), from: Number(c.from ?? 23), to: Number(c.to ?? 8) }
      return { ok: true }
    }
    if (p === '/settings/blocked') {
      if (!String(c.name ?? '').trim()) return { error: 'Falta el nombre' }
      st.settings.blocked.push({ id: uid('b'), name: c.name.trim(), ids: String(c.ids ?? '').trim() })
      return { ok: true }
    }
    if ((m = /^\/settings\/blocked\/([^/]+)$/.exec(p))) {
      st.settings.blocked = st.settings.blocked.filter((b) => b.id !== m[1])
      return { ok: true }
    }
    if (p === '/settings/agentes') {
      st.settings.agentesSimultaneos = c.cantidad ?? null
      return { ok: true }
    }
    if (p === '/objetivo/cuenta') {
      st.settings.objetivo = { ...(st.settings.objetivo ?? {}), ...c }
      return { ok: true }
    }
    if (p === '/gasto/cupo') {
      const usd = Number(c.usd)
      if (!(usd >= 0)) return { error: 'El cupo tiene que ser un número' }
      st.gasto.cupo = usd
      return { ok: true }
    }
    if (p === '/connections/keys') {
      if (!c.name || !c.value) return { error: 'Faltan el nombre y la clave' }
      st.claves.push({ id: uid('k'), name: c.name, host: c.host ?? '', mask: `${String(c.value).slice(0, 3)}…${String(c.value).slice(-2)}` })
      return { ok: true }
    }
    if ((m = /^\/connections\/keys\/([^/]+)$/.exec(p))) {
      st.claves = st.claves.filter((k) => k.id !== m[1])
      return { ok: true }
    }
    if (p === '/software') {
      if (!String(c.nombre ?? '').trim()) return { error: 'Falta el nombre' }
      st.software.push({ id: uid('sw'), nombre: c.nombre.trim(), permiso: c.permiso ?? 'leer' })
      return { ok: true }
    }
    if ((m = /^\/software\/([^/]+)$/.exec(p))) {
      if (metodo === 'DELETE') st.software = st.software.filter((s) => s.id !== m[1])
      else {
        const s = st.software.find((x) => x.id === m[1])
        if (s && c.permiso) s.permiso = c.permiso
      }
      return { ok: true }
    }
    // ---------- Lo aprendido ----------
    if ((m = /^\/decisiones\/([^/]+)$/.exec(p))) {
      st.aprendido = st.aprendido.filter((d) => d.id !== decodeURIComponent(m[1]))
      return { ok: true }
    }
    if ((m = /^\/skills\/([^/]+)\/base$/.exec(p))) {
      const s = st.skills.find((x) => x.nombre === decodeURIComponent(m[1]))
      if (s) s.origen = 'base'
      return { ok: true }
    }
    if ((m = /^\/skills\/([^/]+)$/.exec(p))) {
      st.skills = st.skills.filter((x) => x.nombre !== decodeURIComponent(m[1]))
      return { ok: true }
    }
    // ---------- Biblioteca ----------
    if (p === '/library/items') {
      const title = String(c.title ?? '').trim()
      if (!title) return { error: 'Falta el nombre del material' }
      st.biblioteca.material.push({ id: uid('m'), kind: c.kind || 'otro', title, url: c.url ?? '', note: c.note ?? '' })
      return { ok: true }
    }
    if ((m = /^\/library\/items\/([^/]+)$/.exec(p))) {
      st.biblioteca.material = st.biblioteca.material.filter((x) => x.id !== m[1])
      return { ok: true }
    }
    if (p === '/library/guias') {
      const g = st.biblioteca.guides.find((x) => x.topic === c.topic)
      const rules = String(c.texto ?? '').split('\n').map((s) => s.replace(/^[-•]\s*/, '').trim()).filter(Boolean)
      if (g) Object.assign(g, { rules, source: 'Corregido por vos' })
      else st.biblioteca.guides.push({ topic: c.topic, rules, source: 'Corregido por vos' })
      return { ok: true }
    }
    if (p === '/library/guias/confirmar') {
      const g = st.biblioteca.guides.find((x) => x.topic === c.topic)
      if (g) g.confirmada = true
      return { ok: true }
    }
    // ---------- Automatizaciones de Instagram ----------
    const flujos = st.flujos.automatizaciones ?? []
    if (p === '/ig/flujos') {
      if (!String(c.nombre ?? '').trim()) return { error: 'Falta el nombre' }
      const f = { id: uid('a'), nombre: c.nombre.trim(), estado: 'draft', editado: ahoraIso(), disparo: c.disparo ?? { tipo: 'dm', palabras: [] }, corridas: { empezaron: 0, terminaron: 0 }, estadisticas: { respondieron: 0, clics: 0, ultimos7: 0, parcial: false }, nodos: [], aristas: [], actualizado: ahoraIso() }
      flujos.unshift(f)
      return { ok: true, id: f.id, flujo: f }
    }
    if ((m = /^\/ig\/flujos\/([^/]+)\/prender$/.exec(p))) {
      const f = flujos.find((x) => x.id === m[1])
      if (!f) return { error: 'No existe' }
      f.estado = c.prender ? 'active' : 'paused'
      return f
    }
    if ((m = /^\/ig\/flujos\/([^/]+)\/disparo$/.exec(p))) {
      const f = flujos.find((x) => x.id === m[1])
      if (!f) return { error: 'No existe' }
      Object.assign(f, { disparo: c.disparo, actualizado: ahoraIso() })
      return f
    }
    if ((m = /^\/ig\/flujos\/([^/]+)\/pedir$/.exec(p))) {
      const a = st.agents.find((x) => x.role === 'setter') ?? st.agents.find((x) => x.department === 'ventas')
      if (a) equipo.pedir(a.id, `En la automatización «${c.nombre ?? ''}»: ${c.texto ?? ''}`)
      return { ok: true, agente: a?.id }
    }
    if ((m = /^\/ig\/flujos\/([^/]+)$/.exec(p))) {
      if (metodo === 'DELETE') {
        st.flujos.automatizaciones = flujos.filter((x) => x.id !== m[1])
        return { ok: true }
      }
      const f = flujos.find((x) => x.id === m[1])
      if (!f) return { error: 'No existe' }
      Object.assign(f, { nodos: c.nodos ?? f.nodos, aristas: c.aristas ?? f.aristas, actualizado: ahoraIso(), editado: ahoraIso() })
      return f
    }
    // ---------- Juan IA ----------
    if ((m = /^\/juan\/chats\/([^/]+)\/frenar$/.exec(p))) {
      const ch = st.juanChats.find((x) => x.id === m[1])
      if (ch) ch.esperando = false
      return { ok: true }
    }
    if ((m = /^\/juan\/chats\/([^/]+)$/.exec(p)) && metodo === 'DELETE') {
      st.juanChats = st.juanChats.filter((x) => x.id !== m[1])
      return { ok: true }
    }
    // ---------- Lo que en la app real sale afuera: acá se simula y se avisa ----------
    if ((m = /^\/requests\/([^/]+)\/descartar$/.exec(p))) {
      const r = st.requests.find((x) => x.id === m[1])
      if (r) Object.assign(r, { state: 'descartado', decididoAt: ahoraIso() })
      return { ok: true }
    }
    if (p === '/import') {
      st.importado = true
      return { ok: true }
    }
    if (p === '/soporte') return { ok: true, respuesta: 'Recibimos tu consulta (esto es de prueba: en la app real llega al equipo de ATV).' }
    if (p === '/phone') return { ok: true, simulado: true }
    if (p === '/connections/instagram/sync') {
      if (st.instagram) st.instagram.lastSync = ahoraIso()
      return { ok: true }
    }
    return undefined
  }

  return { get, post }
}
