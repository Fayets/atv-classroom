export function flattenClases(secciones) {
  const items = []
  let numero = 0

  for (const seccion of secciones ?? []) {
    for (const clase of seccion.clases ?? []) {
      numero += 1
      items.push({
        ...clase,
        numero,
        seccionTitulo: seccion.titulo,
        seccionId: seccion.id,
      })
    }
  }

  return items
}

export function formatNumeroClase(numero) {
  return String(numero).padStart(2, '0')
}

export function navegacionClase(clases, claseActivaId) {
  const index = clases.findIndex((clase) => clase.id === claseActivaId)
  if (index === -1) {
    return {
      index: -1,
      anterior: null,
      siguiente: null,
      actual: null,
      total: clases.length,
    }
  }

  return {
    index,
    anterior: index > 0 ? clases[index - 1] : null,
    siguiente: index < clases.length - 1 ? clases[index + 1] : null,
    actual: clases[index],
    total: clases.length,
  }
}
