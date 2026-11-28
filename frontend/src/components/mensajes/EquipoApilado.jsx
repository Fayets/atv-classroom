import Avatar from './Avatar'

// Overlapping faces of the ATV team: shows the client there are people behind their channel.
export default function EquipoApilado({ personas = [], size = 22, max = 3 }) {
  const lista = personas.slice(0, max)
  if (!lista.length) return null
  return (
    <span className="msj-apilado" style={{ '--ap': `${size}px` }} aria-hidden="true">
      {lista.map((p, i) => (
        <span key={p.id ?? p.nombre} className="msj-apilado__uno" style={{ zIndex: lista.length - i }}>
          <Avatar persona={{ tipo: 'equipo', nombre: p.nombre, foto_url: p.foto_url }} size={size} />
        </span>
      ))}
    </span>
  )
}
