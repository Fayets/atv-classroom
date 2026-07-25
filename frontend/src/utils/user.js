export function getUserInitials(nombre) {
  if (!nombre?.trim()) return '?'
  return nombre
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
