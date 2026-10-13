import { Fragment } from 'react'
import { normal } from '../../utils/mensajes'

const URL = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g
const MENCION = /(@[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)/g

function ConMenciones({ texto, nombres, yo }) {
  if (!nombres?.size && !/@(everyone|todos)/i.test(texto)) return texto
  return texto.split(MENCION).map((parte, i) => {
    const quien = i % 2 === 1 ? normal(parte.slice(1)) : ''
    const todos = quien === 'everyone' || quien === 'todos'
    if (i % 2 === 1 && (todos || nombres.has(quien))) {
      const esYo = todos || (yo && quien === normal(yo))
      return (
        <span key={i} className={`msj-mencion${esYo ? ' is-yo' : ''}`}>
          {parte}
        </span>
      )
    }
    return <Fragment key={i}>{parte}</Fragment>
  })
}

// Respeta los saltos de línea, convierte los links en enlaces y resalta las @menciones (sin HTML del usuario).
export default function TextoMensaje({ texto, nombres, yo }) {
  const partes = texto.split(URL)
  return (
    <p className="msj-texto">
      {partes.map((parte, i) =>
        i % 2 === 1 ? (
          <a key={i} href={parte} target="_blank" rel="noopener noreferrer">
            {parte}
          </a>
        ) : (
          <ConMenciones key={i} texto={parte} nombres={nombres} yo={yo} />
        ),
      )}
    </p>
  )
}
