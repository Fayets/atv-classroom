import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { enviarMensaje } from '../../api/mensajes'
import { fetchLlamada, fetchLlamadas, llamadaPorLink } from '../../api/llamadas'
import { crearDoc, generarRoadmap } from '../../api/roadmap'

const ENLACE = '[ROADMAP]'
const hoy = () => new Date().toISOString().slice(0, 10)
const faltan = (texto) => (texto.match(/\[LINK\]/g) || []).length
const esFathom = (url) => /fathom\.video\/(share|calls|recording)\/[A-Za-z0-9_-]+/.test(url || '')
const ESTADO = { hecho: 'Hecho', parcial: 'A medias', no_hecho: 'No lo hizo', no_se_hablo: 'No se habló' }

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
  const [recientes, setRecientes] = useState([]) // llamadas de su Fathom, las de este cliente primero
  const [llamada, setLlamada] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [noEncontrada, setNoEncontrada] = useState('')
  const [aMano, setAMano] = useState(false) // mostrar la caja para pegar la transcripción

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
        const todas = d.admin ? d.coaches.flatMap((c) => c.llamadas) : d.llamadas
        const conTexto = todas.filter((l) => l.con_transcripcion)
        conTexto.sort((a, b) => (b.cliente?.id === clienteId) - (a.cliente?.id === clienteId) || (b.inicio || '').localeCompare(a.inicio || ''))
        setRecientes(conTexto.slice(0, 6))
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

  const cambiarPaso = (i, cambios) => setB((x) => ({ ...x, pasos: x.pasos.map((p, j) => (j === i ? { ...p, ...cambios } : p)) }))

  async function guardar(enviar) {
    setError('')
    const pasos = b.pasos.filter((p) => p.texto.trim())
    if (!b.titulo.trim()) return setError('Poné un título al roadmap.')
    if (!pasos.length) return setError('Dejá al menos un paso.')
    if (enviar && faltan(b.mensaje)) return setError(`Completá los ${faltan(b.mensaje)} [LINK] del mensaje antes de enviarlo (o borrá esas líneas).`)
    setGuardando(enviar ? 'enviar' : 'guardar')
    try {
      const datos = await crearDoc(clienteId, {
        titulo: b.titulo.trim(),
        area: b.area?.trim() || null,
        tipo: b.tipo,
        fecha: b.fecha,
        fathom_url: fathom.trim(),
        pasos,
        principal: true,
        // Para el cerebro: qué corrigió el coach del borrador y si lo mandó.
        borrador_id: b.borrador_id,
        mensaje_final: b.mensaje,
        enviado: enviar,
      })
      if (enviar) await enviarMensaje(canalId, b.mensaje.split(ENLACE).join(`${window.location.origin}/roadmap`))
      onGuardado(datos, enviar)
    } catch (err) {
      setError(err.message || 'No se pudo guardar.')
      setGuardando('')
    }
  }

  return createPortal(
    <div className="msj-modal__fondo" onMouseDown={(e) => e.target === e.currentTarget && paso === 'entrada' && onCerrar()}>
      <div className={`msj-modal rmi${paso === 'borrador' ? ' is-ancho' : ''}`} role="dialog" aria-modal="true" aria-labelledby="rmi-titulo">
        {paso !== 'borrador' ? (
          <form onSubmit={armar}>
            <h2 id="rmi-titulo">Crear roadmap de {cliente}</h2>
            <p className="msj-modal__ayuda">Pegá el link de Fathom y la IA arma los próximos pasos y el mensaje en tu voz. Vos lo revisás antes de que lo vea.</p>
            {recientes.length ? (
              <div className="rmi-llamadas">
                <span>Tus llamadas de Fathom</span>
                <div>
                  {recientes.map((l) => (
                    <button key={l.id} type="button" className={`rmi-llamada${llamada?.id === l.id ? ' is-on' : ''}`} onClick={() => usarLlamada(l.id)} disabled={paso === 'armando'}>
                      <b>{l.cliente?.nombre || l.titulo}</b>
                      <small>{l.inicio ? new Date(l.inicio).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : ''}{l.cliente?.id === clienteId ? ' · este cliente' : ''}</small>
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
            {aMano ? (
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
          <div>
            <h2 id="rmi-titulo">Revisá el roadmap de {cliente}</h2>
            <div className="rmi-cols">
              <section>
                <div className="rmi-fila">
                  <label className="msj-modal__campo"><span>Título</span><input type="text" value={b.titulo} onChange={(e) => setB({ ...b, titulo: e.target.value })} maxLength={80} /></label>
                  <label className="msj-modal__campo"><span>Qué trabajás</span><input type="text" value={b.area || ''} onChange={(e) => setB({ ...b, area: e.target.value })} maxLength={60} /></label>
                </div>
                <p className="rmi-sub">Próximos pasos <small>· quedan en su roadmap y los tildan los dos</small></p>
                <ol className="rmi-pasos">
                  {b.pasos.map((p, i) => (
                    <li key={i}>
                      <textarea rows={2} className="rmi-auto" value={p.texto} onChange={(e) => cambiarPaso(i, { texto: e.target.value })} />
                      <button type="button" className={`rmi-quien${p.quien === 'atv' ? ' is-atv' : ''}`} onClick={() => cambiarPaso(i, { quien: p.quien === 'atv' ? 'cliente' : 'atv' })} title="Quién lo hace (tocá para cambiar)">
                        {p.quien === 'atv' ? 'ATV' : 'Cliente'}
                      </button>
                      <button type="button" className="rmi-x" onClick={() => setB({ ...b, pasos: b.pasos.filter((_, j) => j !== i) })} aria-label="Sacar este paso">✕</button>
                    </li>
                  ))}
                </ol>
                <button type="button" className="rmi-mas" onClick={() => setB({ ...b, pasos: [...b.pasos, { texto: '', quien: 'cliente' }] })}>+ Agregar paso</button>
              </section>
              <section>
                <label className="msj-modal__campo">
                  <span>Mensaje para el chat</span>
                  <textarea rows={9} value={b.mensaje} onChange={(e) => setB({ ...b, mensaje: e.target.value })} />
                </label>
                <small className="rmi-ayuda">
                  {ENLACE} se cambia solo por el link a su roadmap. {faltan(b.mensaje) ? <b>Te faltan {faltan(b.mensaje)} [LINK] por completar.</b> : 'Todos los links completos.'}
                </small>
                <div className="rmi-coach">
                  <p>Solo para vos</p>
                  {b.entregables.length ? (
                    <>
                      <span>Entregables para adjuntar</span>
                      <ul>{b.entregables.map((e) => <li key={e}>{e}</li>)}</ul>
                    </>
                  ) : <span>No hay entregables aparte.</span>}
                  {b.seguimiento?.pasos?.length ? (
                    <>
                      <span>Qué pasó con el roadmap anterior ({b.seguimiento.titulo})</span>
                      <ul className="rmi-seguimiento">
                        {b.seguimiento.pasos.map((p) => (
                          <li key={p.id} className={`is-${p.estado}`}>
                            <em>{ESTADO[p.estado]}</em> {p.paso}
                            {p.resultado ? <small>“{p.resultado}”</small> : null}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {b.resumen ? (
                    <>
                      <span>Resumen de la llamada</span>
                      <q>{b.resumen}</q>
                    </>
                  ) : null}
                </div>
              </section>
            </div>
            {error ? <p className="msj-modal__error" role="alert">{error}</p> : null}
            <div className="msj-modal__botones">
              <button type="button" onClick={() => setPaso('entrada')} disabled={Boolean(guardando)}>Volver</button>
              <button type="button" onClick={() => guardar(false)} disabled={Boolean(guardando)}>{guardando === 'guardar' ? 'Guardando…' : 'Solo guardar'}</button>
              <button type="button" className="is-primario" onClick={() => guardar(true)} disabled={Boolean(guardando)}>{guardando === 'enviar' ? 'Enviando…' : 'Guardar y enviar'}</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
