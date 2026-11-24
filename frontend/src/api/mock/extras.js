// Datos de prueba de Tools y Roadmap, con las formas del backend:
//   - Tools: backend/src/services/tools_service.py (TOOLS y para_cliente)
//   - Roadmap: backend/src/services/roadmap_service.py (_armar y marcar_paso)
// Los textos de los pasos siguen los ejemplos de backend/tests/test_roadmap.py.

// ---------------------------------------------------------------- Tools
// Mismo orden, nombres y descripciones que TOOLS del backend. El estado por plan lo eligió el mock:
// sin nada guardado en Permisos, el backend las ofrece todas como "paga" (con candado).
// "abrir" va en false: en el backend depende de TOOLS_URL y TOOLS_ACTIVAS, y sin eso dicen "Muy pronto".
const TOOLS = [
  { id: 'juan-ai', nombre: 'Juan AI', tono: 'roja', duracion: 'Chat', descripcion: 'Preguntale lo que sea de tu negocio. Responde como Juan y te lleva a la clase o al SOP.', estado: 'incluida' },
  { id: 'bottleneck', nombre: 'Bottleneck analysis', tono: 'negra', duracion: '5–10 min', nuevo: true, descripcion: 'Mandá un Loom con tu traba y recibí diagnóstico, causas y un roadmap con plazos.', estado: 'incluida' },
  { id: 'audiencia', nombre: 'Analizador de audiencia', tono: 'crema', duracion: '3 min', descripcion: 'Lee tus comentarios y DMs y te dice qué dolor repite tu audiencia.', estado: 'paga', precio: 'USD 47' },
  { id: 'competencia', nombre: 'Analizador de competencia', tono: 'blanca', duracion: '5 min', descripcion: 'Pasale tres cuentas y te arma qué venden, a qué precio y con qué ángulo.', estado: 'paga', precio: 'USD 47' },
  { id: 'crm', nombre: 'CRM', tono: 'crema', duracion: 'Leads y llamadas', descripcion: 'Tus leads en un solo lugar: de qué conversación vienen, en qué etapa están y cuándo hacerles seguimiento.', estado: 'paga', precio: 'USD 97' },
]

export function toolsDelCliente() {
  return {
    tools: TOOLS.map((t) => ({ nuevo: false, precio: null, ...t, abrir: false })),
    contacto: { nombre: 'Juampi', whatsapp: '+54 9 11 0000-0000', link: 'https://wa.me/5491100000000' },
  }
}

export function toolsDelEquipo() {
  return { tools: TOOLS.map((t) => ({ nuevo: false, precio: null, ...t, estado: 'incluida', abrir: false })), contacto: null, visible: true }
}

// ---------------------------------------------------------------- Roadmap
// El roadmap de Alan Klein: dos coaches, un roadmap inicial con dos versiones (la primera reemplazada)
// y una revisión mensual, que es el documento a seguir ahora.
const paso = (id, texto, quien, hecho = false) => ({
  id,
  texto,
  quien,
  hecho,
  hecho_en: hecho ? '2026-11-18T14:00:00Z' : null,
  hecho_por: hecho ? (quien === 'atv' ? { tipo: 'equipo', id: 5, nombre: 'Alejandro' } : { tipo: 'cliente', id: 141, nombre: 'Alan Klein' }) : null,
})

const DOCS = [
  {
    id: 801,
    coach: { id: 5, nombre: 'Alejandro', foto_url: null },
    area: 'Ventas',
    titulo: 'Ventas',
    tipo: 'inicial',
    fecha: '2026-09-02',
    fathom_url: 'https://fathom.video/share/ejemplo-1',
    url: null,
    principal: false,
    pasos: [
      paso(1, 'Grabá 3 historias por día con el CTA PLAN', 'cliente', true),
      paso(2, 'Leé un libro de marketing', 'cliente', true),
      paso(3, 'Reunión con Nick', 'atv', true),
    ],
  },
  {
    id: 802,
    coach: { id: 5, nombre: 'Alejandro', foto_url: null },
    area: 'Ventas',
    titulo: 'Ventas',
    tipo: 'inicial',
    fecha: '2026-10-07',
    fathom_url: 'https://fathom.video/share/ejemplo-2',
    url: null,
    principal: false,
    pasos: [
      paso(1, 'Grabá 3 historias por día con el CTA PLAN y medí respuestas', 'cliente', true),
      paso(2, 'Pasá las conversaciones a llamada', 'cliente', true),
      paso(3, 'Armá el Typeform', 'cliente'),
      paso(4, 'Te hago seguimiento cada dos días', 'atv', true),
    ],
  },
  {
    id: 803,
    coach: { id: 7, nombre: 'Lucho Vicente', foto_url: null },
    area: 'Sistemas',
    titulo: 'Sistemas',
    tipo: 'revision',
    fecha: '2026-11-12',
    fathom_url: 'https://fathom.video/share/ejemplo-3',
    url: null,
    principal: true,
    pasos: [
      paso(1, 'Cambiá el CTA del perfil', 'cliente', true),
      paso(2, 'Mandame el Typeform', 'cliente'),
      paso(3, 'Documentá el onboarding en tu SOP', 'cliente'),
      paso(4, 'Te armo la automatización del CRM', 'atv'),
      paso(5, 'Revisamos los números en la llamada del mes', 'atv'),
    ],
  },
]

const TIPOS = { inicial: 'Roadmap inicial', revision: 'Revisión mensual', complementario: 'Complementario' }

// Arma el tablero igual que roadmap_service._armar: versiones por hilo (coach + título), el último de
// cada hilo vigente, avance contado de los pasos tildados y el principal como documento a seguir.
export function roadmapDe(cliente) {
  const cuenta = {}
  const numero = {}
  const ultimo = {}
  for (const d of DOCS) {
    const hilo = `${d.coach.id}|${d.titulo.toLowerCase()}`
    cuenta[hilo] = (cuenta[hilo] || 0) + 1
    numero[d.id] = cuenta[hilo]
    ultimo[hilo] = d.id
  }
  const docDict = (d) => {
    const hilo = `${d.coach.id}|${d.titulo.toLowerCase()}`
    return {
      id: d.id,
      titulo: d.titulo,
      version: numero[d.id],
      versiones: cuenta[hilo],
      tipo: d.tipo,
      tipo_nombre: TIPOS[d.tipo],
      url: d.url,
      fathom_url: d.fathom_url,
      fecha: d.fecha,
      estado: ultimo[hilo] === d.id ? 'vigente' : 'reemplazado',
      pasos: d.pasos,
      pasos_total: d.pasos.length,
      paso_actual: d.pasos.filter((p) => p.hecho).length,
      principal: d.principal,
      coach_id: d.coach.id,
      area: d.area,
    }
  }
  const grupos = []
  for (const d of DOCS) {
    let g = grupos.find((x) => x.coach.id === d.coach.id)
    if (!g) {
      g = { coach: d.coach, area: null, docs: [] }
      grupos.push(g)
    }
    g.docs.push(docDict(d))
    if (d.area) g.area = d.area
  }
  const todos = grupos.flatMap((g) => g.docs)
  const vigentes = todos.filter((x) => x.estado === 'vigente')
  const principal =
    [...todos].reverse().find((x) => x.principal && x.estado === 'vigente') ||
    [...vigentes].sort((a, b) => (a.fecha + a.id < b.fecha + b.id ? 1 : -1))[0] ||
    null
  return { cliente, grupos, principal, total: todos.length, vigentes: vigentes.length }
}

export function marcarPasoRoadmap(docId, pasoId, hecho, quien) {
  const doc = DOCS.find((d) => d.id === docId)
  const p = doc?.pasos.find((x) => x.id === pasoId)
  if (!p) return false
  p.hecho = Boolean(hecho)
  p.hecho_en = hecho ? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') : null
  p.hecho_por = hecho ? quien : null
  return true
}
