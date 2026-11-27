// Datos de prueba de la vista Classroom (ui/app/09): el escritorio del equipo de ATV sobre los chats del classroom.
// Consultas pendientes, buscar clientes, el chat de un cliente, Juan IA armando la respuesta y el piloto. Todo inventado.
const hace = (min) => new Date(Date.now() - min * 60_000).toISOString()

const CLIENTES = [
  { cliente_id: 101, nombre: 'Natalia Ferreyra', grupo: 'Boost', coach: 'Lucho', plan: 'Boost', vence: '19/02/2027' },
  { cliente_id: 102, nombre: 'Lucas Benítez', grupo: 'High Level', coach: 'Juampi', plan: 'High Level', vence: '03/04/2027' },
  { cliente_id: 103, nombre: 'Camila Ruiz', grupo: 'Mid level', coach: 'Lucas', plan: 'Mid level', vence: '11/01/2027' },
  { cliente_id: 104, nombre: 'Diego Romero', grupo: 'Boost', coach: 'Lucho', plan: 'Boost', vence: '28/12/2026' },
  { cliente_id: 105, nombre: 'Juli Gómez', grupo: '2K', coach: 'Juan Cruz', plan: '2K', vence: '15/03/2027' },
]

export const clientes = (q = '') => ({ clientes: CLIENTES.filter((c) => c.nombre.toLowerCase().includes(q.toLowerCase())) })

// Lo que hizo cada uno con una consulta: tomada, Juan armando, lista. Vive en memoria mientras corre el mock.
const marcas = { 'q-2': { quien: 'Lucho', estado: 'tomada' } }
const borradores = {}

export const consultas = () => ({
  yo: 'Franco', en_la_nube: true,
  consultas: [
    { clave: 'q-1', cliente: 'Natalia Ferreyra', cliente_id: 101, espera_horas: 14, tipo: 'Duda', que: '¿Cómo armo la secuencia de historias del lanzamiento?', origen: 'piloto', marca: marcas['q-1'] },
    { clave: 'q-2', cliente: 'Lucas Benítez', cliente_id: 102, espera_horas: 6, tipo: 'Revisión', que: 'Me revisás la landing? Te dejo el Loom', origen: 'update', para: 'Juampi', marca: marcas['q-2'] },
    { clave: 'q-3', cliente: 'Camila Ruiz', cliente_id: 103, espera_horas: 3, tipo: 'Bloqueo', que: 'No me llegan leads del anuncio desde el martes', origen: 'update', para: 'Lucas', marca: marcas['q-3'] },
    { clave: 'q-4', cliente: 'Diego Romero', cliente_id: 104, espera_horas: 1, tipo: 'Duda', que: '¿Qué precio le pongo al programa grupal?', origen: 'piloto', marca: marcas['q-4'] },
  ],
})

export function marcar(accion, cuerpo) {
  if (accion === 'tomar') marcas[cuerpo.clave] = { quien: 'Franco', estado: 'tomada' }
  else if (accion === 'marcar') marcas[cuerpo.clave] = { quien: 'Franco', estado: cuerpo.estado }
  else if (accion === 'soltar') delete marcas[cuerpo.clave]
  return { ok: true }
}

const CHATS = {
  101: [
    { de: 'cliente', texto: 'Hola! Ya grabé los 3 reels del calentamiento 🙌', cuando: hace(1500) },
    { de: 'Lucho', texto: '¡Buenísimo Nati! Mandámelos cuando estén editados y los vemos.', cuando: hace(1440) },
    { de: 'cliente', texto: 'Una consulta: ¿cómo armo la secuencia de historias del lanzamiento? No sé si mostrar el precio ahí o mandar a la landing.', cuando: hace(840), adjuntos: [{ nombre: 'borrador-secuencia.pdf', url: 'https://example.com/borrador.pdf' }], looms: ['https://www.loom.com/share/ejemplo'] },
  ],
  102: [
    { de: 'cliente', texto: 'Me revisás la landing? Te dejo el Loom explicando lo que cambié', cuando: hace(360), looms: ['https://www.loom.com/share/ejemplo-2'] },
  ],
  103: [
    { de: 'cliente', texto: 'No me llegan leads del anuncio desde el martes. El presupuesto sigue gastándose.', cuando: hace(180) },
    { de: 'cliente', texto: 'Te paso captura del administrador', cuando: hace(176), adjuntos: [{ nombre: 'captura-ads.png', url: 'https://example.com/captura.png' }] },
  ],
}

export function chat(id) {
  const c = CLIENTES.find((x) => x.cliente_id === Number(id)) ?? CLIENTES[0]
  const b = borradores[c.cliente_id]
  return {
    chat: { cliente: { nombre: c.nombre, plan: c.plan, vence: c.vence }, canal_id: 500 + c.cliente_id, mensajes: CHATS[c.cliente_id] ?? [{ de: 'cliente', texto: 'Hola, tengo una consulta sobre el módulo de ventas.', cuando: hace(90) }] },
    estado: b?.estado ?? null, borrador: b?.estado === 'listo' ? b.borrador : null, quien: 'Franco',
  }
}

export function armar(cuerpo) {
  const id = Number(cuerpo.cliente_id)
  borradores[id] = { estado: 'armando' }
  setTimeout(() => {
    borradores[id] = {
      estado: 'listo',
      borrador: {
        texto: '¡Hola Nati! Vi tu borrador y el Loom, está muy bien encaminado 💪\n\nEn la secuencia NO pongas el precio: la historia tiene que llevar a la conversación, no a la decisión. Hacelo así:\n\n1. Historia 1: el problema (tu alumna antes).\n2. Historia 2 y 3: el caso, con números.\n3. Última: "Si te pasa lo mismo, escribime PROGRAMA".\n\nEl precio lo das en la llamada. Mandame la versión nueva y la vemos.',
        explicacion: 'Le decís que no muestre el precio en las historias, que use el caso como prueba y que cierre pidiendo que escriban una palabra. El precio va en la llamada.',
      },
    }
  }, 3000)
  return { ok: true }
}

export function responder(id) {
  delete borradores[Number(id)]
  return { ok: true }
}

const PILOTO = {
  conectado: true, url: 'https://classroom.atvos.io',
  hoy: { automatico: 23, enviado: 9, editado: 4 },
  modos: [
    { admin_id: 1, nombre: 'Lucho', modo: 'automatico' },
    { admin_id: 2, nombre: 'Juampi', modo: 'borrador' },
    { admin_id: 3, nombre: 'Lucas', modo: 'borrador' },
    { admin_id: 4, nombre: 'Juan Cruz', modo: 'apagado' },
  ],
  para_vos: [
    { canal_id: 601, cliente: 'Natalia Ferreyra', motivo: 'Pregunta de estrategia: el piloto no se anima solo', creado_en: hace(840) },
    { canal_id: 603, cliente: 'Camila Ruiz', motivo: 'Problema técnico con anuncios', creado_en: hace(180) },
  ],
  llamadasJuan: 34,
}
export const piloto = () => PILOTO
