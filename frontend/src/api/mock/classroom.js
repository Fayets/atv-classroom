// Datos de prueba del Classroom: módulos, secciones, clases y SOPs.
// Mismas formas que backend/src/schemas.py (ProgramaListItem, ProgramaDetalleResponse,
// ClaseDetalleResponse) y que acciones_service.clases. Los títulos son de ejemplo.
// El progreso vive en memoria: marcar una clase como implementada dura hasta recargar.

const COACHES = [
  { clave: 'juan-cruz', nombre: 'Juan Cruz', area: 'Misión, visión y marketing' },
  { clave: 'juampi', nombre: 'Juampi', area: 'Ventas y setters' },
  { clave: 'lucas', nombre: 'Lucas', area: 'Sistemas y automatizaciones' },
]

// [slug, título, secciones: [título, [clases]], bloqueo]
const MODULOS = [
  ['start-here', 'Start Here', [
    ['Bienvenida', ['Cómo usar el classroom', 'Tu primera semana en ATV', 'Cómo pedir ayuda a tu coach', 'Tu roadmap personal']],
  ]],
  ['advantage', 'Advantage', [
    ['Fundamentos', ['Qué es Advantage', 'El método en 5 pasos', 'Elegir tu nicho', 'Tu avatar ideal']],
    ['Oferta', ['Armar la oferta irresistible', 'Precio y garantía', 'Bonos que suman valor', 'Validar antes de escalar']],
  ]],
  ['business-foundations', 'Business Foundations', [
    ['Estructura', ['Misión y visión', 'Tu modelo de negocio', 'Números que importan', 'Metas trimestrales', 'Rutina semanal del dueño', 'Delegar sin perder control', 'Tablero de métricas']],
  ]],
  ['marketing', 'Marketing', [
    ['Contenido', ['Pilares de contenido', 'Ganchos que retienen', 'Guiones para reels', 'Calendario editorial']],
    ['Distribución', ['Instagram orgánico', 'YouTube para infoproductos', 'Email que vende', 'Comunidad propia', 'Medir lo que funciona']],
  ]],
  ['sales', 'Sales', [
    ['Proceso', ['El embudo de ventas', 'Calificar leads', 'Agenda de llamadas', 'Seguimiento sin presionar']],
    ['Llamada', ['Apertura de la llamada', 'Diagnóstico profundo', 'Presentar la oferta', 'Manejo de objeciones', 'Cierre y próximos pasos']],
    ['Equipo', ['Contratar setters', 'Guion de setter', 'Métricas del equipo comercial']],
  ]],
  ['product', 'Product', [
    ['Producto', ['Diseñar el programa', 'Módulos y clases', 'Experiencia del alumno', 'Onboarding de clientes', 'Resultados medibles', 'Testimonios que venden', 'Iterar con feedback', 'Escalar la entrega']],
  ]],
  ['ads', 'Ads', [
    ['Meta Ads', ['Estructura de campañas', 'Creativos que convierten', 'Públicos y segmentación', 'Leer las métricas', 'Escalar sin romper', 'Retargeting', 'Presupuesto inteligente', 'Errores comunes', 'Checklist de lanzamiento']],
  ]],
  ['creator-acquisition', 'Creator Acquisition', [
    ['Alianzas', ['Encontrar creadores', 'Primer contacto', 'Propuesta de valor', 'Negociar acuerdos', 'Contratos simples', 'Seguimiento de alianzas']],
  ]],
  ['systems', 'Systems', [
    ['Operación', ['Mapa de procesos', 'Documentar en SOPs', 'Herramientas base', 'Automatizar el onboarding', 'CRM sin dolor', 'Reportes automáticos']],
  ]],
  ['case-of-study', 'Case of Study', [
    ['Casos', ['De 0 a 10K en 90 días', 'Lanzamiento con lista chica', 'Escalar con setters', 'Nicho de fitness', 'Nicho de finanzas', 'Agencia a infoproducto']],
  ]],
  ['marketing-100k', 'Marketing 100k', [
    ['Escalar', ['El sistema de 100K', 'Contenido a escala', 'Equipo de marketing', 'Funnels avanzados', 'Lanzamientos recurrentes']],
  ]],
  ['guia-50k', 'Guía 50k', [
    ['Ruta', ['Diagnóstico inicial', 'Plan de 12 semanas', 'Oferta de alto ticket', 'Adquisición diaria', 'Cierre de ventas', 'Retención de clientes']],
  ]],
  ['launch', 'Launch', [['Lanzamiento', ['Pre-lanzamiento', 'Semana de lanzamiento', 'Carrito abierto', 'Post-lanzamiento']]], 'pronto'],
  ['live-sessions-mentoria', 'Live Sessions Mentoria', [], 'pronto'],
  ['live-sessions-boost', 'Live Sessions Boost', [], 'pronto'],
]

// Algunas clases ya hechas, para que se vea el progreso.
const HECHAS = { 'start-here': 4, advantage: 5, marketing: 4, sales: 2, systems: 1 }

let idClase = 500
let idSeccion = 80
const programas = MODULOS.map(([slug, titulo, secciones, bloqueo], i) => {
  let hechas = HECHAS[slug] || 0
  return {
    id: i + 1,
    slug,
    titulo,
    orden: i + 1,
    descripcion: null,
    cover_url: `/modules/${slug}.jpg`,
    bloqueo: bloqueo || null,
    secciones: secciones.map(([tituloSeccion, clases], si) => ({
      id: (idSeccion += 1),
      titulo: tituloSeccion,
      orden: si + 1,
      clases: clases.map((tituloClase, ci) => {
        const completado = hechas > 0
        hechas -= 1
        return {
          id: (idClase += 1),
          titulo: tituloClase,
          orden: ci + 1,
          video_url: null,
          video_proximamente: true,
          video_bloqueado_para: [],
          duracion_segundos: 600 + ((idClase * 97) % 1500),
          completado,
        }
      }),
    })),
  }
})

const clasesDe = (p) => p.secciones.flatMap((s) => s.clases)
const progreso = (p) => {
  const clases = clasesDe(p)
  return clases.length ? Math.round((100 * clases.filter((c) => c.completado).length) / clases.length) : 0
}

export function listaProgramas() {
  return programas.map((p) => ({
    id: p.id,
    titulo: p.titulo,
    slug: p.slug,
    descripcion: p.descripcion,
    cover_url: p.cover_url,
    porcentaje_progreso: progreso(p),
    total_clases: clasesDe(p).length,
    bloqueado: Boolean(p.bloqueo),
    motivo_bloqueo: p.bloqueo,
  }))
}

export function detallePrograma(id) {
  const p = programas.find((x) => x.id === id)
  if (!p) return null
  const { bloqueo: _bloqueo, ...resto } = p
  return { ...resto, porcentaje_progreso: progreso(p) }
}

function ubicar(claseId) {
  for (const p of programas) {
    for (const s of p.secciones) {
      const c = s.clases.find((x) => x.id === claseId)
      if (c) return { p, s, c }
    }
  }
  return null
}

export function detalleClase(id) {
  const lugar = ubicar(id)
  if (!lugar) return null
  const { p, s, c } = lugar
  const coach = COACHES[p.id % COACHES.length]
  return {
    ...c,
    modulo: p.titulo,
    portada: p.cover_url,
    descripcion: null,
    recursos: [
      { id: c.id * 10 + 1, titulo: `SOP · ${c.titulo}`, url: 'https://docs.google.com/document/d/ejemplo', orden: 1, tipo: 'link' },
      { id: c.id * 10 + 2, titulo: 'Planilla de trabajo', url: 'https://docs.google.com/spreadsheets/d/ejemplo', orden: 2, tipo: 'link' },
    ],
    seccion_id: s.id,
    programa_id: p.id,
    completado_en: c.completado ? new Date().toISOString() : null,
    nota: null,
    resumen: `En esta clase de ${p.titulo} ves ${c.titulo.toLowerCase()}: qué es, por qué importa en tu negocio y cómo aplicarlo esta semana.`,
    claves: ['Mirá la clase completa antes de implementar', `Aplicá ${c.titulo.toLowerCase()} con un caso real tuyo`, 'Documentalo en tu SOP', 'Mostrale el resultado a tu coach'],
    coach: { clave: coach.clave, nombre: coach.nombre, area: coach.area },
  }
}

export function marcarProgreso(id, completado) {
  const lugar = ubicar(id)
  if (!lugar) return null
  lugar.c.completado = Boolean(completado)
  return { clase_id: id, completado: lugar.c.completado, completado_en: completado ? new Date().toISOString() : null }
}

// Para "Enviar clase" en las acciones rápidas del chat.
export function clasesParaEnviar() {
  return programas.flatMap((p) =>
    clasesDe(p).map((c) => ({
      id: c.id,
      titulo: c.titulo,
      modulo: p.titulo,
      portada: p.cover_url,
      orden: p.orden,
      url: `${window.location.origin}/classroom/${p.id}?clase=${c.id}`,
      fuente: 'classroom',
      bloqueada: Boolean(p.bloqueo),
    })),
  )
}

const DOCUMENTOS = [
  ['Documento', 'https://docs.google.com/document/d/ejemplo'],
  ['Planilla de trabajo', 'https://docs.google.com/spreadsheets/d/ejemplo'],
  ['Tablero del proceso', 'https://miro.com/app/board/ejemplo'],
]

// La vista SOPs: un estante por módulo con los SOPs de sus clases.
export function sopsClassroom() {
  return programas
    .filter((p) => !p.bloqueo && clasesDe(p).length)
    .slice(0, 6)
    .map((p) => ({
      programa_id: p.id,
      modulo: p.titulo,
      sops: p.secciones.flatMap((s) =>
        s.clases.slice(0, 4).map((c, i) => ({
          clase_id: c.id,
          titulo: c.titulo,
          seccion: s.titulo,
          // Algunos con video y con 1, 2 o 3 documentos de distinto tipo (así se ven las pilas).
          con_video: c.id % 3 !== 0,
          documentos: DOCUMENTOS.slice(0, 1 + ((c.id + i) % 3)).map(([tipo, url], j) => ({
            id: c.id * 10 + j + 1,
            titulo: j === 0 ? `SOP · ${c.titulo}` : tipo,
            url,
          })),
        })),
      ),
    }))
}
