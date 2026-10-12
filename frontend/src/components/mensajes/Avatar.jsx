import { iniciales } from '../../utils/mensajes'

export default function Avatar({ persona, size = 36 }) {
  const estilo = { width: size, height: size, fontSize: size > 30 ? 12 : 9 }
  if (persona?.foto_url) {
    return <img className="msj-av" src={persona.foto_url} alt="" style={estilo} referrerPolicy="no-referrer" />
  }
  const equipo = persona?.tipo === 'equipo'
  return (
    <span className={`msj-av msj-av--ini${equipo ? ' is-equipo' : ''}`} style={estilo} aria-hidden="true">
      {iniciales(persona?.nombre)}
    </span>
  )
}
