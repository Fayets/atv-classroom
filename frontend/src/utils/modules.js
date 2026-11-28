export function getModuloCoverUrl(modulo) {
  if (modulo?.cover_url) return modulo.cover_url
  if (modulo?.slug) return `/modules/${modulo.slug}.jpg`
  return null
}

// One line about what each module is, shown on its card when the module has no description of its own
// (the admin's description always wins). Provisional copy: ATV should review it.
const MODULE_SUMMARIES = {
  'start-here': 'Cómo usar el programa y dar tus primeros pasos.',
  advantage: 'El método ATV: nicho, avatar y oferta.',
  'business-foundations': 'La estructura y los números de tu negocio.',
  marketing: 'Contenido que atrae y cómo distribuirlo.',
  sales: 'Embudo, llamadas y cierre de ventas.',
  product: 'Diseñar y entregar un programa que dé resultados.',
  ads: 'Campañas de Meta Ads de cero a escala.',
  'creator-acquisition': 'Conseguir y cerrar alianzas con creadores.',
  systems: 'Procesos, SOPs y automatizaciones.',
  'case-of-study': 'Casos reales explicados paso a paso.',
  'marketing-100k': 'El sistema de marketing para escalar a 100K.',
  'guia-50k': 'La ruta de 12 semanas para llegar a 50K.',
  launch: 'Cómo preparar y ejecutar un lanzamiento.',
}

export function getModuloResumen(modulo) {
  if (modulo?.descripcion) return modulo.descripcion
  if (MODULE_SUMMARIES[modulo?.slug]) return MODULE_SUMMARIES[modulo.slug]
  if (modulo?.slug?.startsWith('live-sessions')) return 'Las grabaciones de las sesiones en vivo.'
  return null
}
