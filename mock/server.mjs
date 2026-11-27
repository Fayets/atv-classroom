// Servidor de prueba (mock) para trabajar el diseño de ATV Leverage sin la app real.
//   - Sirve ui/ tal cual, y /ui/app.js como la unión de ui/app/*.js en orden (como hace el servidor real).
//   - Responde /state y las demás rutas con datos inventados (mock/datos.mjs). Lo que se manda (POST) se
//     acepta y, en lo simple (aprobar, mandar un mensaje, prender una rutina), cambia los datos en memoria.
// Uso: npm run dev:mock  →  http://localhost:5180
import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import { extname, join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { estado, mensajes, rutinas, agentes, hace, uso } from './datos.mjs'
import * as ventas from './ventas.mjs'
import * as bib from './biblioteca.mjs'
import * as cls from './classroom.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const UI = join(RAIZ, 'ui')
const PUERTO = Number(process.env.PORT) || 5180
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' }

const st = estado()
st.roadmap = bib.roadmap()
const chats = structuredClone(mensajes)
const rut = structuredClone(rutinas)

const json = (res, data, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(data))
}
const leerCuerpo = (req) =>
  new Promise((ok) => {
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => {
      try { ok(JSON.parse(b || '{}')) } catch { ok({}) }
    })
  })

// Avatar de cada agente: iniciales sobre un color de la marca (el real dibuja un retrato).
const COLORES = ['#242321', '#c0392b', '#8a7a64', '#3a3835', '#b5562e', '#5c5953']
function avatarSvg(id) {
  const a = agentes.find((x) => x.id === id)
  const nombre = a?.name ?? (id === 'juan' ? 'Juan' : id === 'jeremy' ? 'Jeremy' : id)
  const ini = nombre.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const color = COLORES[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORES.length]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${color}"/><text x="32" y="41" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="24" font-weight="600" fill="#f3f0e9">${ini}</text></svg>`
}

async function appJs() {
  const archivos = (await readdir(join(UI, 'app'))).filter((f) => f.endsWith('.js')).sort()
  const partes = await Promise.all(archivos.map(async (f) => `\n// ===== ${f} =====\n${await readFile(join(UI, 'app', f), 'utf8')}`))
  return partes.join('\n')
}

// Respuestas de las rutas GET que no son /state. Lo que no está acá devuelve una lista vacía.
function rutaGet(p, url) {
  // Ventas y Contenido (mock/ventas.mjs)
  if (p === '/classroom/piloto') return cls.piloto()
  if (p === '/classroom/consultas') return cls.consultas()
  if (p === '/classroom/clientes') return cls.clientes(url.searchParams.get('buscar') ?? '')
  if (p === '/classroom/chat') return cls.chat(url.searchParams.get('cliente_id'))
  if (p === '/library') return bib.biblioteca()
  if (p === '/swipes') return bib.swipes()
  if (p === '/ig/bandeja') return ventas.bandeja()
  if (p === '/ig/buscar') { const q = (url.searchParams.get('q') ?? '').toLowerCase(); return { conversaciones: ventas.bandeja().conversaciones.filter((c) => (c.nombre + ' ' + c.usuario).toLowerCase().includes(q)) } }
  if (p.startsWith('/ig/chat/')) return ventas.chat(decodeURIComponent(p.slice(9)))
  if (p === '/ig/embudo') return ventas.embudo()
  if (p === '/ig/contactos') return ventas.contactos()
  if (p === '/ig/flujos') return ventas.flujos()
  if (p === '/ig/vista') return ventas.vista()
  if (p === '/ig/llamadas') return { c1: 'agendo', c2: 'vino', c5: 'cerro', c7: 'no_vino' }
  if (p === '/ig/calificados') return { conversaciones: ventas.bandeja().conversaciones.filter((c) => c.calificacion.veredicto === 'calificado') }
  if (p === '/ig/calificacion') { const u = url.searchParams.get('usuario'); return ventas.bandeja().conversaciones.find((c) => c.usuario === u)?.calificacion ?? { veredicto: 'pendiente' } }
  if (p === '/ig/notas') return { notas: [{ id: 'n1', rol: 'setter', autor: 'Sofía', fecha: hace(300), texto: 'Muy interesada; le mandé el link de la agenda.' }, { id: 'n2', rol: 'closer', autor: 'Joaquín', fecha: hace(60), texto: 'Llamada el jueves 16 h.' }] }
  if (p.startsWith('/ig/seguimiento/')) return {}
  if (p === '/ig/contenido') return { historias: [], reels: [] }

  if (p === '/state') return st
  if (p === '/routines') return rut
  const m = /^\/agents\/([^/]+)\/messages$/.exec(p)
  if (m) return chats[m[1]] ?? []
  const vacios = {
    '/usage': uso,
    '/connections': { composio: { accounts: [] }, apps: [], problem: null },
    '/departments': [],
    '/library/items': [],
    '/embudos': [],
    '/juan/chats': [],
    '/onboarding': st.settings.onboarding,
    '/perfil/rapido': { lectura: null },
    '/conversiones': {},
    '/ceo': st.ceo,
    '/navegador': {},
    '/licencia-equipo': null,
  }
  return p in vacios ? vacios[p] : []
}

async function rutaPost(p, cuerpo) {
  // Classroom: tomar/marcar/soltar una consulta, pedirle a Juan IA la respuesta, mandarla o descartarla, y el modo del piloto.
  const cq = /^\/classroom\/consultas\/(tomar|marcar|soltar)$/.exec(p)
  if (cq) return cls.marcar(cq[1], cuerpo)
  if (p === '/classroom/armar') return cls.armar(cuerpo)
  const cr = /^\/classroom\/respuesta\/([^/]+)\/(mandar|descartar)$/.exec(p)
  if (cr) return cls.responder(cr[1])
  const cm = /^\/classroom\/piloto\/([^/]+)$/.exec(p)
  if (cm) {
    const m = cls.piloto().modos.find((x) => String(x.admin_id) === cm[1])
    if (m) m.modo = cuerpo.modo
    return { ok: true }
  }
  const ap =/^\/requests\/([^/]+)\/(approve|aprobar|reject|rechazar)$/.exec(p)
  if (ap) {
    const r = st.requests.find((x) => x.id === ap[1])
    if (r) r.state = /approve|aprobar/.test(ap[2]) ? 'aprobado' : 'rechazado'
    return { ok: true }
  }
  const msg = /^\/agents\/([^/]+)\/messages$/.exec(p)
  if (msg && cuerpo.text) {
    const lista = (chats[msg[1]] ??= [])
    lista.push({ id: `u${Date.now()}`, role: 'user', text: cuerpo.text, at: hace(0) })
    setTimeout(() => lista.push({ id: `r${Date.now()}`, role: 'assistant', text: 'Recibido (esto es una respuesta de prueba del mock).', at: hace(0) }), 1500)
    return { ok: true }
  }
  if (p === '/routines' && cuerpo.id) {
    const r = rut.find((x) => x.id === cuerpo.id && x.departamento === cuerpo.departamento)
    if (r) r.prendida = Boolean(cuerpo.prendida)
    return rut
  }
  // Juan IA: un chat nuevo o uno que sigue; contesta con una respuesta de prueba a los 2,5 s.
  if (p === '/juan/chats' && cuerpo.texto) {
    let chat = st.juanChats.find((c) => c.id === cuerpo.chat)
    if (!chat) {
      chat = { id: `j${Date.now()}`, titulo: cuerpo.texto.slice(0, 48), proyecto: cuerpo.proyecto ?? '', mensajes: [] }
      st.juanChats.unshift(chat)
    }
    chat.mensajes.push({ rol: 'yo', texto: cuerpo.texto })
    chat.esperando = true
    chat.at = hace(0)
    st.juanPasos = { ...(st.juanPasos ?? {}), [chat.id]: [{ kind: 'leer', text: 'Leyendo el SOP que corresponde' }, { kind: 'buscar', text: 'Mirando tus números' }] }
    setTimeout(() => {
      chat.mensajes.push({ rol: 'juan', pasos: st.juanPasos[chat.id], texto: 'Buena pregunta. **Esto es una respuesta de prueba del mock.**\n\nEn la app real, Juan contesta con el método de ATV y con los datos de tu negocio.' })
      chat.esperando = false
    }, 2500)
    return { id: chat.id }
  }
  if (p === '/settings/autopiloto' && cuerpo.modo) {
    st.settings.autopiloto = { modo: cuerpo.modo }
    return { ok: true }
  }
  return { ok: true }
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const p = url.pathname
  try {
    if (p === '/' || p === '/index.html') {
      const html = (await readFile(join(UI, 'index.html'), 'utf8')).replace('__TOKEN__', 'mock')
      res.writeHead(200, { 'content-type': TIPOS['.html'], 'cache-control': 'no-store' })
      return res.end(html)
    }
    if (p === '/ui/app.js') {
      res.writeHead(200, { 'content-type': TIPOS['.js'], 'cache-control': 'no-store' })
      return res.end(await appJs())
    }
    if (p.startsWith('/ui/')) {
      const archivo = normalize(join(UI, p.slice(4)))
      if (!archivo.startsWith(UI)) return json(res, { error: 'No' }, 403)
      const datos = await readFile(archivo).catch(() => null)
      if (!datos) return json(res, { error: 'No existe' }, 404)
      res.writeHead(200, { 'content-type': TIPOS[extname(archivo)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
      return res.end(datos)
    }
    const mini = /^\/media\/historias\/([^/]+)$/.exec(p)
    if (mini) {
      res.writeHead(200, { 'content-type': TIPOS['.svg'] })
      return res.end(ventas.miniatura(mini[1]))
    }
    const av = /^\/avatar\/([^/]+)\.svg$/.exec(p)
    if (av) {
      res.writeHead(200, { 'content-type': TIPOS['.svg'] })
      return res.end(avatarSvg(av[1]))
    }
    if (req.method === 'GET') return json(res, rutaGet(p, url))
    return json(res, await rutaPost(p, await leerCuerpo(req)))
  } catch (e) {
    console.error(p, e)
    json(res, { error: String(e) }, 500)
  }
}).listen(PUERTO, () => console.log(`Leverage (mock) en http://localhost:${PUERTO}`))
