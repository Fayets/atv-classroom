export function getModuloCoverUrl(modulo) {
  if (modulo?.cover_url) return modulo.cover_url
  if (modulo?.slug) return `/modules/${modulo.slug}.png`
  return null
}
