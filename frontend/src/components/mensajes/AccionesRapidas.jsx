import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { borrarAccion, crearAccion, editarAccion, fetchAcciones } from '../../api/acciones'
import { enviarMensaje } from '../../api/mensajes'

const ESPERA = 4 // segundos para deshacer antes de que salga el mensaje

export const conNombre = (texto, cliente) => texto.replaceAll('{nombre}', (cliente || '').trim().split(/\s+/)[0] || '').replace(/^,\s*/, '')

function EditarAccion({ accion, onCerrar, onGuardada, onBorrada }) {
  const [nombre, setNombre] = useState(accion?.nombre || '')
  const [texto, setTexto] = useState(accion?.texto || '')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const campo = useRef(null)

  useEffect(() => {
    campo.current?.focus()
    const esc = (e) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onCerrar])

  async function guardar(e) {
    e.preventDefault()
    setEnviando(true)
    setError('')
    try {
      onGuardada(accion?.id ? await editarAccion(accion.id, nombre, texto) : await crearAccion(nombre, texto))
    } catch (err) {
      setError(err.message || 'No se pudo guardar.')
      setEnviando(false)
    }
  }

  async function borrar() {
    setEnviando(true)
    try {
      await borrarAccion(accion.id)
      onBorrada(accion.id)
    } catch (err) {
      setError(err.message || 'No se pudo borrar.')
      setEnviando(false)
    }
  }

  return createPortal(
    <div className="msj-modal__fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="msj-modal" onSubmit={guardar} role="dialog" aria-modal="true" aria-labelledby="msj-accion-titulo">
        <h2 id="msj-accion-titulo">{accion?.id ? 'Editar acción' : 'Nueva acción rápida'}</h2>
        <p className="msj-modal__ayuda">Un botón que manda este mensaje al chat con un clic. Escribí {'{nombre}'} y se cambia por el nombre del cliente.</p>
        <label className="msj-modal__campo">
          <span>Nombre del botón</span>
          <input ref={campo} type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Enviar mi agenda" maxLength={40} />
        </label>
        <label className="msj-modal__campo">
          <span>Mensaje</span>
          <textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="{nombre}, te dejo mi link para agendar: https://calendly.com/…" maxLength={2000} />
        </label>
        {error ? <p className="msj-modal__error" role="alert">{error}</p> : null}
        <div className="msj-modal__botones">
          {accion?.id ? (
            <button type="button" className="is-peligro" onClick={borrar} disabled={enviando}>
              Borrar
            </button>
          ) : null}
          <button type="button" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="is-primario" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

function IconoLapiz() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M11.3 2.3a1.5 1.5 0 0 1 2.1 2.1L5.6 12.2 2.5 13l.8-3.1z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

// Acciones rápidas del coach en el panel derecho: un clic manda el mensaje armado al chat abierto.
// alCrearRoadmap: la primera acción, fija, abre el formulario del roadmap (empieza por el Fathom).
export default function AccionesRapidas({ canalId, cliente, alCrearRoadmap = null, alVerContexto = null }) {
  const [datos, setDatos] = useState(null)
  const [editando, setEditando] = useState(null) // {} = nueva
  const [pendiente, setPendiente] = useState(null) // { clave, nombre, texto, canalId, queda }
  const [hecho, setHecho] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAcciones()
      .then(setDatos)
      .catch(() => setDatos({ acciones: [], sugeridas: [] }))
  }, [])

  // Cambiar de chat cancela lo que estaba por salir: nunca se manda al cliente equivocado.
  useEffect(() => {
    setPendiente(null)
    setHecho(null)
    setError('')
  }, [canalId])

  const mandar = useCallback(async (p) => {
    try {
      await enviarMensaje(p.canalId, p.texto)
      setHecho(p.clave)
      setTimeout(() => setHecho((h) => (h === p.clave ? null : h)), 2500)
    } catch (err) {
      setError(err.message || 'No se pudo enviar.')
    }
  }, [])

  useEffect(() => {
    if (!pendiente) return undefined
    if (pendiente.queda <= 0) {
      setPendiente(null)
      mandar(pendiente)
      return undefined
    }
    const t = setTimeout(() => setPendiente((p) => (p && p.clave === pendiente.clave ? { ...p, queda: p.queda - 1 } : p)), 1000)
    return () => clearTimeout(t)
  }, [pendiente, mandar])

  function disparar(clave, accion) {
    setError('')
    setHecho(null)
    setPendiente({ clave, nombre: accion.nombre, texto: conNombre(accion.texto, cliente), canalId, queda: ESPERA })
  }

  if (!datos) return null
  const { acciones, sugeridas } = datos
  const fila = (clave, accion, extra) => (
    <li key={clave} className={`msj-accion${extra?.sugerida ? ' is-sugerida' : ''}`}>
      <button type="button" className="msj-accion__boton" onClick={() => disparar(clave, accion)} disabled={Boolean(pendiente)} title={conNombre(accion.texto, cliente)}>
        <span>{accion.nombre}</span>
        {hecho === clave ? <em className="is-ok">Enviado</em> : extra?.sugerida ? <em>Sugerida</em> : null}
      </button>
      {extra?.sugerida ? (
        <button type="button" className="msj-accion__lapiz" onClick={() => setEditando({ nombre: accion.nombre, texto: accion.texto })} aria-label="Guardar como acción" title="Revisar y guardar">
          <IconoLapiz />
        </button>
      ) : (
        <button type="button" className="msj-accion__lapiz" onClick={() => setEditando(accion)} aria-label={`Editar ${accion.nombre}`}>
          <IconoLapiz />
        </button>
      )}
    </li>
  )

  return (
    <section className="msj-acciones" aria-label="Acciones rápidas">
      <div className="msj-acciones__cabeza">
        <p className="msj-seccion">Acciones rápidas</p>
        <button type="button" onClick={() => setEditando({})} aria-label="Nueva acción rápida" title="Nueva acción">+</button>
      </div>

      {pendiente ? (
        <div className="msj-acciones__pendiente" role="status">
          <span>
            <b>{pendiente.nombre}</b> sale en {pendiente.queda}…
          </span>
          <button type="button" onClick={() => setPendiente(null)}>
            Deshacer
          </button>
        </div>
      ) : null}
      {error ? <p className="msj-acciones__error" role="alert">{error}</p> : null}

      {alVerContexto || alCrearRoadmap || acciones.length || sugeridas.length ? (
        <ul className="msj-acciones__lista">
          {alVerContexto ? (
            <li className="msj-accion is-fija is-contexto">
              <button type="button" className="msj-accion__boton" onClick={alVerContexto} title="Qué pasó con este cliente: llamadas, roadmaps y chat, antes de tu llamada">
                <span>Ver contexto</span>
                <em>Timeline</em>
              </button>
            </li>
          ) : null}
          {alCrearRoadmap ? (
            <li className="msj-accion is-fija">
              <button type="button" className="msj-accion__boton" onClick={alCrearRoadmap} title="Al salir de la llamada: pegás el Fathom y el documento de próximos pasos">
                <span>Crear roadmap</span>
                <em>Roadmap</em>
              </button>
            </li>
          ) : null}
          {acciones.map((a) => fila(`a${a.id}`, a))}
          {sugeridas.map((s, i) => fila(`s${i}`, s, { sugerida: true }))}
        </ul>
      ) : null}
      {!acciones.length && !sugeridas.length ? (
        <button type="button" className="msj-acciones__vacio" onClick={() => setEditando({ nombre: 'Enviar mi agenda', texto: '{nombre}, te dejo mi link para agendar: ' })}>
          Creá tu primera acción, por ejemplo tu link de agenda.
        </button>
      ) : null}

      {editando ? (
        <EditarAccion
          accion={editando}
          onCerrar={() => setEditando(null)}
          onGuardada={(a) => {
            setDatos((d) => {
              const existe = d.acciones.some((x) => x.id === a.id)
              const acciones = existe ? d.acciones.map((x) => (x.id === a.id ? a : x)) : [...d.acciones, a]
              return { acciones, sugeridas: d.sugeridas.filter((s) => s.texto !== editando.texto || existe) }
            })
            setEditando(null)
          }}
          onBorrada={(id) => {
            setDatos((d) => ({ ...d, acciones: d.acciones.filter((x) => x.id !== id) }))
            setEditando(null)
          }}
        />
      ) : null}
    </section>
  )
}
