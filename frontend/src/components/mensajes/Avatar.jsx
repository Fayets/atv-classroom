import { useEffect, useState } from 'react'
import { colorPersona, iniciales } from '../../utils/mensajes'

export default function Avatar({ persona, size = 36 }) {
  const estilo = { width: size, height: size, fontSize: size > 30 ? 12 : 9 }
  // Una foto que no carga (un link de Google vencido) deja las iniciales, no la imagen rota.
  const [rota, setRota] = useState(false)
  useEffect(() => setRota(false), [persona?.foto_url])
  if (persona?.foto_url && !rota) {
    return <img className="msj-av" src={persona.foto_url} alt="" style={estilo} referrerPolicy="no-referrer" onError={() => setRota(true)} />
  }
  const equipo = persona?.tipo === 'equipo'
  const color = colorPersona(persona?.nombre)
  return (
    <span className={`msj-av msj-av--ini${equipo ? ' is-equipo' : ''}${color ? ' con-color' : ''}`} style={color ? { ...estilo, '--av': color } : estilo} aria-hidden="true">
      {iniciales(persona?.nombre)}
    </span>
  )
}
