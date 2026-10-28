import { Fragment } from 'react'
import { conEmojis } from '../../utils/emojis'
import { normal } from '../../utils/mensajes'

const URL = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g
const MENCION = /(@[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)/g
const NEGRITA = /\*\*([^*\n]+?)\*\*/g // **texto**, como en Discord (lo traído de allá y los anuncios del equipo)

const PALABRA = /([A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9](?:…|\.\.\.)?)/g

// El canal de un cliente nombrado como en los updates ("kilian-gabi", o cortado: "la-biblia-de-los-productos-digi…").
function canalDe(palabra, canales) {
  const p = palabra.toLowerCase()
  if (canales.has(p)) return canales.get(p)
  const corte = p.match(/^(.+?)(?:…|\.\.\.)$/)
  if (!corte || corte[1].length < 8) return null
  const hits = [...canales.keys()].filter((s) => s.startsWith(corte[1]))
  return hits.length === 1 ? canales.get(hits[0]) : null
}

function ConCanales({ texto, canales, onAbrirCanal }) {
  if (!canales?.size || !onAbrirCanal) return texto
  return texto.split(PALABRA).map((parte, i) => {
    const canal = i % 2 === 1 ? canalDe(parte, canales) : null
    if (!canal) return <Fragment key={i}>{parte}</Fragment>
    return (
      <button key={i} type="button" className="msj-canal" title={`Abrir el chat de ${canal.nombre}`} onClick={() => onAbrirCanal(canal.id)}>
        {parte}
      </button>
    )
  })
}

function ConMenciones({ texto, nombres, yo, canales, onAbrirCanal }) {
  if (!nombres?.size && !/@(everyone|todos)/i.test(texto)) return <ConCanales texto={texto} canales={canales} onAbrirCanal={onAbrirCanal} />
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
    return <ConCanales key={i} texto={parte} canales={canales} onAbrirCanal={onAbrirCanal} />
  })
}

// Pasa los :atajos: a emoji, respeta los saltos de línea, convierte los links en enlaces, pone en negrita lo que va entre ** y resalta
// las @menciones y los canales de clientes nombrados por su slug (sin HTML del usuario).
export default function TextoMensaje({ texto, nombres, yo, canales, onAbrirCanal }) {
  const partes = conEmojis(texto).split(URL)
  return (
    <p className="msj-texto">
      {partes.map((parte, i) =>
        i % 2 === 1 ? (
          <a key={i} href={parte} target="_blank" rel="noopener noreferrer">
            {parte}
          </a>
        ) : (
          parte.split(NEGRITA).map((trozo, j) =>
            j % 2 === 1 ? (
              <strong key={`${i}-${j}`}>
                <ConMenciones texto={trozo} nombres={nombres} yo={yo} canales={canales} onAbrirCanal={onAbrirCanal} />
              </strong>
            ) : (
              <ConMenciones key={`${i}-${j}`} texto={trozo} nombres={nombres} yo={yo} canales={canales} onAbrirCanal={onAbrirCanal} />
            ),
          )
        ),
      )}
    </p>
  )
}
