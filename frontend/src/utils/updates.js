// Los renglones de los updates de #updates: "⚠️ ⏳ 1d 9h scalify Entregable: X" bajo cada "@Persona".
// Lo de adelante (íconos, "--", el contador) son las marcas; el resto (cliente + tarea) es la clave del tilde.
const MARCAS = /^(?:\s*(?:[^\p{L}\p{N}\s#@]+|\d+\s*[dhm](?![\p{L}\p{N}])))+\s*/u

export const nucleo = (renglon) => renglon.trim().replace(MARCAS, '').replace(/^#/, '').trim()

// Un renglón tildado: lo que va adelante se cambia por el visto.
export const comoHecho = (renglon) => `✅ ${nucleo(renglon)}`

// Párrafo de update: la cabeza "@Persona" y sus renglones.
function bloques(texto) {
  return texto.split(/\n{2,}/).map((par) => {
    const [cabeza, ...renglones] = par.split('\n')
    return cabeza.trimStart().startsWith('@') && renglones.length ? { cabeza, renglones } : { par }
  })
}

// Lo que se ve: en cada bloque, primero lo pendiente y al final lo tildado (con ✅).
export function ordenar(renglones, hechos) {
  const items = renglones.map((r) => ({ r, clave: nucleo(r), hecho: hechos.has(nucleo(r)) })).filter((x) => x.clave)
  return [...items.filter((x) => !x.hecho), ...items.filter((x) => x.hecho)]
}

// Al editar, la caja arranca con el update como se ve (lo tildado al final y con ✅).
export function textoParaEditar(texto, tildes = []) {
  const hechos = new Set(tildes.map(nucleo))
  if (!hechos.size) return texto
  return bloques(texto)
    .map((b) => (b.par !== undefined ? b.par : [b.cabeza, ...ordenar(b.renglones, hechos).map((x) => (x.hecho ? comoHecho(x.r) : x.r))].join('\n')))
    .join('\n\n')
}

// Al guardar, lo tildado vuelve a su ícono y a su lugar de antes (así, si se destilda, aparece donde estaba).
// Si Mauri le cambió algo a un renglón tildado, queda como lo escribió.
export function textoAlGuardar(editado, original, tildes = []) {
  const hechos = new Set(tildes.map(nucleo))
  if (!hechos.size) return editado
  const originales = new Map()
  bloques(original).forEach((b) => b.renglones?.forEach((r, i) => originales.set(nucleo(r), { r, i })))
  return bloques(editado)
    .map((b) => {
      if (b.par !== undefined) return b.par
      const tildados = []
      const resto = []
      b.renglones.forEach((r) => {
        const o = originales.get(nucleo(r))
        if (hechos.has(nucleo(r)) && o && r.trim().startsWith('✅')) tildados.push(o)
        else resto.push(r)
      })
      tildados.sort((a, z) => a.i - z.i)
      const salida = []
      resto.forEach((r) => {
        const i = originales.get(nucleo(r))?.i
        while (tildados.length && i !== undefined && tildados[0].i < i) salida.push(tildados.shift().r)
        salida.push(r)
      })
      return [b.cabeza, ...salida, ...tildados.map((o) => o.r)].join('\n')
    })
    .join('\n\n')
}
