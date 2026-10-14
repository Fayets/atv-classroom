import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { enviarMensaje } from '../../api/mensajes'
import { crearDoc, generarRoadmap } from '../../api/roadmap'

const ENLACE = '[ROADMAP]'
const hoy = () => new Date().toISOString().slice(0, 10)
const faltan = (texto) => (texto.match(/\[LINK\]/g) || []).length

// Crear roadmap desde la llamada (lo que Mauri hacía con Poppy): el coach pega la transcripción, la
// IA arma los pasos y el mensaje en su voz, y el coach revisa, completa los [LINK] y envía.
// Los pasos quedan escritos en el roadmap del cliente; el mensaje sale en su chat con el link al roadmap.
export default function RoadmapIA({ clienteId, canalId, cliente, onCerrar, onGuardado, onManual }) {
  const [paso, setPaso] = useState('entrada') // entrada | armando | borrador
  const [fathom, setFathom] = useState('')
  const [transcripcion, setTranscripcion] = useState('')
  const [b, setB] = useState(null) // el borrador, editable
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState('')

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && !guardando && paso !== 'armando' && onCerrar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onCerrar, guardando, paso])

  async function armar(e) {
    e.preventDefault()
    setError('')
    if (!fathom.trim()) return setError('Pegá el link de Fathom: el cliente va a poder ver la grabación desde su roadmap.')
    if (transcripcion.trim().length < 200) return setError('Pegá la transcripción completa de la llamada.')
    setPaso('armando')
    try {
      const r = await generarRoadmap(clienteId, transcripcion)
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
            <p className="msj-modal__ayuda">Pegá la llamada y la IA arma los próximos pasos y el mensaje en tu voz. Vos lo revisás antes de que lo vea.</p>
            <label className="msj-modal__campo">
              <span>Link de Fathom de la llamada</span>
              <input type="text" value={fathom} onChange={(e) => setFathom(e.target.value)} placeholder="https://fathom.video/…" autoFocus disabled={paso === 'armando'} />
            </label>
            <label className="msj-modal__campo">
              <span>Transcripción de la llamada</span>
              <textarea rows={10} value={transcripcion} onChange={(e) => setTranscripcion(e.target.value)} placeholder="En Fathom: Transcript → Copy transcript, y pegala acá." disabled={paso === 'armando'} />
            </label>
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
