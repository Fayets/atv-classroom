const DIA = 24 * 60 * 60 * 1000

function inicioDelDia(fecha) {
  const d = new Date(fecha)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function hora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** "14:05" hoy, "ayer", "lun" esta semana, "03/10" antes. */
export function cuandoCorto(iso) {
  if (!iso) return ''
  const fecha = new Date(iso)
  const dias = Math.round((inicioDelDia(Date.now()) - inicioDelDia(fecha)) / DIA)
  if (dias <= 0) return hora(iso)
  if (dias === 1) return 'ayer'
  if (dias < 7) return fecha.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')
  return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

/** Separador de día en la conversación: "Hoy", "Ayer" o "lunes 6 de octubre". */
export function etiquetaDia(iso) {
  const dias = Math.round((inicioDelDia(Date.now()) - inicioDelDia(iso)) / DIA)
  if (dias <= 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  return new Date(iso).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function mismoDia(a, b) {
  return inicioDelDia(a) === inicioDelDia(b)
}

/** "hace 25 min", "hace 3 h", "hace 2 días". */
export function haceCuanto(iso) {
  if (!iso) return ''
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.round(horas / 24)
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`
}

export function iniciales(nombre) {
  const partes = (nombre || '?').trim().split(/\s+/)
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?'
}

// Quién escribió: el equipo del cliente (setter, socio) entra con la clave del titular, así que cada uno se
// distingue por su id de miembro y no por la cuenta.
export function claveAutor(autor) {
  return autor.miembro?.id ? `miembro:${autor.miembro.id}` : `${autor.tipo}:${autor.id}`
}

// Para agrupar mensajes seguidos: además, en el historial de Discord una misma cuenta tiene varios nombres.
export function claveGrupo(autor) {
  return autor.tipo === 'cliente' && !autor.miembro?.id ? `${claveAutor(autor)}:${autor.nombre || ''}` : claveAutor(autor)
}

/** 25 → "25 min"; 130 → "2 h 10 min"; 3000 → "2 d 2 h". */
export function duracion(minutos) {
  if (minutos == null) return '—'
  if (minutos < 1) return 'menos de 1 min'
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  if (h < 24) return minutos % 60 ? `${h} h ${minutos % 60} min` : `${h} h`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`
}

/** Urgencia de una alerta sin responder: verde hasta 30 min, ámbar hasta 2 h, roja después. */
export function urgencia(minutos) {
  if (minutos < 30) return 'ok'
  if (minutos < 120) return 'aviso'
  return 'urgente'
}

export function normal(texto) {
  return (texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function primerNombre(nombre) {
  return (nombre || '').trim().split(/\s+/)[0] || ''
}

export function peso(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

export const ACEPTA_ADJUNTOS =
  '.jpg,.jpeg,.png,.gif,.webp,.heic,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.mp3,.m4a,.ogg,.wav,.webm,.mp4,.mov,.zip'

// Roles de un canal grupal (mismos ids que el backend: roles_canal.py).
export const ROLES_CANAL = [
  { id: 'equipo', nombre: 'Equipo ATV' },
  { id: 'high', nombre: 'High Level' },
  { id: 'boost', nombre: 'Boost' },
  { id: 'mid', nombre: 'Mid level' },
  { id: 'entry', nombre: 'Entry level' },
  { id: 'mentoria', nombre: 'Mentoria' },
]
export const nombreRol = (id) => ROLES_CANAL.find((r) => r.id === id)?.nombre || id

// Nombre de canal como en Discord: minúsculas, guiones, sin símbolos.
// Igual que el servidor y que Discord hoy: minúsculas y guiones en vez de espacios, con emojis, tildes y
// separadores ("🏠┊general"); solo se sacan los caracteres de control y # @ < > / \ ` (rompen menciones y links).
export function slugCanal(nombre) {
  const limpio = (nombre || '')
    .trim()
    .toLowerCase()
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[#@<>/\\`]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  return Array.from(limpio).slice(0, 60).join('')
}

export const ES_EVERYONE = /@(everyone|todos)\b/i
