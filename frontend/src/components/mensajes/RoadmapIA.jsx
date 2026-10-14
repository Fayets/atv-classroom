import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { enviarMensaje } from '../../api/mensajes'
import { fetchLlamada, fetchLlamadas, llamadaPorLink } from '../../api/llamadas'
import { crearDoc, generarRoadmap } from '../../api/roadmap'
import { useAuth } from '../../context/AuthContext'

const ENLACE = '[ROADMAP]'
const hoy = () => new Date().toISOString().slice(0, 10)
const faltan = (texto) => (texto.match(/\[LINK\]/g) || []).length
const esFathom = (url) => /fathom\.video\/(share|calls|recording)\/[A-Za-z0-9_-]+/.test(url || '')
const ESTADO = { hecho: 'Hecho', parcial: 'A medias', no_hecho: 'No lo hizo', no_se_hablo: 'No se habló' }

// ---------------------------------------------------------------- el borrador como un documento

const escapar = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const CHIP_ROADMAP = '<span class="rmi-chip" contenteditable="false" data-token="1">tu roadmap</span>'
let siguiente = 1
const nuevoId = () => siguiente++

// Lo que dice el mensaje, sin las líneas "Entregable: [LINK]" (esas se completan aparte, en la hoja).
function separarMensaje(mensaje, fathom = '') {
  const huecos = []
  const cuerpo = []
  for (const linea of (mensaje || '').split('\n')) {
    const m = linea.match(/^\s*(.+?):\s*\[LINK\]\s*$/)
    // La grabación de la llamada ya la tenemos: ese link se completa solo.
    if (m) huecos.push({ id: nuevoId(), titulo: m[1], url: fathom && /grabaci|llamada|fathom/i.test(m[1]) ? fathom : '' })
    else cuerpo.push(linea)
  }
  return { cuerpo: cuerpo.join('\n').trim(), huecos }
}

// Lee el texto de un bloque editable: saltos de línea y el chip del roadmap vuelven a ser texto.
function leerCuerpo(el) {
  let out = ''
  const andar = (n) => {
    if (n.nodeType === 3) out += n.textContent
    else if (n.dataset?.token) out += ENLACE
    else if (n.nodeName === 'BR') out += '\n'
    else {
      const bloque = n !== el && /^(DIV|P)$/.test(n.nodeName)
      if (bloque && out && !out.endsWith('\n')) out += '\n'
      n.childNodes.forEach(andar)
    }
  }
  andar(el)
  return out.replace(/\u00a0/g, ' ').trim()
}

// Pegar siempre como texto plano (sin formatos de otro lado).
const pegarPlano = (e) => {
  e.preventDefault()
  document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
}

function Documento({ b, cliente, llamada, fathom, error, guardando, onVolver, onGuardar }) {
  const [pasos, setPasos] = useState(() => b.pasos.map((p) => ({ id: nuevoId(), quien: p.quien, inicial: p.texto })))
  const textos = useRef(Object.fromEntries(pasos.map((p) => [p.id, p.inicial])))
  const [huecos, setHuecos] = useState(() => separarMensaje(b.mensaje, fathom).huecos)
  const titulo = useRef(null)
  const cuerpo = useRef(null)
  const [area, setArea] = useState(b.area || '')
  const enfocar = useRef(null)

  // Lo editable se carga una vez: escribir no redibuja la hoja (por eso no se traba).
  useEffect(() => {
    titulo.current.textContent = b.titulo
    cuerpo.current.innerHTML = escapar(separarMensaje(b.mensaje).cuerpo).split(ENLACE).join(CHIP_ROADMAP).replace(/\n/g, '<br>')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enfocar.current) return
    const el = document.querySelector(`[data-paso="${enfocar.current.id}"]`)
    if (el) {
      el.focus()
      if (enfocar.current.alFinal) {
        const r = document.createRange()
        r.selectNodeContents(el)
        r.collapse(false)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(r)
      }
    }
    enfocar.current = null
  })

  function teclaEnPaso(e, i) {
    const id = pasos[i].id
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const nuevo = { id: nuevoId(), quien: pasos[i].quien, inicial: '' }
      textos.current[nuevo.id] = ''
      enfocar.current = { id: nuevo.id }
      setPasos((ps) => [...ps.slice(0, i + 1), nuevo, ...ps.slice(i + 1)])
    } else if (e.key === 'Backspace' && !(textos.current[id] || '').length && pasos.length > 1) {
      e.preventDefault()
      if (i > 0) enfocar.current = { id: pasos[i - 1].id, alFinal: true }
      setPasos((ps) => ps.filter((p) => p.id !== id))
    }
  }

  function armar() {
    const lineas = huecos.map((h) => `${h.titulo}: ${h.url.trim() || '[LINK]'}`)
    return {
      titulo: titulo.current.textContent.trim(),
      area,
      pasos: pasos.map((p) => ({ texto: (textos.current[p.id] || '').trim(), quien: p.quien })),
      mensaje: [leerCuerpo(cuerpo.current), ...lineas].filter(Boolean).join('\n'),
    }
  }

  const sinLink = huecos.filter((h) => !h.url.trim()).length
  return (
    <div className="rmi-doc">
      <div className="rmi-doc__barra">
        <b>Roadmap de {cliente}</b>
        {llamada ? <span className="is-ok">✓ {llamada.titulo}{llamada.duracion_min ? ` · ${llamada.duracion_min} min` : ''}</span> : null}
        <span className="rmi-doc__ayuda">Borrador de la IA en tu voz · editá directo sobre la hoja</span>
      </div>
      <div className="rmi-doc__marco">
        <article className="rmi-hoja" aria-label="Documento del roadmap">
          <h2 ref={titulo} id="rmi-titulo" contentEditable suppressContentEditableWarning spellCheck={false} onPaste={pegarPlano} />
          <div className="rmi-hoja__meta">
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Qué trabajás con el cliente" maxLength={60} aria-label="Qué trabajás con el cliente" />
            <span>{new Date(`${b.fecha}T00:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}</span>
          </div>

          <h3>Próximos pasos <small>los van tildando {cliente} y vos</small></h3>
          <ol className="rmi-hoja__pasos">
            {pasos.map((p, i) => (
              <li key={p.id}>
                <span className="rmi-caja" aria-hidden="true" />
                <div
                  className="rmi-paso"
                  data-paso={p.id}
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck={false}
                  onInput={(e) => (textos.current[p.id] = e.currentTarget.textContent)}
                  onKeyDown={(e) => teclaEnPaso(e, i)}
                  onPaste={pegarPlano}
                  ref={(el) => {
                    if (el && !el.dataset.cargado) {
                      el.textContent = p.inicial
                      el.dataset.cargado = '1'
                    }
                  }}
                />
                <button
                  type="button"
                  className={`rmi-quien${p.quien === 'atv' ? ' is-atv' : ''}`}
                  onClick={() => setPasos((ps) => ps.map((x) => (x.id === p.id ? { ...x, quien: x.quien === 'atv' ? 'cliente' : 'atv' } : x)))}
                  title="Quién lo hace (tocá para cambiar)"
                >
                  {p.quien === 'atv' ? 'ATV' : cliente}
                </button>
                <button type="button" className="rmi-x" onClick={() => setPasos((ps) => ps.filter((x) => x.id !== p.id))} aria-label="Sacar este paso">✕</button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="rmi-hoja__mas"
            onClick={() => {
              const nuevo = { id: nuevoId(), quien: 'cliente', inicial: '' }
              textos.current[nuevo.id] = ''
              enfocar.current = { id: nuevo.id }
              setPasos((ps) => [...ps, nuevo])
            }}
          >
            + Escribí otro paso…
          </button>

          <h3>Mensaje para el chat <small>sale cuando tocás Enviar</small></h3>
          <div className="rmi-hoja__mensaje" ref={cuerpo} contentEditable suppressContentEditableWarning spellCheck={false} onPaste={pegarPlano} />
          {huecos.length ? (
            <div className="rmi-hoja__huecos">
              {huecos.map((h) => (
                <label key={h.id}>
                  <span>{h.titulo}:</span>
                  <input
                    className={h.url.trim() ? 'is-lleno' : ''}
                    value={h.url}
                    onChange={(e) => setHuecos((hs) => hs.map((x) => (x.id === h.id ? { ...x, url: e.target.value } : x)))}
                    placeholder="pegá el link"
                  />
                  <button type="button" onClick={() => setHuecos((hs) => hs.filter((x) => x.id !== h.id))} aria-label={`Sacar ${h.titulo}`}>✕</button>
                </label>
              ))}
            </div>
          ) : null}

          {error ? <p className="msj-modal__error" role="alert">{error}</p> : null}
          <div className="rmi-hoja__botones">
            <button type="button" onClick={onVolver} disabled={Boolean(guardando)}>Volver</button>
            <button type="button" onClick={() => onGuardar(false, armar())} disabled={Boolean(guardando)}>{guardando === 'guardar' ? 'Guardando…' : 'Solo guardar'}</button>
            <button type="button" className="is-primario" onClick={() => onGuardar(true, armar())} disabled={Boolean(guardando) || sinLink > 0}>
              {guardando === 'enviar' ? 'Enviando…' : sinLink ? `Guardar y enviar · ${sinLink === 1 ? 'falta 1 link' : `faltan ${sinLink} links`}` : 'Guardar y enviar'}
            </button>
          </div>
        </article>

        <aside className="rmi-margen" aria-label="Solo para vos">
          <div className="rmi-nota">
            <p className="rmi-nota__de"><i />Solo para vos</p>
            <span>Entregables para adjuntar</span>
            {b.entregables.length ? <ul>{b.entregables.map((e) => <li key={e}>{e}</li>)}</ul> : <p>No hay entregables aparte.</p>}
          </div>
          {b.resumen ? (
            <div className="rmi-nota">
              <span>Resumen de la llamada</span>
              <p>{b.resumen}</p>
            </div>
          ) : null}
          {b.seguimiento?.pasos?.length ? (
            <div className="rmi-nota">
              <span>Qué pasó con el roadmap anterior</span>
              <ul className="rmi-seguimiento">
                {b.seguimiento.pasos.map((p) => (
                  <li key={p.id} className={`is-${p.estado}`}>
                    <em>{ESTADO[p.estado]}</em> {p.paso}
                    {p.resultado ? <small>“{p.resultado}”</small> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}

// Crear roadmap desde la llamada (lo que Mauri hacía con Poppy): el coach pega la transcripción, la
// IA arma los pasos y el mensaje en su voz, y el coach revisa, completa los [LINK] y envía.
// Los pasos quedan escritos en el roadmap del cliente; el mensaje sale en su chat con el link al roadmap.
// llamadaId: si viene de la carpeta Llamadas, arranca con esa llamada ya cargada.
export default function RoadmapIA({ clienteId, canalId, cliente, llamadaId = null, onCerrar, onGuardado, onManual }) {
  const [paso, setPaso] = useState('entrada') // entrada | armando | borrador
  const [fathom, setFathom] = useState('')
  const [transcripcion, setTranscripcion] = useState('')
  const [b, setB] = useState(null) // el borrador, editable
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState('')
  const [recientes, setRecientes] = useState([]) // las llamadas que tuvo hoy (su Fathom), las de este cliente primero
  const { user } = useAuth()
  const [llamada, setLlamada] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [noEncontrada, setNoEncontrada] = useState('')
  const [aMano, setAMano] = useState(false) // mostrar la transcripción (o la caja para pegarla)
  const [editarTexto, setEditarTexto] = useState(false)

  // Pegás el link y se trae la llamada con su transcripción (de la carpeta Llamadas o del Fathom del equipo).
  useEffect(() => {
    const url = fathom.trim()
    if (!esFathom(url) || (llamada && llamada.fathom_url === url)) return undefined
    let vivo = true
    const t = setTimeout(async () => {
      setBuscando(true)
      setNoEncontrada('')
      try {
        const d = await llamadaPorLink(url, clienteId)
        if (!vivo) return
        setLlamada({ ...d, fathom_url: url })
        setTranscripcion(d.transcripcion || '')
        if (!d.transcripcion) setAMano(true)
      } catch (err) {
        if (!vivo) return
        setLlamada(null)
        setNoEncontrada(err.message || 'No encontramos esa llamada.')
        setAMano(true)
      } finally {
        if (vivo) setBuscando(false)
      }
    }, 400)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [fathom]) // eslint-disable-line react-hooks/exhaustive-deps

  async function usarLlamada(id) {
    setError('')
    try {
      const d = await fetchLlamada(id)
      setLlamada(d)
      setFathom(d.fathom_url || '')
      setTranscripcion(d.transcripcion || '')
    } catch (err) {
      setError(err.message || 'No se pudo traer la llamada.')
    }
  }

  useEffect(() => {
    if (llamadaId) usarLlamada(llamadaId)
    fetchLlamadas()
      .then((d) => {
        // Solo las suyas y solo las de hoy: es el atajo para armar el roadmap al salir de la llamada.
        const mias = d.admin ? d.coaches.find((c) => c.id === user?.usuario_id)?.llamadas || [] : d.llamadas
        const dia = new Date().toDateString()
        const deHoy = mias.filter((l) => l.con_transcripcion && l.inicio && new Date(l.inicio).toDateString() === dia)
        deHoy.sort((a, b) => (b.cliente?.id === clienteId) - (a.cliente?.id === clienteId) || (b.inicio || '').localeCompare(a.inicio || ''))
        setRecientes(deHoy)
      })
      .catch(() => null)
  }, [llamadaId, clienteId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && !guardando && paso !== 'armando' && onCerrar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onCerrar, guardando, paso])

  async function armar(e) {
    e.preventDefault()
    setError('')
    if (!fathom.trim()) return setError('Pegá el link de Fathom: el cliente va a poder ver la grabación desde su roadmap.')
    if (transcripcion.trim().length < 200) {
      setAMano(true)
      return setError(buscando ? 'Esperá un segundo: estamos trayendo la llamada.' : 'Pegá la transcripción completa de la llamada.')
    }
    setPaso('armando')
    try {
      const r = await generarRoadmap(clienteId, transcripcion, fathom.trim())
      setB({ ...r, tipo: 'revision', fecha: hoy() })
      setPaso('borrador')
    } catch (err) {
      setError(err.message || 'No se pudo armar el borrador.')
      setPaso('entrada')
    }
  }


  async function guardar(enviar, armado) {
    setError('')
    const pasos = armado.pasos.filter((p) => p.texto.trim())
    if (!armado.titulo.trim()) return setError('Poné un título al roadmap.')
    if (!pasos.length) return setError('Dejá al menos un paso.')
    if (enviar && faltan(armado.mensaje)) return setError(`Pegá ${faltan(armado.mensaje) === 1 ? 'el link que falta' : `los ${faltan(armado.mensaje)} links que faltan`} antes de enviarlo (o sacá esa línea).`)
    setGuardando(enviar ? 'enviar' : 'guardar')
    try {
      const datos = await crearDoc(clienteId, {
        titulo: armado.titulo.trim(),
        area: armado.area?.trim() || null,
        tipo: b.tipo,
        fecha: b.fecha,
        fathom_url: fathom.trim(),
        pasos,
        principal: true,
        // Para el cerebro: qué corrigió el coach del borrador y si lo mandó.
        borrador_id: b.borrador_id,
        mensaje_final: armado.mensaje,
        enviado: enviar,
      })
      if (enviar) await enviarMensaje(canalId, armado.mensaje.split(ENLACE).join(`${window.location.origin}/roadmap`))
      onGuardado(datos, enviar)
    } catch (err) {
      setError(err.message || 'No se pudo guardar.')
      setGuardando('')
    }
  }

  return createPortal(
    <div className="msj-modal__fondo" onMouseDown={(e) => e.target === e.currentTarget && paso === 'entrada' && onCerrar()}>
      <div className={`msj-modal rmi${paso === 'borrador' ? ' is-doc' : ''}`} role="dialog" aria-modal="true" aria-labelledby="rmi-titulo">
        {paso !== 'borrador' ? (
          <form onSubmit={armar}>
            <h2 id="rmi-titulo">Crear roadmap de {cliente}</h2>
            <p className="msj-modal__ayuda">Pegá el link de Fathom y la IA arma los próximos pasos y el mensaje en tu voz. Vos lo revisás antes de que lo vea.</p>
            {recientes.length ? (
              <div className="rmi-llamadas">
                <span>Tus llamadas de hoy</span>
                <div>
                  {recientes.map((l) => (
                    <button key={l.id} type="button" className={`rmi-llamada${llamada?.id === l.id ? ' is-on' : ''}`} onClick={() => usarLlamada(l.id)} disabled={paso === 'armando'}>
                      <b>{l.cliente?.nombre || l.titulo}</b>
                      <small>{l.inicio ? new Date(l.inicio).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : ''}{l.cliente?.id === clienteId ? ' · este cliente' : ''}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <label className="msj-modal__campo">
              <span>Link de Fathom de la llamada</span>
              <input type="text" value={fathom} onChange={(e) => setFathom(e.target.value)} placeholder="https://fathom.video/…" autoFocus disabled={paso === 'armando'} />
            </label>
            {buscando ? <p className="rmi-estado">Trayendo la llamada de Fathom…</p> : null}
            {llamada && !buscando ? (
              <p className="rmi-estado is-ok">
                ✓ {llamada.titulo}{llamada.inicio ? ` · ${new Date(llamada.inicio).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}` : ''}
                {transcripcion ? ` · transcripción lista (${Math.round(transcripcion.length / 1000)}k caracteres)` : ''}
                {!aMano ? <button type="button" onClick={() => setAMano(true)}>Ver</button> : null}
              </p>
            ) : null}
            {noEncontrada && !buscando ? <p className="rmi-estado is-aviso">{noEncontrada}</p> : null}
            {aMano && llamada && transcripcion && !editarTexto ? (
              <>
                <div className="rmi-transcripcion" tabIndex={0} aria-label="Transcripción de la llamada">{transcripcion}</div>
                <button type="button" className="rmi-mano" onClick={() => setEditarTexto(true)}>Editar la transcripción</button>
              </>
            ) : aMano ? (
              <label className="msj-modal__campo">
                <span>Transcripción de la llamada</span>
                <textarea rows={8} value={transcripcion} onChange={(e) => setTranscripcion(e.target.value)} placeholder="En Fathom: Transcript → Copy transcript, y pegala acá." disabled={paso === 'armando'} />
              </label>
            ) : !llamada && !buscando && !noEncontrada ? (
              <button type="button" className="rmi-mano" onClick={() => setAMano(true)}>O pegá la transcripción a mano</button>
            ) : null}
            {error ? <p className="msj-modal__error" role="alert">{error}</p> : null}
            <div className="msj-modal__botones">
              <button type="button" className="rmi-manual" onClick={onManual} disabled={paso === 'armando'}>Cargar a mano</button>
              <button type="button" onClick={onCerrar} disabled={paso === 'armando'}>Cancelar</button>
              <button type="submit" className="is-primario" disabled={paso === 'armando'}>{paso === 'armando' ? 'Armando el roadmap…' : 'Armar con IA'}</button>
            </div>
          </form>
        ) : (
          <Documento b={b} cliente={cliente} llamada={llamada} fathom={fathom.trim()} error={error} guardando={guardando} onVolver={() => setPaso('entrada')} onGuardar={guardar} />
        )}
      </div>
    </div>,
    document.body,
  )
}
