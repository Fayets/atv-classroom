// Team members ordered for a channel: whoever wrote most recently first, then the coaches, then the rest.
export function ordenarEquipo(equipo = [], recientes = []) {
  const clave = (n) => (n || '').trim().toLowerCase()
  const peso = new Map(recientes.map((n, i) => [clave(n), i]))
  const de = (p) => (peso.has(clave(p.nombre)) ? peso.get(clave(p.nombre)) : 100 + (p.rol === 'coach' ? 0 : 1))
  return [...equipo].sort((a, b) => de(a) - de(b))
}
