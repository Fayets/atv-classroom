// Rutas del mock: admin (contenido, permisos, tools, equipo de ATV, cupos), Cerebro y Consultas.
// Ver util.js para la forma de cada ruta. Las formas siguen backend/src/controllers/admin_controller.py,
// equipo_controller.py, equipo_cliente_controller.py, tools_controller.py, cerebro_controller.py y
// consultas_controller.py. Todo lo que se cambia vive en memoria hasta recargar.

import { CLIENTE, USUARIO } from '../datos'
import { detalleClase, detallePrograma, listaProgramas } from '../classroom'
import { toolsDelCliente, toolsDelEquipo } from '../extras'
import { grafoCerebro, nodoCerebro } from '../datos-admin'
import { cuerpo, iso, json, nuevoId, params, prohibido, quien, sinContenido } from '../util'

const detalleError = (detalle, status) => json({ detail: detalle }, status)
const noHay = (detalle) => detalleError(detalle, 404)

// Todo /api/admin/* es solo para admins (requerir_admin).
const soloAdmin = (responder) => (coincidencia, opciones, url) =>
  quien(opciones) === 'admin' ? responder(coincidencia, opciones, url) : prohibido('Acceso denegado.')

// ---------------------------------------------------------------- Contenido (módulos, secciones, clases)
// Se trabaja sobre los objetos de classroom.js (las secciones y clases son los mismos que ve el classroom:
// lo que se edita o se crea acá se ve ahí). Lo que classroom.js no guarda (descripción y recursos de cada
// clase, y los datos de un módulo) vive en estos mapas.
const IDS_MODULOS = listaProgramas().map((p) => p.id)
const modulosNuevos = []
const modulosBorrados = new Set()
const edicionesModulo = new Map() // id → campos editados
const extrasClase = new Map() // claseId → { descripcion, recursos }

const modulosVivos = () => [...IDS_MODULOS.filter((id) => !modulosBorrados.has(id)).map((id) => detallePrograma(id)), ...modulosNuevos]
const moduloDe = (id) => modulosVivos().find((p) => p.id === id) || null
const conEdiciones = (p) => ({ ...p, ...(edicionesModulo.get(p.id) || {}) })
const portada = (p) => p.cover_url || (p.slug ? `/modules/${p.slug}.jpg` : null)
const porOrden = (a, b) => a.orden - b.orden

const tipoRecurso = (url) => (String(url).startsWith('/uploads/') ? 'pdf' : 'link')
const extraDe = (clase) => {
  if (!extrasClase.has(clase.id)) {
    const base = detalleClase(clase.id)?.recursos || []
    extrasClase.set(clase.id, { descripcion: null, recursos: base.map((r) => ({ ...r })) })
  }
  return extrasClase.get(clase.id)
}

const claseAdmin = (c) => {
  const extra = extraDe(c)
  return {
    id: c.id,
    titulo: c.titulo,
    orden: c.orden,
    video_url: c.video_url ?? null,
    video_bloqueado_para: [...(c.video_bloqueado_para || [])],
    duracion_segundos: c.duracion_segundos ?? null,
    descripcion: extra.descripcion,
    recursos: [...extra.recursos].sort(porOrden).map((r) => ({ id: r.id, titulo: r.titulo, url: r.url, orden: r.orden, tipo: r.tipo || tipoRecurso(r.url) })),
  }
}
const seccionAdmin = (s) => ({ id: s.id, titulo: s.titulo, orden: s.orden, clases: [...s.clases].sort(porOrden).map(claseAdmin) })
const moduloDetalle = (p) => {
  const m = conEdiciones(p)
  return { id: m.id, titulo: m.titulo, slug: m.slug ?? null, descripcion: m.descripcion ?? null, orden: m.orden, cover_url: portada(m), secciones: [...p.secciones].sort(porOrden).map(seccionAdmin) }
}
const moduloItem = (p) => {
  const m = conEdiciones(p)
  return {
    id: m.id,
    titulo: m.titulo,
    slug: m.slug ?? null,
    descripcion: m.descripcion ?? null,
    orden: m.orden,
    cover_url: portada(m),
    total_secciones: p.secciones.length,
    total_clases: p.secciones.reduce((t, s) => t + s.clases.length, 0),
  }
}

const buscarSeccion = (id) => {
  for (const p of modulosVivos()) {
    const s = p.secciones.find((x) => x.id === id)
    if (s) return { p, s }
  }
  return null
}
const buscarClase = (id) => {
  for (const p of modulosVivos()) {
    for (const s of p.secciones) {
      const c = s.clases.find((x) => x.id === id)
      if (c) return { p, s, c }
    }
  }
  return null
}

const tituloValido = (t) => typeof t === 'string' && t.length >= 1
const sinTitulo = () => detalleError('El título no puede estar vacío.', 422)
const numero = (v, porDefecto = 0) => (Number.isFinite(Number(v)) ? Number(v) : porDefecto)

// Como sincronizar_recursos: reemplaza la lista; los que ya existían (misma URL) conservan su id.
const sincronizarRecursos = (clase, nuevos) => {
  const extra = extraDe(clase)
  extra.recursos = nuevos.map((r, i) => {
    const previo = extra.recursos.find((x) => x.url === r.url)
    return { id: previo?.id ?? nuevoId(), titulo: r.titulo, url: r.url, orden: r.orden ?? i, tipo: previo?.tipo || tipoRecurso(r.url) }
  })
}

const aplicarClase = (c, datos) => {
  for (const campo of ['titulo', 'orden', 'duracion_segundos']) if (campo in datos) c[campo] = datos[campo]
  if ('video_url' in datos) {
    c.video_url = datos.video_url
    c.video_proximamente = !datos.video_url
  }
  if (datos.video_bloqueado_para != null) c.video_bloqueado_para = [...datos.video_bloqueado_para]
  if ('descripcion' in datos) extraDe(c).descripcion = datos.descripcion
  if ('recursos' in datos) sincronizarRecursos(c, datos.recursos || [])
}

const rutasContenido = [
  ['GET', /^\/api\/admin\/programas$/, soloAdmin(() => json(modulosVivos().map(moduloItem).sort(porOrden)))],
  ['GET', /^\/api\/admin\/programas\/(\d+)$/, soloAdmin(([, id]) => {
    const p = moduloDe(Number(id))
    return p ? json(moduloDetalle(p)) : noHay('Programa no encontrado.')
  })],
  ['POST', /^\/api\/admin\/programas$/, soloAdmin((_, opciones) => {
    const datos = cuerpo(opciones)
    if (!tituloValido(datos.titulo)) return sinTitulo()
    if (datos.slug && modulosVivos().some((p) => conEdiciones(p).slug === datos.slug)) return detalleError('El slug ya existe.', 409)
    const nuevo = { id: nuevoId(), slug: datos.slug || null, titulo: datos.titulo, orden: numero(datos.orden), descripcion: datos.descripcion ?? null, cover_url: datos.cover_url ?? null, secciones: [] }
    modulosNuevos.push(nuevo)
    return json(moduloDetalle(nuevo), 201)
  })],
  ['PUT', /^\/api\/admin\/programas\/(\d+)$/, soloAdmin(([, id], opciones) => {
    const p = moduloDe(Number(id))
    if (!p) return noHay('Programa no encontrado.')
    const datos = cuerpo(opciones)
    if ('titulo' in datos && !tituloValido(datos.titulo)) return sinTitulo()
    if (datos.slug && modulosVivos().some((x) => x.id !== p.id && conEdiciones(x).slug === datos.slug)) return detalleError('El slug ya existe.', 409)
    const cambios = {}
    for (const campo of ['titulo', 'slug', 'descripcion', 'orden', 'cover_url']) if (campo in datos) cambios[campo] = campo === 'orden' ? numero(datos.orden) : datos[campo]
    edicionesModulo.set(p.id, { ...(edicionesModulo.get(p.id) || {}), ...cambios })
    return json(moduloDetalle(p))
  })],
  ['DELETE', /^\/api\/admin\/programas\/(\d+)$/, soloAdmin(([, id]) => {
    const p = moduloDe(Number(id))
    if (!p) return noHay('Programa no encontrado.')
    const i = modulosNuevos.indexOf(p)
    if (i >= 0) modulosNuevos.splice(i, 1)
    else modulosBorrados.add(p.id)
    return sinContenido()
  })],

  ['POST', /^\/api\/admin\/programas\/(\d+)\/secciones$/, soloAdmin(([, id], opciones) => {
    const p = moduloDe(Number(id))
    if (!p) return noHay('Programa no encontrado.')
    const datos = cuerpo(opciones)
    if (!tituloValido(datos.titulo)) return sinTitulo()
    const seccion = { id: nuevoId(), titulo: datos.titulo, orden: numero(datos.orden), clases: [] }
    p.secciones.push(seccion)
    return json(seccionAdmin(seccion), 201)
  })],
  ['PUT', /^\/api\/admin\/secciones\/(\d+)$/, soloAdmin(([, id], opciones) => {
    const lugar = buscarSeccion(Number(id))
    if (!lugar) return noHay('Sección no encontrada.')
    const datos = cuerpo(opciones)
    if ('titulo' in datos && !tituloValido(datos.titulo)) return sinTitulo()
    if ('titulo' in datos) lugar.s.titulo = datos.titulo
    if ('orden' in datos) lugar.s.orden = numero(datos.orden)
    return json(seccionAdmin(lugar.s))
  })],
  ['DELETE', /^\/api\/admin\/secciones\/(\d+)$/, soloAdmin(([, id]) => {
    const lugar = buscarSeccion(Number(id))
    if (!lugar) return noHay('Sección no encontrada.')
    lugar.s.clases.forEach((c) => extrasClase.delete(c.id))
    lugar.p.secciones.splice(lugar.p.secciones.indexOf(lugar.s), 1)
    return sinContenido()
  })],

  ['POST', /^\/api\/admin\/secciones\/(\d+)\/clases$/, soloAdmin(([, id], opciones) => {
    const lugar = buscarSeccion(Number(id))
    if (!lugar) return noHay('Sección no encontrada.')
    const datos = cuerpo(opciones)
    if (!tituloValido(datos.titulo)) return sinTitulo()
    const clase = {
      id: nuevoId(),
      titulo: datos.titulo,
      orden: numero(datos.orden),
      video_url: datos.video_url ?? null,
      video_proximamente: !datos.video_url,
      video_bloqueado_para: [...(datos.video_bloqueado_para || [])],
      duracion_segundos: datos.duracion_segundos ?? null,
      completado: false,
    }
    extrasClase.set(clase.id, { descripcion: datos.descripcion ?? null, recursos: [] })
    lugar.s.clases.push(clase)
    if (datos.recursos?.length) sincronizarRecursos(clase, datos.recursos.filter(Boolean))
    return json(claseAdmin(clase), 201)
  })],
  ['PUT', /^\/api\/admin\/clases\/(\d+)\/bloqueo$/, soloAdmin(([, id], opciones) => {
    const lugar = buscarClase(Number(id))
    if (!lugar) return noHay('Clase no encontrada.')
    const planes = cuerpo(opciones).planes || []
    lugar.c.video_bloqueado_para = PLANES.map((p) => p.id).filter((p) => planes.includes(p))
    return json(claseAdmin(lugar.c))
  })],
  ['PUT', /^\/api\/admin\/clases\/(\d+)$/, soloAdmin(([, id], opciones) => {
    const lugar = buscarClase(Number(id))
    if (!lugar) return noHay('Clase no encontrada.')
    const datos = cuerpo(opciones)
    if ('titulo' in datos && !tituloValido(datos.titulo)) return sinTitulo()
    aplicarClase(lugar.c, datos)
    return json(claseAdmin(lugar.c))
  })],
  ['DELETE', /^\/api\/admin\/clases\/(\d+)$/, soloAdmin(([, id]) => {
    const lugar = buscarClase(Number(id))
    if (!lugar) return noHay('Clase no encontrada.')
    lugar.s.clases.splice(lugar.s.clases.indexOf(lugar.c), 1)
    extrasClase.delete(lugar.c.id)
    return sinContenido()
  })],

  // Subir un PDF (multipart). El archivo no va a ningún lado: se ofrece con una URL local del navegador.
  ['POST', /^\/api\/admin\/clases\/(\d+)\/recursos\/upload$/, soloAdmin(([, id], opciones) => {
    const lugar = buscarClase(Number(id))
    if (!lugar) return noHay('Clase no encontrada.')
    const form = opciones.body
    const archivo = form instanceof FormData ? form.get('archivo') : null
    const nombre = archivo?.name || 'documento.pdf'
    if (!nombre.toLowerCase().endsWith('.pdf')) return detalleError('Solo se permiten archivos PDF.', 400)
    if (archivo && archivo.size === 0) return detalleError('El archivo PDF está vacío.', 400)
    const titulo = String(form instanceof FormData ? form.get('titulo') || '' : '').trim() || nombre.replace(/\.pdf$/i, '')
    const extra = extraDe(lugar.c)
    const recurso = {
      id: nuevoId(),
      titulo,
      url: archivo ? URL.createObjectURL(archivo) : `/uploads/mock/clase-${lugar.c.id}.pdf`,
      orden: extra.recursos.length,
      tipo: 'pdf',
    }
    extra.recursos.push(recurso)
    return json({ id: recurso.id, titulo: recurso.titulo, url: recurso.url, orden: recurso.orden, tipo: 'pdf' }, 201)
  })],
  ['DELETE', /^\/api\/admin\/recursos\/(\d+)$/, soloAdmin(([, id]) => {
    for (const extra of extrasClase.values()) {
      const i = extra.recursos.findIndex((r) => r.id === Number(id))
      if (i >= 0) {
        extra.recursos.splice(i, 1)
        return sinContenido()
      }
    }
    return noHay('Recurso no encontrado.')
  })],
]

// ---------------------------------------------------------------- Permisos por plan y cupos del equipo del cliente
// permisos_service.py y video_acceso.PLANES_VIDEO.
const PLANES = [
  { id: 'high', nombre: 'High Level' },
  { id: 'dfy', nombre: 'DFY' },
  { id: 'boost', nombre: 'Boost' },
  { id: 'mid', nombre: 'Mid level' },
  { id: 'entry', nombre: 'Entry level' },
  { id: 'mentoria', nombre: 'Mentoría' },
  { id: '2k', nombre: '2K' },
]
const PERMISOS = {
  clases: ['Clases (videos)', ['si', 'no']],
  sops: ['SOPs', ['si', 'no']],
  roadmaps: ['Roadmaps', ['si', 'no']],
  chat: ['Chat con coaches', ['si', '1a1', 'no']],
  comunidad: ['Comunidad', ['si', 'no']],
  ia: ['Asistente IA', ['si', 'no']],
}
const POR_DEFECTO_2K = { chat: '1a1', comunidad: 'no', ia: 'no', roadmaps: 'no' }
const valorPorDefecto = (plan, clave) => (plan === '2k' ? POR_DEFECTO_2K[clave] : null) || 'si'
const permisosGuardados = new Map() // "plan|clave" → valor

// Los cupos se guardan por plan crudo (High Level es "advantage" ahí).
const PLANES_CUPO = ['mentoria', 'boost', 'advantage', 'dfy', 'mid', 'entry', '2k']
const CUPO_DE = { high: 'advantage' }
const LIMITE_POR_DEFECTO = 10
const cuposGuardados = new Map()
const limiteDe = (plan) => cuposGuardados.get(plan) ?? (plan === '2k' ? 0 : LIMITE_POR_DEFECTO)

// El equipo de Alan Klein (Mi cuenta → Tu equipo). El resto de los planes tiene miembros de relleno.
const ROLES_EQUIPO = { socio: 'Socio', setter: 'Setter', closer: 'Closer', editor: 'Editor', otro: 'Equipo' }
const miembrosCliente = [{ id: 1, email: 'sofia.pereyra@ejemplo.com', nombre: 'Sofía Pereyra', rol: 'setter', rol_nombre: 'Setter', creado_en: iso(60 * 24 * 12) }]
const MIEMBROS_DE_OTROS = { advantage: 2, mentoria: 1, dfy: 1 }
const miembrosUsados = (plan) => (plan === 'boost' ? miembrosCliente.length : MIEMBROS_DE_OTROS[plan] || 0)

const matrizPermisos = () => ({
  planes: PLANES,
  permisos: Object.entries(PERMISOS).map(([clave, [nombre, valores]]) => ({
    clave,
    nombre,
    valores,
    por_plan: Object.fromEntries(PLANES.map((p) => [p.id, permisosGuardados.get(`${p.id}|${clave}`) || valorPorDefecto(p.id, clave)])),
  })),
  equipo: Object.fromEntries(PLANES.map((p) => [p.id, limiteDe(CUPO_DE[p.id] || p.id)])),
  plan_cupo: Object.fromEntries(PLANES.map((p) => [p.id, CUPO_DE[p.id] || p.id])),
})

const limitesCupos = () => ({
  por_defecto: LIMITE_POR_DEFECTO,
  planes: PLANES_CUPO.map((plan) => ({ plan, maximo: cuposGuardados.get(plan) ?? LIMITE_POR_DEFECTO, miembros: miembrosUsados(plan) })),
})

const rutasPermisos = [
  ['GET', /^\/api\/admin\/permisos$/, soloAdmin(() => json(matrizPermisos()))],
  ['PUT', /^\/api\/admin\/permisos$/, soloAdmin((_, opciones) => {
    const cambios = cuerpo(opciones).cambios || []
    for (const { plan, clave, valor } of cambios) {
      if (!PLANES.some((p) => p.id === plan) || !PERMISOS[clave] || !PERMISOS[clave][1].includes(valor)) {
        return detalleError(`Permiso inválido: ${plan} · ${clave} · ${valor}.`, 422)
      }
    }
    for (const { plan, clave, valor } of cambios) permisosGuardados.set(`${plan}|${clave}`, valor)
    return json(matrizPermisos())
  })],

  ['GET', /^\/api\/admin\/equipos-clientes$/, soloAdmin(() => json(limitesCupos()))],
  ['PUT', /^\/api\/admin\/equipos-clientes$/, soloAdmin((_, opciones) => {
    const planes = cuerpo(opciones).planes || {}
    for (const [plan, maximo] of Object.entries(planes)) {
      if (!PLANES_CUPO.includes(plan)) return detalleError(`Plan desconocido: ${plan}`, 422)
      if (!Number.isInteger(maximo) || maximo < 0 || maximo > 100) return detalleError('El cupo va de 0 a 100.', 422)
    }
    for (const [plan, maximo] of Object.entries(planes)) cuposGuardados.set(plan, maximo)
    return json(limitesCupos())
  })],
]

// ---------------------------------------------------------------- Equipo del cliente (Mi cuenta → Tu equipo)
// equipo_cliente_service.py: solo el titular (un cliente) maneja su equipo.
const soloCliente = (responder) => (coincidencia, opciones, url) =>
  quien(opciones) === 'cliente' ? responder(coincidencia, opciones, url) : prohibido('Esto es para clientes.')
const MAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const limpiarMiembro = (datos) => {
  const email = String(datos.email || '').trim().toLowerCase()
  const nombre = String(datos.nombre || '').split(/\s+/).filter(Boolean).join(' ')
  if (!MAIL.test(email)) return { error: detalleError('Revisá el mail.', 422) }
  if (!nombre) return { error: detalleError('Poné el nombre de la persona.', 422) }
  if (nombre.length > 80) return { error: detalleError('El nombre es muy largo.', 422) }
  if (!ROLES_EQUIPO[datos.rol]) return { error: detalleError('Elegí un rol.', 422) }
  return { email, nombre, rol: datos.rol }
}
const mailOcupado = (email, miembroId) => {
  if (email === CLIENTE.email) return detalleError('Ese es el mail principal de tu cuenta: con ese entrás vos.', 409)
  if (email === USUARIO.email) return detalleError('Ese mail es de alguien del equipo de ATV.', 409)
  return miembrosCliente.some((m) => m.email === email && m.id !== miembroId) ? detalleError('Esa persona ya está en tu equipo.', 409) : null
}

const rutasEquipoCliente = [
  ['GET', /^\/api\/cuenta\/equipo$/, soloCliente(() => json({
    maximo: limiteDe('boost'),
    miembros: miembrosCliente,
    roles: Object.entries(ROLES_EQUIPO).map(([id, nombre]) => ({ id, nombre })),
  }))],
  ['POST', /^\/api\/cuenta\/equipo$/, soloCliente((_, opciones) => {
    const limpio = limpiarMiembro(cuerpo(opciones))
    if (limpio.error) return limpio.error
    const maximo = limiteDe('boost')
    if (miembrosCliente.length >= maximo) return detalleError(`Tu plan permite sumar hasta ${maximo} personas.`, 422)
    const ocupado = mailOcupado(limpio.email)
    if (ocupado) return ocupado
    const miembro = { id: nuevoId(), email: limpio.email, nombre: limpio.nombre, rol: limpio.rol, rol_nombre: ROLES_EQUIPO[limpio.rol], creado_en: iso(0) }
    miembrosCliente.push(miembro)
    return json(miembro)
  })],
  ['PATCH', /^\/api\/cuenta\/equipo\/(\d+)$/, soloCliente(([, id], opciones) => {
    const limpio = limpiarMiembro(cuerpo(opciones))
    if (limpio.error) return limpio.error
    const miembro = miembrosCliente.find((m) => m.id === Number(id))
    if (!miembro) return noHay('No está en tu equipo.')
    const ocupado = mailOcupado(limpio.email, miembro.id)
    if (ocupado) return ocupado
    Object.assign(miembro, { email: limpio.email, nombre: limpio.nombre, rol: limpio.rol, rol_nombre: ROLES_EQUIPO[limpio.rol] })
    return json(miembro)
  })],
  ['DELETE', /^\/api\/cuenta\/equipo\/(\d+)$/, soloCliente(([, id]) => {
    const i = miembrosCliente.findIndex((m) => m.id === Number(id))
    if (i < 0) return noHay('No está en tu equipo.')
    miembrosCliente.splice(i, 1)
    return json({ ok: true })
  })],
]

// ---------------------------------------------------------------- Equipo de ATV (admin → Equipo)
// equipo_service.py. Los coaches y admins que entran al classroom.
const AREAS = ['marketing', 'ventas', 'sistemas', 'equipo', 'fulfillment', 'mentalidad', 'va']
const miembro = (id, nombre, email, rol, area, extra = {}) => ({ id, email, nombre, rol, area, activo: true, foto_url: null, con_google: true, con_clave: false, ...extra })
const equipoAtv = [
  miembro(3, USUARIO.nombre, USUARIO.email, 'admin', 'marketing'),
  miembro(5, 'Alejandro', 'alejandro@atvos.io', 'coach', 'ventas'),
  miembro(6, 'Lucas', 'lucas@atvos.io', 'coach', 'sistemas'),
  miembro(7, 'Lucho Vicente', 'lucho@atvos.io', 'coach', 'fulfillment'),
  miembro(8, 'Nick', 'nick@atvos.io', 'coach', 'ventas'),
  miembro(9, 'Mariana Costa', 'mariana@atvos.io', 'coach', 'mentalidad', { con_google: false }),
  miembro(10, 'Martina Ríos', 'martina@atvos.io', 'coach', 'va', { activo: false }),
]
const borradosAtv = new Set()
const adminsActivos = () => equipoAtv.filter((a) => a.activo && a.rol === 'admin' && !borradosAtv.has(a.id)).length

const validarMiembro = (rol, area) => {
  if (rol != null && !['admin', 'coach'].includes(rol)) return detalleError('El rol tiene que ser admin o coach.', 422)
  if (area && !AREAS.includes(area)) return detalleError('Área inválida.', 422)
  return null
}
const listaEquipoAtv = () =>
  equipoAtv
    .filter((a) => !borradosAtv.has(a.id))
    .sort((a, b) => Number(!a.activo) - Number(!b.activo) || Number(a.rol !== 'admin') - Number(b.rol !== 'admin') || (a.nombre || a.email).toLowerCase().localeCompare((b.nombre || b.email).toLowerCase()))

const rutasEquipoAtv = [
  ['GET', /^\/api\/admin\/equipo$/, soloAdmin(() => json(listaEquipoAtv()))],
  ['POST', /^\/api\/admin\/equipo$/, soloAdmin((_, opciones) => {
    const datos = cuerpo(opciones)
    const email = String(datos.email || '').trim().toLowerCase()
    if (!MAIL.test(email)) return detalleError('value is not a valid email address', 422)
    const error = validarMiembro(datos.rol, datos.area)
    if (error) return error
    const previo = equipoAtv.find((a) => a.email.toLowerCase() === email)
    if (previo && !borradosAtv.has(previo.id)) return detalleError('Ese mail ya está en el equipo.', 409)
    if (previo) {
      // Vuelve alguien que se había borrado: se reusa su fila.
      borradosAtv.delete(previo.id)
      Object.assign(previo, { activo: true, nombre: String(datos.nombre || '').trim() || previo.nombre, rol: datos.rol || 'coach', area: datos.area || null })
      return json(previo, 201)
    }
    const nuevo = miembro(nuevoId(), String(datos.nombre || '').trim(), email, datos.rol || 'coach', datos.area || null, { con_google: false })
    equipoAtv.push(nuevo)
    return json(nuevo, 201)
  })],
  ['PATCH', /^\/api\/admin\/equipo\/(\d+)$/, soloAdmin(([, id], opciones) => {
    const datos = cuerpo(opciones)
    const error = validarMiembro(datos.rol, datos.area)
    if (error) return error
    const a = equipoAtv.find((x) => x.id === Number(id))
    if (!a) return noHay('No existe ese miembro del equipo.')
    const pierdeAdmin = (datos.rol === 'coach' || datos.activo === false) && a.rol === 'admin'
    if (a.id === USUARIO.usuario_id && pierdeAdmin) return detalleError('No podés quitarte el rol de admin ni darte de baja a vos mismo.', 409)
    if (pierdeAdmin && a.activo && adminsActivos() <= 1) return detalleError('Tiene que quedar al menos un admin activo.', 409)
    if (datos.nombre != null) a.nombre = datos.nombre.trim()
    if (datos.rol) a.rol = datos.rol
    if ('area' in datos) a.area = datos.area || null
    if (datos.activo != null) a.activo = datos.activo
    return json(a)
  })],
  ['DELETE', /^\/api\/admin\/equipo\/(\d+)$/, soloAdmin(([, id]) => {
    const a = equipoAtv.find((x) => x.id === Number(id))
    if (!a || borradosAtv.has(a.id)) return noHay('No existe ese miembro del equipo.')
    if (a.id === USUARIO.usuario_id) return detalleError('No podés borrarte a vos mismo.', 409)
    if (a.activo) return detalleError('Primero dalo de baja.', 409)
    borradosAtv.add(a.id)
    return json({ ok: true })
  })],
]

// ---------------------------------------------------------------- Tools (tools_service.py)
const ESTADOS_TOOL = ['incluida', 'paga', 'oculta']
const TOOLS_BASE = toolsDelEquipo().tools.map(({ id, nombre, tono, duracion, nuevo, descripcion }) => ({ id, nombre, tono, duracion, descripcion, ...(nuevo ? { nuevo } : {}) }))
const toolsClienteInicial = Object.fromEntries(toolsDelCliente().tools.map((t) => [t.id, t]))
const toolsVisible = { valor: true }
const estadoTool = new Map() // "plan|tool" → estado
const precioTool = new Map(Object.values(toolsClienteInicial).filter((t) => t.precio).map((t) => [t.id, t.precio]))
const estadoDe = (plan, tool) => estadoTool.get(`${plan}|${tool}`) || toolsClienteInicial[tool]?.estado || 'paga'

const matrizTools = () => ({
  visible: toolsVisible.valor,
  planes: PLANES,
  estados: ESTADOS_TOOL,
  tools: TOOLS_BASE.map((t) => ({ ...t, precio: precioTool.get(t.id) || '', por_plan: Object.fromEntries(PLANES.map((p) => [p.id, estadoDe(p.id, t.id)])) })),
})

const rutasTools = [
  ['GET', /^\/api\/tools\/admin$/, soloAdmin(() => json(matrizTools()))],
  ['PUT', /^\/api\/tools\/admin$/, soloAdmin((_, opciones) => {
    const { visible, cambios = [], precios = {} } = cuerpo(opciones)
    for (const c of cambios) {
      if (!PLANES.some((p) => p.id === c.plan) || !TOOLS_BASE.some((t) => t.id === c.tool) || !ESTADOS_TOOL.includes(c.estado)) {
        return detalleError(`Cambio inválido: ${c.plan} · ${c.tool} · ${c.estado}.`, 422)
      }
    }
    for (const id of Object.keys(precios)) if (!TOOLS_BASE.some((t) => t.id === id)) return detalleError(`No existe la tool ${id}.`, 422)
    if (visible != null) toolsVisible.valor = Boolean(visible)
    for (const c of cambios) estadoTool.set(`${c.plan}|${c.tool}`, c.estado)
    for (const [id, precio] of Object.entries(precios)) precioTool.set(id, String(precio || '').trim().slice(0, 40))
    return json(matrizTools())
  })],
  // Como el backend sin TOOLS_URL: la tool todavía no se abre.
  ['POST', /^\/api\/tools\/([\w-]+)\/pase$/, ([, id]) =>
    TOOLS_BASE.some((t) => t.id === id) ? detalleError('Esta tool todavía no está disponible.', 409) : noHay('No existe esa tool.')],
  // La lista que ve cada uno, con lo que se guardó en Permisos → Tools (tools_service.para_cliente / para_equipo).
  ['GET', /^\/api\/tools$/, (_, opciones) => {
    const contacto = toolsDelCliente().contacto
    if (quien(opciones) !== 'cliente') {
      return json({ tools: TOOLS_BASE.map((t) => ({ nuevo: false, ...t, estado: 'incluida', precio: precioTool.get(t.id) || null, abrir: false })), contacto: null, visible: toolsVisible.valor })
    }
    if (!toolsVisible.valor) return noHay('Esta sección no está disponible.')
    const plan = CLIENTE.rol
    const tools = TOOLS_BASE.map((t) => ({ nuevo: false, ...t, estado: estadoDe(plan, t.id), precio: precioTool.get(t.id) || null, abrir: false })).filter((t) => t.estado !== 'oculta')
    return json({ tools, contacto })
  }],
]

// ---------------------------------------------------------------- Cerebro (cerebro_controller.py)
const rutasCerebro = [
  ['GET', /^\/api\/admin\/cerebro$/, soloAdmin(() => json(grafoCerebro()))],
  ['GET', /^\/api\/admin\/cerebro\/nodo$/, soloAdmin((_, __, url) => {
    const id = params(url).get('id') || ''
    if (id.length < 3) return detalleError('String should have at least 3 characters', 422)
    const nodo = nodoCerebro(id)
    return nodo ? json(nodo) : noHay('Esa neurona no existe.')
  })],
  ['POST', /^\/api\/admin\/cerebro\/aprender$/, soloAdmin(() => json({ ok: true, aprendidos: 0 }))],
]

// ---------------------------------------------------------------- Consultas al cerebro (cerebro_chat_service.py)
// POST arranca la consulta y devuelve un id; el cliente lo consulta cada 1,5 s hasta que el estado es "listo".
// Acá cada GET avanza un paso: dos veces "pensando" (con los pasos que va haciendo) y a la tercera la respuesta.
const RESPUESTAS = [
  {
    clave: /objecion|cerrar|venta/i,
    pasos: ['Buscar las objeciones registradas en las conversaciones', 'Contar cuántas veces aparece cada una', 'Traer una cita de ejemplo de cada objeción'],
    sql: 'SELECT concepto, count(*) AS veces FROM hechos WHERE tipo = \'objecion\' GROUP BY concepto ORDER BY veces DESC LIMIT 5',
    respuesta: '**Las objeciones que más aparecen antes de cerrar** (últimos 90 días):\n\n| # | Objeción | Veces |\n|---|----------|-------|\n| 1 | Precio ("no tengo ese dinero ahora") | 18 |\n| 2 | "Lo tengo que pensar" | 14 |\n| 3 | Duda de que funcione en su nicho | 9 |\n| 4 | Falta de tiempo | 6 |\n| 5 | Quiere consultarlo con su socio | 4 |\n\n> "no sé si esto va a andar en mi nicho, me da miedo gastar" (Ema Romero)\n\nLa de **precio** y el **"lo voy a pensar"** juntas son más de la mitad. Conviene reforzar la clase de *Manejo de objeciones* y el SOP de seguimiento.',
  },
  {
    clave: /funcion|avanz/i,
    pasos: ['Identificar a los clientes que más clases completaron', 'Leer lo que registró el cerebro como "le funcionó"', 'Agrupar por concepto'],
    sql: 'SELECT concepto, count(*) AS veces FROM hechos WHERE tipo = \'le_funciono\' GROUP BY concepto ORDER BY veces DESC LIMIT 5',
    respuesta: '**Lo que más les funcionó a los clientes que más avanzaron:**\n\n1. **Documentar el proceso en un SOP** (11 clientes): dicen que les ordenó el día a día.\n2. **Calificar leads antes de la llamada** (8 clientes): bajó las llamadas perdidas.\n3. **Seguimiento a los 2 días** (7 clientes): recuperaron conversaciones frías.\n\n> "con la planilla ya no se me pierde ninguno" (Alan Klein)\n\nTodos tenían algo en común: aplicaron una sola cosa por semana y se la mostraron a su coach.',
  },
  {
    clave: /7 d[ií]as|sin escribir|inactiv/i,
    pasos: ['Buscar el último mensaje de cada cliente', 'Filtrar los que llevan más de 7 días sin escribir', 'Cruzar con el plan y el responsable'],
    sql: 'SELECT c.nombre, c.plan, max(m.creado_en) AS ultimo FROM clientes c JOIN mensajes m ON m.cliente_id = c.id GROUP BY c.id HAVING max(m.creado_en) < now() - interval \'7 days\'',
    respuesta: '**Clientes con más de 7 días sin escribir:**\n\n| Cliente | Plan | Último mensaje | Responsable |\n|---------|------|----------------|-------------|\n| Cristopher Gonzalez | Boost | hace 9 días | Alejandro |\n| Har Program | Entry | hace 12 días | sin asignar |\n| Nicolás Ayala | 2K | hace 15 días | sin asignar |\n\nCristopher es el único con el plan activo y un responsable: conviene que **Alejandro** le escriba hoy.',
  },
  {
    clave: /dolor|mes/i,
    pasos: ['Leer los hechos de tipo "dolor" del último mes', 'Contar por concepto', 'Traer la cita más reciente de cada uno'],
    sql: 'SELECT concepto, count(*) AS veces FROM hechos WHERE tipo = \'dolor\' AND dicho_en > now() - interval \'30 days\' GROUP BY concepto ORDER BY veces DESC LIMIT 5',
    respuesta: '**Los dolores que más se repiten este mes:**\n\n- **Calificación de leads** (12 menciones): "me llegan muchos que no pueden pagar".\n- **Seguimiento** (9): "se me enfrían las conversaciones".\n- **Oferta** (7): "no sé cómo explicar lo que vendo".\n- **Delegar** (5): "todo depende de mí".\n\nLos primeros dos coinciden con los frentes *Me dicen que lo van a pensar* y *No se presentan a las llamadas*.',
  },
  {
    clave: /sin una clase|no tienen una clase|temas/i,
    pasos: ['Buscar los temas que más preguntan los clientes', 'Cruzar con los conceptos que tienen clase', 'Listar los que no tienen'],
    sql: 'SELECT concepto, count(*) AS veces FROM hechos WHERE tipo = \'pedido\' AND concepto NOT IN (SELECT concepto FROM clase_conceptos) GROUP BY concepto',
    respuesta: '**Temas que preguntan y no tienen una clase:**\n\n1. **Contratos con creadores** (6 pedidos)\n2. **Precios en dólares y en pesos** (5)\n3. **Cómo armar un equipo de setters desde cero** (4)\n\nSe pidieron 3 SOPs por estos temas: está bien armar la clase y linkear los SOPs.',
  },
  {
    clave: /./,
    pasos: ['Buscar en las conversaciones y los hechos aprendidos', 'Contar y agrupar lo que aparece', 'Ordenar por frecuencia'],
    sql: 'SELECT concepto, count(*) AS veces FROM hechos WHERE tipo = \'tema\' GROUP BY concepto ORDER BY veces DESC LIMIT 5',
    respuesta: '**Lo que más preguntaron los clientes** (últimos 90 días):\n\n| # | Tema | Preguntas |\n|---|------|-----------|\n| 1 | Cómo calificar leads | 23 |\n| 2 | Armar la oferta y el precio | 17 |\n| 3 | Guion de la llamada de ventas | 14 |\n| 4 | Meta Ads: creativos | 11 |\n| 5 | Automatizar el seguimiento | 8 |\n\n> "¿cómo hago para que no se me caigan las llamadas agendadas?" (Alvaro Larraz)\n\nLas primeras tres concentran más de la mitad de las consultas.',
  },
]
const consultasEnCurso = new Map()

const rutasConsultas = [
  ['POST', /^\/api\/consultas$/, (_, opciones) => {
    const datos = cuerpo(opciones)
    // El mismo POST lo usa "Pedir ayuda al coach" (api/frentes.js, con texto y slug): ahí solo se registra.
    if (datos.pregunta === undefined) return json({ id: nuevoId(), estado: 'pendiente', avisado: true, coach: 'Alejandro' })
    if (quien(opciones) === 'cliente') return prohibido('Solo el equipo puede consultar el cerebro.')
    if (String(datos.pregunta).length < 3) return detalleError('String should have at least 3 characters', 422)
    const id = Math.random().toString(36).slice(2, 14)
    consultasEnCurso.set(id, { pregunta: String(datos.pregunta), consultas: 0, quien: quien(opciones) })
    return json({ id })
  }],
  ['GET', /^\/api\/consultas\/([\w-]+)$/, ([, id], opciones) => {
    const consulta = consultasEnCurso.get(id)
    if (!consulta || consulta.quien !== quien(opciones)) return noHay('Esa consulta ya no existe.')
    const modelo = RESPUESTAS.find((r) => r.clave.test(consulta.pregunta)) || RESPUESTAS[RESPUESTAS.length - 1]
    consulta.consultas += 1
    if (consulta.consultas < 3) return json({ estado: 'pensando', pasos: modelo.pasos.slice(0, consulta.consultas) })
    return json({
      estado: 'listo',
      pasos: modelo.pasos,
      respuesta: modelo.respuesta,
      consultas: modelo.pasos.map((para_que, i) => ({ para_que, sql: i === modelo.pasos.length - 1 ? modelo.sql : `SELECT count(*) FROM mensajes WHERE autor_tipo = 'cliente' -- ${para_que}`, filas: i === modelo.pasos.length - 1 ? 5 : 1 })),
    })
  }],
]

export const rutas = [
  ...rutasContenido,
  ...rutasPermisos,
  ...rutasEquipoCliente,
  ...rutasEquipoAtv,
  ...rutasTools,
  ...rutasCerebro,
  ...rutasConsultas,
]
