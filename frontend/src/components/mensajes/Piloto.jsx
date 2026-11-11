import { useCallback, useEffect, useRef, useState } from 'react'
import { descartarBorrador, enviarBorrador, fetchModoPiloto, fetchPilotoCanal, guardarModoPiloto } from '../../api/piloto'

const MODOS = [
  { id: 'apagado', nombre: 'Apagado', corto: 'Apagado' },
  { id: 'borrador', nombre: 'Borrador', corto: 'Borrador' },
  { id: 'automatico', nombre: 'Piloto automático', corto: 'Automático' },
]

/** Lo del piloto en un chat de cliente: el borrador pendiente, qué salió solo y el modo de quien mira.
 *  Se vuelve a pedir con cada aviso en vivo del canal (un borrador vence si alguien contesta a mano). */
export function usePiloto(canalId, activo, suscribir) {
  const [datos, setDatos] = useState(null)
  const cargar = useCallback(() => {
    if (!activo) return
    fetchPilotoCanal(canalId).then(setDatos).catch(() => null)
  }, [canalId, activo])
  useEffect(() => {
    setDatos(null)
    cargar()
  }, [cargar])
  useEffect(
    () =>
      activo
        ? suscribir((ev) => {
            const delCanal = ev.canal_id === canalId || ev.mensaje?.canal_id === canalId
            if (delCanal && (ev.tipo === 'piloto' || ev.tipo === 'mensaje')) cargar()
          })
        : undefined,
    [suscribir, canalId, activo, cargar],
  )
  return { datos, setDatos, recargar: cargar }
}

/** El modo de quien mira, en la barra del chat: es suyo (vale para todos sus chats), no del canal. */
export function SelectorPiloto({ modo, onCambio }) {
  const [abierto, setAbierto] = useState(false)
  const [conf, setConf] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const caja = useRef(null)

  useEffect(() => {
    if (!abierto) return undefined
    fetchModoPiloto().then(setConf).catch(() => null)
    const fuera = (e) => caja.current && !caja.current.contains(e.target) && setAbierto(false)
    const esc = (e) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', esc)
    }
  }, [abierto])

  async function guardar(cambios) {
    setGuardando(true)
    try {
      const r = await guardarModoPiloto(cambios.modo ?? null, cambios.bloqueados ?? null)
      setConf((c) => ({ ...c, ...r }))
      onCambio?.(r.modo)
    } catch {
      // queda como estaba
    } finally {
      setGuardando(false)
    }
  }

  const actual = MODOS.find((m) => m.id === (conf?.modo || modo)) || MODOS[0]
  return (
    <div className="msj-piloto" ref={caja}>
      <button
        type="button"
        className={`msj-piloto__boton is-${actual.id}`}
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-haspopup="dialog"
      >
        <span className="msj-piloto__punto" aria-hidden="true" />
        <span className="msj-piloto__largo">Piloto: </span>
        {actual.corto}
      </button>
      {abierto ? (
        <div className="msj-piloto__panel" role="dialog" aria-label="Modo del piloto">
          <div className="msj-piloto__modos" role="radiogroup" aria-label="Modo">
            {MODOS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={actual.id === m.id}
                className={actual.id === m.id ? 'is-on' : ''}
                disabled={guardando}
                onClick={() => guardar({ modo: m.id })}
              >
                {m.nombre}
              </button>
            ))}
          </div>
          <p className="msj-piloto__ayuda">
            {actual.id === 'apagado'
              ? 'No escribe nada en tus chats.'
              : actual.id === 'borrador'
              ? 'Escribe la respuesta en tu voz y vos la mandás, la editás o la descartás.'
              : 'Contesta solo, en tu voz. Lo que marques abajo queda como borrador para vos.'}
          </p>
          {actual.id === 'automatico' && conf?.bloqueables ? (
            <div className="msj-piloto__temas">
              <b>No contesta solo</b>
              {conf.bloqueables.map((t) => {
                const on = conf.bloqueados.includes(t.id)
                return (
                  <label key={t.id} className={`msj-piloto__tema${on ? ' is-on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={guardando}
                      onChange={() => guardar({ bloqueados: on ? conf.bloqueados.filter((b) => b !== t.id) : [...conf.bloqueados, t.id] })}
                    />
                    {t.nombre}
                  </label>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** El borrador pendiente, arriba de donde se escribe. Lo que se cambie antes de mandarlo enseña la voz. */
export function TarjetaBorrador({ borrador, onListo }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(borrador.texto)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setTexto(borrador.texto)
    setEditando(false)
    setError('')
  }, [borrador.id, borrador.texto])

  async function hacer(accion) {
    setOcupado(true)
    setError('')
    try {
      if (accion === 'enviar') await enviarBorrador(borrador.id, editando ? texto : null)
      else await descartarBorrador(borrador.id)
      onListo?.()
    } catch (e) {
      setError(e?.message || 'No se pudo. Probá de nuevo.')
      if (e?.status === 404) onListo?.()
    } finally {
      setOcupado(false)
    }
  }

  const voz = borrador.mio ? 'en tu voz' : `en la voz de ${borrador.voz_nombre || borrador.de_nombre || 'quien lleva el chat'}`
  return (
    <section className={`msj-borrador${borrador.para_vos ? ' is-para-vos' : ''}`} aria-label="Borrador del piloto">
      <div className="msj-borrador__cab">
        <b>{borrador.para_vos ? 'Para vos' : 'Borrador del piloto'} · {voz}</b>
        {borrador.para_vos && borrador.motivo ? <span>No salió solo: {borrador.motivo}</span> : borrador.fuentes?.length ? <span>Usó {borrador.fuentes.join(', ')}</span> : null}
      </div>
      {editando ? (
        <textarea
          className="msj-borrador__campo"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={4000}
          autoFocus
          // Al abrir para editar, el cursor queda al final (lo normal es sumar o retocar el cierre).
          onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) hacer('enviar')
            if (e.key === 'Escape') setEditando(false)
          }}
        />
      ) : (
        <p className="msj-borrador__texto">{borrador.texto}</p>
      )}
      <div className="msj-borrador__acciones">
        <button type="button" className="is-principal" disabled={ocupado || !texto.trim()} onClick={() => hacer('enviar')}>
          {editando ? 'Enviar editado' : 'Enviar'}
        </button>
        {editando ? (
          <button type="button" disabled={ocupado} onClick={() => (setTexto(borrador.texto), setEditando(false))}>
            Deshacer
          </button>
        ) : (
          <button type="button" disabled={ocupado} onClick={() => setEditando(true)}>
            Editar
          </button>
        )}
        <button type="button" className="is-suave" disabled={ocupado} onClick={() => hacer('descartar')}>
          Descartar
        </button>
        {error ? <span className="msj-borrador__error" role="alert">{error}</span> : <span className="msj-borrador__nota">Lo que cambies le enseña al piloto</span>}
      </div>
    </section>
  )
}
