import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { COACHES, NIVELES, usePlataforma } from '../../context/PlataformaDemo'

export function Avatar({ coach, iniciales, size = 36 }) {
  const c = coach ? COACHES[coach] : null
  const texto = iniciales ?? c?.ini ?? '?'
  return (
    <span className="pf-av" style={{ width: size, height: size, background: c?.color ?? 'var(--pc-s3)', color: c?.tinta ?? 'var(--pc-t2)' }} aria-hidden="true">
      {texto}
    </span>
  )
}

export function NivelChip({ nivel }) {
  return <span className={`pf-nivel pf-nivel--${nivel}`}>{NIVELES[nivel]?.nombre ?? nivel}</span>
}

export function EnviarIcono() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 8h11M9 4l4 4-4 4" />
    </svg>
  )
}

function TarjetaRoadmap({ id, reemplaza, propia }) {
  const { roadmap } = usePlataforma()
  const r = roadmap(id)
  if (!r) return null
  const vigente = r.estado === 'vigente'
  return (
    <div className={`pf-card-rm${vigente ? ' is-vigente' : ''}`}>
      <span className="pf-eyebrow">{vigente ? 'Roadmap actualizado' : r.estado === 'complementario' ? 'Complementa a tu roadmap' : 'Roadmap'}</span>
      <div className="pf-card-rm__fila">
        <b>{r.titulo}</b>
        {vigente ? <span className="pf-tag-vigente">Vigente</span> : r.estado === 'reemplazado' ? <span className="pf-tag-hist">Reemplazado</span> : null}
      </div>
      {vigente && reemplaza ? <span className="pf-card-rm__sub">Reemplaza a {reemplaza}. {propia ? 'El cliente ve solo este para seguir.' : 'Es el que tenés que seguir este mes.'}</span> : null}
      <Link to="/roadmaps" className="pf-link">
        Ver en Roadmaps
      </Link>
    </div>
  )
}

function Mensaje({ m, mio, yo }) {
  if (m.tipo === 'roadmap') {
    return (
      <div className={`pf-msg-row${mio ? ' is-mio' : ''}`}>
        <TarjetaRoadmap id={m.roadmap} reemplaza={m.reemplaza} propia={yo === 'coach'} />
      </div>
    )
  }
  if (m.tipo === 'sop') {
    return (
      <div className={`pf-msg-row${mio ? ' is-mio' : ''}`}>
        <div className="pf-card-sop">
          <span className="pc-recurso__tag pc-tag--doc">DOC</span>
          <span>
            <b>{m.titulo}</b>
            <small>Completado desde el classroom</small>
          </span>
        </div>
      </div>
    )
  }
  return (
    <div className={`pf-msg-row${mio ? ' is-mio' : ''}`}>
      <div className={`pf-burbuja${mio ? ' is-mio' : ''}`}>
        {m.texto}
        <time>{m.hora}</time>
      </div>
    </div>
  )
}

// El chat de un cliente con un coach, visto por el cliente (yo="cliente") o por el coach (yo="coach").
export function Chat({ cliente, coach, yo, placeholder, acciones, rapidas = [] }) {
  const { conversacion, enviar } = usePlataforma()
  const mensajes = conversacion(cliente, coach)
  const [texto, setTexto] = useState('')
  const finRef = useRef(null)

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: 'end' })
  }, [mensajes.length, cliente, coach])

  function mandar(t) {
    const limpio = (t ?? texto).trim()
    if (!limpio) return
    enviar(cliente, coach, { de: yo, tipo: 'texto', texto: limpio })
    setTexto('')
  }

  return (
    <div className="pf-chat">
      <div className="pf-chat__lista" role="log" aria-live="polite">
        <span className="pf-chat__dia">Hoy</span>
        {mensajes.map((m) => (
          <Mensaje key={m.id} m={m} mio={m.de === yo} yo={yo} />
        ))}
        <span ref={finRef} />
      </div>
      <div className="pf-chat__pie">
        {rapidas.length ? (
          <div className="pf-rapidas">
            {rapidas.map((r) => (
              <button key={r} type="button" onClick={() => mandar(r)}>
                {r}
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="pf-composer"
          onSubmit={(e) => {
            e.preventDefault()
            mandar()
          }}
        >
          <label htmlFor={`pf-input-${cliente}-${coach}`} className="sr-only">
            Mensaje
          </label>
          <input id={`pf-input-${cliente}-${coach}`} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={placeholder} autoComplete="off" />
          {acciones}
          <button type="submit" className="pf-enviar" aria-label="Enviar" disabled={!texto.trim()}>
            <EnviarIcono />
          </button>
        </form>
      </div>
    </div>
  )
}

const TIPOS = [
  ['inicial', 'Inicial'],
  ['revision', 'Revisión mensual'],
  ['complementario', 'Complementario'],
]

// Panel lateral del coach para asignar un roadmap a un cliente.
export function AsignarRoadmap({ cliente, coach, onCerrar }) {
  const { cliente: getCliente, vigenteDe, roadmapsDe, asignar } = usePlataforma()
  const c = getCliente(cliente)
  const vigente = vigenteDe(cliente)
  const propios = roadmapsDe(cliente).filter((r) => r.coach === coach)
  const sugerido = `${COACHES[coach].area} · v${propios.length + 1}`
  const [titulo, setTitulo] = useState(sugerido)
  const [tipo, setTipo] = useState('revision')
  const [link, setLink] = useState('')
  const [esVigente, setEsVigente] = useState(true)
  const [avisar, setAvisar] = useState(true)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  function guardar(e) {
    e.preventDefault()
    if (!titulo.trim()) return
    asignar({ cliente, coach, titulo: titulo.trim(), tipo, link: link.trim(), vigente: esVigente && tipo !== 'complementario', avisar })
    setListo(true)
  }

  return (
    <div className="pf-drawer" role="dialog" aria-modal="true" aria-label={`Asignar roadmap a ${c.nombre}`}>
      <button type="button" className="pf-drawer__fondo" aria-label="Cerrar" onClick={onCerrar} />
      <form className="pf-drawer__panel" onSubmit={guardar}>
        <div className="pf-drawer__head">
          <span className="pf-eyebrow pf-eyebrow--rojo">Asignar roadmap</span>
          <b>{c.nombre}</b>
          <span className="pf-muted">
            {NIVELES[c.nivel].nombre} · {vigente ? `el vigente hoy es ${vigente.titulo} (${vigente.fecha})` : 'no tiene roadmap vigente'}
          </span>
        </div>
        {listo ? (
          <div className="pf-ok">
            <b>Roadmap asignado</b>
            <span>
              {titulo} ya figura en su mapa{esVigente && tipo !== 'complementario' ? ' como vigente' : ''}
              {avisar ? ' y le llegó la tarjeta en el chat.' : '.'}
            </span>
            <button type="button" className="pc-btn pc-btn--light" onClick={onCerrar}>
              Listo
            </button>
          </div>
        ) : (
          <>
            <label className="pf-campo" htmlFor="pf-rm-titulo">
              <span>Título</span>
              <input id="pf-rm-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </label>
            <fieldset className="pf-campo">
              <legend>Tipo</legend>
              <div className="pf-chips">
                {TIPOS.map(([id, nombre]) => (
                  <label key={id} className={tipo === id ? 'is-on' : ''}>
                    <input type="radio" name="pf-rm-tipo" value={id} checked={tipo === id} onChange={() => setTipo(id)} />
                    {nombre}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="pf-campo" htmlFor="pf-rm-link">
              <span>Link (Google Docs, Miro o Notion)</span>
              <input id="pf-rm-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/…" inputMode="url" />
            </label>
            <label className={`pf-check${tipo === 'complementario' ? ' is-off' : ' is-rojo'}`}>
              <input type="checkbox" checked={esVigente && tipo !== 'complementario'} disabled={tipo === 'complementario'} onChange={(e) => setEsVigente(e.target.checked)} />
              <span>
                <b>Marcar como vigente</b>
                <small>
                  {tipo === 'complementario'
                    ? 'Un complementario acompaña al vigente, no lo reemplaza.'
                    : vigente
                      ? `${vigente.titulo} pasa a historial. El cliente ve uno solo para seguir.`
                      : 'Va a ser el que el cliente siga.'}
                </small>
              </span>
            </label>
            <label className="pf-check">
              <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} />
              <span>
                <b>Avisarle por mensaje</b>
                <small>Le llega la tarjeta del roadmap en su chat con vos.</small>
              </span>
            </label>
            <div className="pf-drawer__acciones">
              <button type="submit" className="pc-btn pc-complete" disabled={!titulo.trim()}>
                Asignar roadmap
              </button>
              <button type="button" className="pc-btn pc-btn--ghost" onClick={onCerrar}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
