// "Tu equipo" en el mock: lo que pasa cuando el dueño le pide algo a un agente, aprueba, pide cambios, edita una
// ficha o toca el roadmap. Todo cambia los mismos datos (st, chats y rutinas), así el Tablero, la Bandeja, el Equipo
// y el Roadmap muestran siempre lo mismo. El servidor guarda esos datos en un archivo (ver server.mjs).
// Nada de esto llega a la entrega: es para probar la interfaz como si el equipo trabajara de verdad.

const ahoraIso = () => new Date().toISOString()
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const corto = (t, n = 70) => {
  const linea = String(t ?? '').split('\n')[0].trim()
  return linea.length > n ? `${linea.slice(0, n - 1).trimEnd()}…` : linea
}
const slug = (t) => corto(t, 40).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'entrega'

// A quién le pasa el Asistente cada pedido, según de qué habla.
const RUTEO = [
  [/anuncio|campa|meta ads|presupuesto|lead|marketing|publicidad/i, 'mkt-capitan'],
  [/n[uú]mero|m[eé]trica|reporte|kpi|dato|an[aá]lisis/i, 'mkt-analista'],
  [/venta|dm|llamada|cierre|setter|closer|lead calificado|seguimiento|mail|correo/i, 'ven-capitan'],
  [/guion|gui[oó]n|reel|historia|contenido|video|post|calendario/i, 'con-capitan'],
  [/bug|error|sistema|automatiz|integraci|calendly|web|landing/i, 'sis-capitan'],
]

// Qué deja cada área cuando termina: lo de ventas sale afuera (espera tu OK siempre), marketing gasta plata y
// contenido y sistemas entregan un archivo (con el piloto en "lo interno" se aprueba solo).
/** El título de lo que entrega sale del pedido, sin el "necesito" o el "armame" del principio y cortado en una palabra entera. */
function tituloDe(pedido) {
  let t = String(pedido ?? '').split('\n')[0].trim().replace(/[.?!]+$/, '')
  t = t.replace(/^(?:hola[,!]?\s+)?(?:necesito|quiero|quisiera|me\s+(?:hac[eé]s|arm[aá]s|pas[aá]s)|arm[aá]me|hac[eé]me|prepar[aá]me|pas[aá]me|mand[aá]me|escrib[ií]me|dame)\s+(?:que\s+)?/i, '')
  if (t.length > 56) t = t.slice(0, 56).replace(/\s+\S*$/, '')
  return t ? t[0].toUpperCase() + t.slice(1) : 'Entrega'
}

function resultadoDe(agente, pedido) {
  const titulo = tituloDe(pedido)
  const area = agente.department
  if (area === 'ventas') return { kind: 'accion', title: 'GMAIL_SEND_EMAIL', payload: JSON.stringify({ recipient_email: 'lucas@clientefit.com', subject: 'Seguimiento de tu aplicación', body: `Hola Lucas, te escribo por lo que hablamos: ${titulo.toLowerCase()}.` }) }
  if (area === 'marketing') return { kind: 'ok', title: `Plan: ${titulo}`, note: 'Propone USD 300 de presupuesto para probarlo una semana.' }
  return { kind: 'entrega', title: titulo, file: `/mock/work/${slug(titulo)}.md` }
}

export function crearEquipo({ st, chats, rut, guardar }) {
  const agente = (id) => st.agents.find((a) => a.id === id)
  const asistente = () => st.agents.find((a) => a.role === 'asistente')
  const dueno = () => st.settings?.owner?.name?.split(/\s+/)[0] ?? 'Franco'
  const chat = (id) => (chats[id] ??= [])
  const decir = (id, text, extra = {}) => chat(id).push({ id: uid('m'), role: 'assistant', text, at: ahoraIso(), ...extra })
  const pasos = (id, lista) => chat(id).push({ id: uid('p'), role: 'assistant', at: ahoraIso(), steps: lista })
  const orden = (from, to, text) => (st.comms ??= []).push({ id: uid('c'), from, to, at: ahoraIso(), text })
  const reportar = (agentId, text, story) => st.ceo.push({ id: uid('ceo'), agentId, author: agente(agentId)?.name ?? 'Asistente', at: ahoraIso(), text, ...(story ? { story } : {}) })
  const ocupar = (a, ahora) => Object.assign(a, { busy: true, queued: false, asleep: false, ahora, sim: true })
  const liberar = (a) => Object.assign(a, { busy: false, queued: false, ahora: null, sim: false })
  const luego = (ms, fn) => setTimeout(() => {
    fn()
    guardar()
  }, ms)

  // El piloto automático decide qué se aprueba solo.
  function piloto(r) {
    const modo = st.settings?.autopiloto?.modo ?? 'apagado'
    const solo = modo === 'todo' || (modo === 'interno' && r.kind === 'entrega')
    if (solo) Object.assign(r, { state: 'aprobado', decididoAt: ahoraIso(), porPiloto: true })
    return solo
  }

  /** Un agente termina lo que le pidieron y lo deja en la Bandeja (o se aprueba solo con el piloto). */
  function terminar(a, pedido, quienPidio) {
    liberar(a)
    const r = { id: uid('r'), author: a.name, agentId: a.id, at: ahoraIso(), state: 'pendiente', ...resultadoDe(a, pedido) }
    st.requests.push(r)
    const aprobado = piloto(r)
    const que = r.kind === 'accion' ? 'Lo dejé listo para mandar' : r.kind === 'ok' ? 'Armé el plan' : 'Terminé la entrega'
    decir(a.id, `${que}: **${r.kind === 'accion' ? 'el mail de seguimiento' : r.title}**. ${aprobado ? 'El piloto automático lo aprobó.' : 'Espera tu OK en la Bandeja.'}`)
    reportar(a.id, `${que}: **${r.kind === 'accion' ? 'mail de seguimiento a Lucas' : r.title}**.${aprobado ? '' : ' Está en la Bandeja esperando tu OK.'}`, { title: r.kind === 'accion' ? 'Mail de seguimiento' : r.title, tag: aprobado ? 'Entrega' : 'Te necesito', pedido: r.id })
    if (quienPidio && quienPidio !== 'dueno') orden(a.id, quienPidio, `Listo: ${r.kind === 'accion' ? 'mail de seguimiento' : r.title}.`)
  }

  /** El dueño le escribe a un agente (desde el Tablero, la Bandeja o el chat). */
  function pedir(id, text) {
    const a = agente(id)
    if (!a) return { error: 'No existe ese agente' }
    chat(id).push({ id: uid('u'), role: 'user', text, at: ahoraIso() })
    orden('dueno', id, text)
    ocupar(a, { kind: 'leer', text: 'Leyendo tu pedido' })
    luego(1400, () => {
      pasos(id, [{ kind: 'leer', text: 'Leyendo tu pedido' }, { kind: 'buscar', text: 'Mirando lo que ya hay en la biblioteca' }])
      a.ahora = { kind: 'buscar', text: 'Mirando lo que ya hay en la biblioteca' }
    })
    if (a.role === 'asistente') {
      const destino = agente(RUTEO.find(([re]) => re.test(text))?.[1] ?? 'mkt-capitan') ?? st.agents.find((x) => x.role === 'captain')
      luego(3500, () => {
        liberar(a)
        if (!destino) return decir(id, `Listo, ${dueno()}. Me ocupo yo.`)
        decir(id, `Dale, ${dueno()}. Se lo pasé a **${destino.name}** (${destino.title ?? destino.department}). Te aviso en #ceo cuando esté.`)
        orden(id, destino.id, text)
        ocupar(destino, { kind: 'editar', text: `Trabajando en «${corto(tituloDe(text), 44)}»` })
      })
      luego(15000, () => destino && terminar(destino, text, id))
    } else {
      luego(4000, () => {
        decir(id, `Dale, ${dueno()}. Me pongo con esto y te aviso.`)
        a.ahora = { kind: 'editar', text: `Trabajando en «${corto(tituloDe(text), 44)}»` }
      })
      luego(12000, () => terminar(a, text, 'dueno'))
    }
    return { ok: true }
  }

  /** Aprobar, pedir cambios o rechazar lo que espera tu OK. */
  function decidir(id, accion, nota = '') {
    const r = st.requests.find((x) => x.id === id)
    if (!r) return { error: 'No existe ese pedido' }
    const a = agente(r.agentId)
    const que = r.kind === 'accion' ? 'el mail' : `«${r.title}»`
    Object.assign(r, { decididoAt: ahoraIso(), nota: nota || undefined })
    if (/approve|aprobar/.test(accion)) {
      r.state = 'aprobado'
      if (a) decir(a.id, `Gracias, ${dueno()}. ${r.kind === 'accion' ? 'Ya lo mandé.' : r.kind === 'ok' ? 'Arranco con el plan.' : 'Queda en la biblioteca.'}`)
      if (r.kind === 'accion' && a) reportar(a.id, `Mandé ${que} que aprobaste.`)
      if (r.kind === 'ok' && a) {
        ocupar(a, { kind: 'herramienta', text: `Poniendo en marcha «${corto(r.title, 40)}»` })
        luego(9000, () => {
          liberar(a)
          reportar(a.id, `Puse en marcha **${r.title}**. Te cuento los primeros números el viernes.`)
        })
      }
      // Si el pedido era una tarea del roadmap, la tarea queda hecha.
      const t = st.roadmap?.pasos.flatMap((p) => p.tareas).find((x) => x.id === r.tareaRoadmap)
      if (t) t.estado = 'hecha'
    } else if (/cambios/.test(accion)) {
      r.state = 'cambios'
      if (a) {
        decir(a.id, `Entendido${nota ? `: «${corto(nota, 80)}»` : ''}. Lo corrijo y te lo vuelvo a pasar.`)
        ocupar(a, { kind: 'editar', text: `Corrigiendo ${corto(r.title, 36)}` })
        luego(10000, () => {
          liberar(a)
          r.state = 'reemplazado'
          const nuevo = { ...r, id: uid('r'), at: ahoraIso(), state: 'pendiente', decididoAt: undefined, nota: undefined, title: r.kind === 'accion' ? r.title : `${r.title.replace(/ \(v\d+\)$/, '')} (v2)` }
          st.requests.push(nuevo)
          decir(a.id, `Ahí va la versión corregida. Espera tu OK en la Bandeja.`)
        })
      }
    } else {
      r.state = 'rechazado'
      if (a) decir(a.id, 'Entendido, lo dejo de lado.')
      const t = st.roadmap?.pasos.flatMap((p) => p.tareas).find((x) => x.id === r.tareaRoadmap)
      if (t) t.estado = 'pendiente'
    }
    return { ok: true }
  }

  function kpi(id, accion) {
    const k = st.kpis.find((x) => x.id === id)
    if (!k) return { error: 'No existe ese KPI' }
    k.state = accion === 'aprobar' ? 'aprobada' : 'rechazada'
    k.decididoAt = ahoraIso()
    if (k.state === 'aprobada') {
      st.readings.push({ kpi: k.id, value: '19', at: ahoraIso() })
      decir(k.agentId, `Gracias. Desde hoy mido **${k.name}** todos los días (meta: ${k.target}).`)
    }
    return { ok: true }
  }

  function editarAgente(id, cambios, metodo) {
    const a = agente(id)
    if (!a) return { error: 'No existe ese agente' }
    if (metodo === 'DELETE') {
      if (a.role === 'asistente') return { error: 'El Asistente no se puede sacar' }
      st.agents.splice(st.agents.indexOf(a), 1)
      return { ok: true }
    }
    const nombre = String(cambios.name ?? a.name).trim()
    if (!nombre) return { error: 'Falta el nombre' }
    if (cambios.managerId === id) return { error: 'No puede reportarse a sí mismo' }
    const antes = a.name
    a.name = nombre
    // Las tareas del roadmap dicen quién las hace por nombre.
    for (const t of st.roadmap?.pasos.flatMap((p) => p.tareas) ?? []) if (t.quien === antes) t.quien = nombre
    if ('title' in cambios) a.title = String(cambios.title ?? '').trim() || undefined
    if (cambios.managerId) a.managerId = cambios.managerId
    if (cambios.model) a.model = cambios.model
    // El nombre nuevo se ve en todo lo que hizo.
    for (const r of st.requests) if (r.agentId === id) r.author = nombre
    for (const p of st.ceo) if (p.agentId === id) p.author = nombre
    return { ok: true }
  }

  function archivos(id) {
    const vistos = new Set()
    return st.requests
      .filter((r) => r.agentId === id && r.file && !vistos.has(r.file) && vistos.add(r.file))
      .sort((x, y) => y.at.localeCompare(x.at))
      .map((r) => ({ path: r.file, name: r.file.split('/').at(-1), title: r.title, at: r.at, state: r.state }))
  }

  // ---------- Roadmap ----------
  const rm = () => st.roadmap
  const renumerar = () => rm().pasos.forEach((p, i) => (p.n = i + 1))
  const tareaPorId = (id) => rm()?.pasos.flatMap((p) => p.tareas).find((t) => t.id === id)
  function roadmap(ruta, c) {
    const r = rm()
    if (!r) return { error: 'No hay roadmap' }
    const paso = r.pasos.find((p) => p.n === c.paso)
    if (ruta === 'tarea') {
      const t = tareaPorId(c.id)
      if (t) Object.assign(t, { estado: c.hecha ? 'hecha' : 'pendiente', hechaAt: c.hecha ? ahoraIso() : undefined })
    } else if (ruta === 'aprobar' && paso) {
      Object.assign(paso, { estado: 'aprobado', aprobadoAt: ahoraIso() })
      const sig = r.pasos.find((p) => p.n === paso.n + 1)
      if (sig) Object.assign(sig, { estado: 'en curso', inicio: ahoraIso() })
      reportar(asistente()?.id ?? 'asistente', `Aprobaste el paso ${paso.n} del roadmap, **${paso.titulo}**.${sig ? ` Arrancamos con «${sig.titulo}».` : ' El plan quedó terminado.'}`)
    } else if (ruta === 'editar') {
      if (c.tarea) {
        const t = tareaPorId(c.tarea)
        if (t) t.texto = c.texto
      } else if (c.agregarTarea && paso) paso.tareas.push({ id: uid('t'), texto: c.texto, estado: 'pendiente', quien: 'Vos', ...(c.parte ? { parte: c.parte } : {}) })
      else if (c.agregarPaso && paso) {
        r.pasos.splice(r.pasos.indexOf(paso) + 1, 0, { n: 0, titulo: c.titulo, detalle: '', estado: 'pendiente', tareas: [] })
        renumerar()
      } else if (paso) {
        if (c.titulo) paso.titulo = c.titulo
        if (c.detalle) paso.detalle = c.detalle
      }
    } else if (ruta === 'borrar') {
      if (c.tarea) for (const p of r.pasos) p.tareas = p.tareas.filter((t) => t.id !== c.tarea)
      else if (paso) {
        r.pasos.splice(r.pasos.indexOf(paso), 1)
        renumerar()
        if (!r.pasos.some((p) => p.estado === 'en curso')) {
          const prox = r.pasos.find((p) => p.estado === 'pendiente')
          if (prox) prox.estado = 'en curso'
        }
      }
    } else if (ruta === 'subpasos') {
      const p = r.pasos.find((x) => x.estado === 'en curso' && !x.tareas.length) ?? r.pasos.find((x) => !x.tareas.length)
      if (p) {
        p.subpasosPedidos = ahoraIso()
        luego(4000, () => {
          p.tareas.push(
            { id: uid('t'), texto: `Definir qué tiene que estar listo en «${p.titulo}»`, estado: 'pendiente', quien: 'Asistente' },
            { id: uid('t'), texto: 'Repartir el trabajo entre las áreas', estado: 'pendiente', quien: 'Asistente' },
            { id: uid('t'), texto: 'Revisarlo con vos antes de aprobar', estado: 'pendiente', quien: 'Vos' },
          )
          p.subpasosPedidos = undefined
        })
      }
    }
    return { ok: true }
  }

  function ceo(text) {
    st.ceo.push({ id: uid('ceo'), agentId: 'dueno', author: st.settings?.owner?.name ?? 'Vos', at: ahoraIso(), text })
    const a = asistente()
    if (a) luego(3000, () => reportar(a.id, `Leído, ${dueno()}. Lo tengo en cuenta para el reporte de hoy.`))
    return { ok: true }
  }

  /** Las rutas de "Tu equipo". Devuelve undefined si la ruta no es de acá. */
  function post(p, c, metodo) {
    let m
    if ((m = /^\/agents\/([^/]+)\/(order|messages)$/.exec(p))) return c.text ? pedir(m[1], String(c.text)) : { error: 'Falta el texto' }
    if ((m = /^\/requests\/([^/]+)\/(approve|aprobar|cambios|reject|rechazar)$/.exec(p))) return decidir(m[1], m[2], c.nota)
    if ((m = /^\/kpis\/([^/]+)\/(aprobar|rechazar)$/.exec(p))) return kpi(m[1], m[2])
    if ((m = /^\/roadmap\/(tarea|aprobar|editar|borrar|subpasos)$/.exec(p))) return roadmap(m[1], c)
    if (p === '/ceo' && c.text) return ceo(String(c.text))
    if ((m = /^\/agents\/([^/]+)$/.exec(p)) && (metodo === 'PATCH' || metodo === 'DELETE')) return editarAgente(m[1], c, metodo)
    if (p === '/routines' && c.id) {
      const r = rut.find((x) => x.id === c.id && x.departamento === c.departamento)
      if (r) r.prendida = Boolean(c.prendida)
      return rut
    }
    return undefined
  }

  function get(p) {
    const m = /^\/agents\/([^/]+)\/files$/.exec(p)
    if (m) return archivos(m[1])
    return undefined
  }

  return { post, get }
}
