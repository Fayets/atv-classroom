import { Fragment } from 'react'
import { conEmojis } from '../../utils/emojis'
import { normal } from '../../utils/mensajes'

const URL = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g
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
  const partes = texto.split(PALABRA)
  const canalesDe = partes.map((parte, i) => (i % 2 === 1 ? canalDe(parte, canales) : null))
  return partes.map((parte, i) => {
    const canal = canalesDe[i]
    // El link ya lleva su "#": si se escribió "#slug" (o salió del autocompletado), no se repite.
    if (!canal) return <Fragment key={i}>{canalesDe[i + 1] && parte.endsWith('#') ? parte.slice(0, -1) : parte}</Fragment>
    return (
      <button key={i} type="button" className="msj-canal" title={`Abrir el chat de ${canal.nombre}`} onClick={() => onAbrirCanal(canal.id)}>
        {parte}
      </button>
    )
  })
}

const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Etiquetas con nombre completo ("@Franco Ascurra") primero, después las de una palabra.
function patronDe(personas) {
  const completos = [...new Set((personas || []).map((p) => (p.nombre || '').trim()).filter((n) => n.includes(' ')))]
  completos.sort((a, b) => b.length - a.length)
  const alternativas = [...completos.map(escapar), '[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+']
  return new RegExp(`(@(?:${alternativas.join('|')}))`, 'gi')
}

function ConMenciones({ texto, nombres, personas, yo, canales, onAbrirCanal }) {
  if (!nombres?.size && !/@(everyone|todos)/i.test(texto)) return <ConCanales texto={texto} canales={canales} onAbrirCanal={onAbrirCanal} />
  const tipoDe = new Map((personas || []).map((p) => [normal(p.nombre || ''), p.tipo]))
  const tiposPorNombre = new Map()
  for (const p of personas || []) {
    const n = normal((p.nombre || '').split(/\s+/)[0])
    tiposPorNombre.set(n, new Set([...(tiposPorNombre.get(n) || []), p.tipo]))
  }
  return texto.split(patronDe(personas)).map((parte, i) => {
    const quien = i % 2 === 1 ? normal(parte.slice(1)) : ''
    const todos = quien === 'everyone' || quien === 'todos'
    if (i % 2 === 1 && (todos || nombres.has(quien) || tipoDe.has(quien))) {
      // yo solo llega cuando la etiqueta es mía: vale con el primer nombre o con el completo.
      const esYo = todos || Boolean(yo && quien.split(' ')[0] === normal(yo))
      // Cliente o equipo: por el nombre completo, o por el primero si no se repite entre los dos lados.
      const tipos = tipoDe.has(quien) ? new Set([tipoDe.get(quien)]) : tiposPorNombre.get(quien) || new Set()
      const deCliente = !esYo && tipos.size === 1 && tipos.has('cliente')
      return (
        <span key={i} className={`msj-mencion${esYo ? ' is-yo' : ''}${deCliente ? ' is-cliente' : ''}`} title={deCliente ? 'Cliente' : tipos.has('equipo') && tipos.size === 1 ? 'Equipo ATV' : undefined}>
          {parte}
        </span>
      )
    }
    return <ConCanales key={i} texto={parte} canales={canales} onAbrirCanal={onAbrirCanal} />
  })
}

// Pasa los :atajos: a emoji, respeta los saltos de línea, convierte los links en enlaces, pone en negrita lo que va
// entre ** y resalta las @menciones y los canales de clientes nombrados por su slug (sin HTML del usuario).
// Con `secciones` (canal #updates) cada párrafo que arranca con "@Persona" va con una barra a la izquierda y,
// con `onTildar`, cada renglón lleva su casilla: tildado pasa al final del bloque con ✅; destildado vuelve a su lugar.
export default function TextoMensaje({ texto, nombres, personas, yo, canales, onAbrirCanal, secciones = false, tildes = [], onTildar }) {
  const limpio = conEmojis(texto)
  const linea = (t) => <Linea texto={t} nombres={nombres} personas={personas} yo={yo} canales={canales} onAbrirCanal={onAbrirCanal} />
  if (!secciones || !/(^|\n)@/.test(limpio)) return <p className="msj-texto">{linea(limpio)}</p>
  // Las claves de los tildes son los renglones tal como están escritos (antes de pasar :atajos: a emoji).
  const parrafos = texto.split(/\n{2,}/)
  const hechos = new Set(tildes)
  return (
    <div className="msj-texto msj-texto--secciones">
      {parrafos.map((par, i) => {
        const [cabeza, ...renglones] = par.split('\n')
        if (!cabeza.trimStart().startsWith('@') || !renglones.length) {
          return (
            <p key={i} className={par.trimStart().startsWith('@') ? 'msj-texto__bloque' : undefined}>
              {linea(conEmojis(par))}
            </p>
          )
        }
        const items = renglones.map((r) => ({ r, clave: r.trim(), hecho: hechos.has(r.trim()) })).filter((x) => x.clave)
        const orden = [...items.filter((x) => !x.hecho), ...items.filter((x) => x.hecho)]
        return (
          <div key={i} className="msj-texto__bloque">
            <div>{linea(conEmojis(cabeza))}</div>
            {orden.map((x) => (
              <div key={x.clave} className={`msj-texto__item${x.hecho ? ' is-hecho' : ''}`}>
                <span>{linea(conEmojis(x.hecho ? hecho(x.clave) : x.r))}</span>
                {onTildar ? (
                  <input
                    type="checkbox"
                    className="msj-tilde"
                    checked={x.hecho}
                    onChange={(e) => onTildar(x.clave, e.target.checked)}
                    aria-label={x.hecho ? 'Marcar como pendiente' : 'Marcar como hecho'}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// Un renglón tildado: lo que va adelante (⚠️ ⏳ 1d 9h, 📓, 20h, --) se cambia por el visto.
const MARCAS = /^(?:\s*(?:[^\p{L}\p{N}\s#@]+|\d+\s*[dhm](?![\p{L}\p{N}])))+\s*/u
function hecho(renglon) {
  return `✅ ${renglon.replace(MARCAS, '')}`
}

function Linea({ texto, nombres, personas, yo, canales, onAbrirCanal }) {
  const partes = texto.split(URL)
  return partes.map((parte, i) =>
    i % 2 === 1 ? (
      <a key={i} href={parte} target="_blank" rel="noopener noreferrer">
        {parte}
      </a>
    ) : (
      parte.split(NEGRITA).map((trozo, j) =>
        j % 2 === 1 ? (
          <strong key={`${i}-${j}`}>
            <ConMenciones texto={trozo} nombres={nombres} personas={personas} yo={yo} canales={canales} onAbrirCanal={onAbrirCanal} />
          </strong>
        ) : (
          <ConMenciones key={`${i}-${j}`} texto={trozo} nombres={nombres} personas={personas} yo={yo} canales={canales} onAbrirCanal={onAbrirCanal} />
        ),
      )
    ),
  )
}
