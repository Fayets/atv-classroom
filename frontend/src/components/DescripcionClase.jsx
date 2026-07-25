function renderInline(text) {
  const parts = text.split(/(\*\*.+?\*\*)/g)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

export default function DescripcionClase({ texto }) {
  if (!texto?.trim()) return null

  const bloques = texto.trim().split(/\n\n+/)

  return (
    <div className="clase-viewer__descripcion">
      {bloques.map((bloque, index) => {
        const contenido = bloque.trim()
        if (!contenido) return null

        if (contenido === '---' || contenido === '***' || contenido === '⸻') {
          return <hr key={index} className="clase-viewer__desc-hr" />
        }

        const esLead =
          contenido.startsWith('**') &&
          contenido.endsWith('**') &&
          !contenido.slice(2, -2).includes('**')

        return (
          <p
            key={index}
            className={
              esLead
                ? 'clase-viewer__desc-p clase-viewer__desc-p--lead'
                : 'clase-viewer__desc-p'
            }
          >
            {esLead
              ? renderInline(contenido)
              : renderInline(contenido.replace(/\n/g, ' '))}
          </p>
        )
      })}
    </div>
  )
}
