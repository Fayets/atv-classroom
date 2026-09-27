// Formato mínimo para textos cargados desde el admin: **negrita**, *cursiva*,
// párrafos separados por línea en blanco y saltos de línea. Sin HTML crudo.
function enLinea(texto, base) {
  const partes = texto.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g)
  return partes.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={`${base}-${i}`}>{p.slice(2, -2)}</strong>
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={`${base}-${i}`}>{p.slice(1, -1)}</em>
    return p
  })
}

export default function TextoFormateado({ texto, className = '' }) {
  if (!texto?.trim()) return null
  const parrafos = texto.trim().split(/\n\s*\n/)
  return (
    <div className={className}>
      {parrafos.map((par, i) => {
        const lineas = par.split('\n')
        return (
          <p key={i}>
            {lineas.map((l, j) => (
              <span key={j}>
                {j ? <br /> : null}
                {enLinea(l, `${i}-${j}`)}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}
