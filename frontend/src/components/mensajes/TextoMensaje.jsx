import { Fragment } from 'react'

const URL = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g

// Respeta los saltos de línea y convierte los links en enlaces (sin HTML del usuario).
export default function TextoMensaje({ texto }) {
  const partes = texto.split(URL)
  return (
    <p className="msj-texto">
      {partes.map((parte, i) =>
        i % 2 === 1 ? (
          <a key={i} href={parte} target="_blank" rel="noopener noreferrer">
            {parte}
          </a>
        ) : (
          <Fragment key={i}>{parte}</Fragment>
        ),
      )}
    </p>
  )
}
