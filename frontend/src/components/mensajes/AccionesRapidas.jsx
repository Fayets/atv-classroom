import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { borrarAccion, crearAccion, editarAccion, fetchAcciones, fetchClasesParaEnviar } from '../../api/acciones'
import { enviarMensaje, fetchTextoCanal } from '../../api/mensajes'

const ESPERA = 4 // segundos para deshacer antes de que salga el mensaje

// El primer mensaje del canal privado (lo que antes se pegaba a mano en Discord). Fija para todo el equipo.
const BIENVENIDA = `{nombre}, ¡bienvenido/a a ATV! 🙌 Este es tu canal privado con el equipo: acá vas a tener el seguimiento durante todo el programa.

✅ ONBOARDING — hacelo hoy
1. Revisá tu mail: te llegó el link al onboarding y tu contraseña.
2. Recorré todos los pasos hasta el final: firmá tu contrato y mirá el video de bienvenida completo.
3. Completá el formulario de onboarding (el paso "Tu perfil"): es obligatorio, con eso preparamos tu primera sesión.
4. En "Tus recursos" están tus datos para entrar al classroom y la invitación al Discord de la comunidad.

📅 DESPUÉS
Presentate en este canal (quién sos y qué querés lograr) y avisanos cuando termines: te pasamos el link para agendar tu primera sesión.

Si no te llegó el mail o algo no anda, escribinos acá y lo resolvemos.`
// 2K: sin Discord ni comunidad, y el chat es solo para pedir las sesiones 1 a 1.
const BIENVENIDA_2K = `{nombre}, ¡bienvenido/a a ATV! 🙌 Este es tu canal privado: por acá pedís tus sesiones 1 a 1 con el equipo.

✅ ONBOARDING — hacelo hoy
1. Revisá tu mail: te llegó el link al onboarding y tu contraseña.
2. Recorré todos los pasos hasta el final: firmá tu contrato y mirá el video de bienvenida completo.
3. Completá el formulario de onboarding (el paso "Tu perfil"): es obligatorio, con eso preparamos tu primera sesión.
4. En "Tus recursos" están tus datos para entrar al classroom.

📅 DESPUÉS
Avisanos por acá cuando termines y agendamos tu sesión de diagnóstico.

Si no te llegó el mail o algo no anda, escribinos acá y lo resolvemos.`

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
const sinTildes = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Elegir una clase para mandársela al cliente, como en el classroom: primero los módulos con su portada; tocás uno y
// salen sus clases. Si escribís, busca entre todas las clases por título o módulo.
function Portada({ src, titulo, chica = false }) {
  return src ? (
    <img className={chica ? 'ec-mini' : 'ec-portada'} src={src} alt="" loading="lazy" />
  ) : (
    <span className={`${chica ? 'ec-mini' : 'ec-portada'} is-vacia`} aria-hidden="true">
      {(titulo || '?').slice(0, 1)}
    </span>
  )
}

function ElegirClase({ onCerrar, onElegir }) {
  const [clases, setClases] = useState(null)
  const [q, setQ] = useState('')
  const [modulo, setModulo] = useState(null)
  const [error, setError] = useState('')
  const campo = useRef(null)
  const cerrar = useRef(onCerrar)
  cerrar.current = onCerrar
  // Una sola vez al abrir (el panel se redibuja seguido y no hay que volver a pedir las clases).
  useEffect(() => {
    fetchClasesParaEnviar()
      .then(setClases)
      .catch((e) => setError(e.message || 'No se pudieron traer las clases.'))
    campo.current?.focus()
    const tecla = (e) => e.key === 'Escape' && cerrar.current()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  const modulos = []
  ;(clases || []).forEach((c) => {
    const m = modulos.find((x) => x.titulo === c.modulo)
    if (m) m.cantidad += 1
    else modulos.push({ titulo: c.modulo, portada: c.portada, orden: c.orden ?? 999, cantidad: 1 })
  })
  modulos.sort((a, b) => a.orden - b.orden)
  const palabras = sinTildes(q).split(/\s+/).filter(Boolean)
  const buscando = palabras.length > 0
  const lista = buscando
    ? (clases || []).filter((c) => palabras.every((w) => sinTildes(`${c.titulo} ${c.modulo}`).includes(w))).slice(0, 60)
    : modulo
      ? (clases || []).filter((c) => c.modulo === modulo.titulo)
      : []

  return createPortal(
    <div className="msj-modal__fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="msj-modal ec" role="dialog" aria-modal="true" aria-labelledby="ec-titulo">
        <h2 id="ec-titulo">Enviar una clase</h2>
        <input ref={campo} className="ec-buscar" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscá una clase por título o módulo" aria-label="Buscar clase" />
        {error ? <p className="msj-modal__error" role="alert">{error}</p> : null}
        <div className="ec-lista">
          {!clases && !error ? <p className="ec-vacio">Cargando clases…</p> : null}
          {clases && !buscando && !modulo ? (
            <div className="ec-modulos">
              {modulos.map((m) => (
                <button key={m.titulo} type="button" className="ec-modulo-tarjeta" onClick={() => setModulo(m)}>
                  <Portada src={m.portada} titulo={m.titulo} />
                  <span className="ec-modulo-nombre">{m.titulo}</span>
                  <small>{m.cantidad} {m.cantidad === 1 ? 'clase' : 'clases'}</small>
                </button>
              ))}
            </div>
          ) : null}
          {!buscando && modulo ? (
            <button type="button" className="ec-volver" onClick={() => setModulo(null)}>
              ← Módulos · <b>{modulo.titulo}</b>
            </button>
          ) : null}
          {buscando && clases && !lista.length ? <p className="ec-vacio">No hay clases con eso.</p> : null}
          {lista.map((c) => (
            <button key={`${c.fuente}-${c.id}`} type="button" className="ec-clase" onClick={() => onElegir(c)}>
              <Portada src={c.portada} titulo={c.modulo} chica />
              <span>
                {c.titulo}
                {buscando ? <small>{c.modulo}</small> : null}
              </span>
            </button>
          ))}
        </div>
        <div className="msj-modal__botones">
          <button type="button" onClick={onCerrar}>Cancelar</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function AccionesRapidas({ canalId, cliente, plan = null, alCrearRoadmap = null }) {
  const [datos, setDatos] = useState(null)
  const [editando, setEditando] = useState(null) // {} = nueva
  const [pendiente, setPendiente] = useState(null) // { clave, nombre, texto, canalId, queda }
  const [hecho, setHecho] = useState(null)
  const [error, setError] = useState('')
  const [bajando, setBajando] = useState(false)
  const [eligiendoClase, setEligiendoClase] = useState(false)

  async function descargarTexto() {
    setBajando(true)
    setError('')
    try {
      const { nombre, texto } = await fetchTextoCanal(canalId)
      const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${(nombre || cliente || 'chat').replace(/[\\/:*?"<>|]+/g, '-').trim()}.txt`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setError(err.message || 'No se pudo descargar el chat')
    } finally {
      setBajando(false)
    }
  }

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

      <ul className="msj-acciones__lista">
          <li className="msj-accion is-fija">
            <button
              type="button"
              className="msj-accion__boton"
              onClick={() => disparar('bienvenida', { nombre: 'Bienvenida', texto: String(plan || '').toLowerCase() === '2k' ? BIENVENIDA_2K : BIENVENIDA })}
              disabled={Boolean(pendiente)}
              title="El primer mensaje del canal: cómo hacer el onboarding y qué sigue"
            >
              <span>Bienvenida</span>
              {hecho === 'bienvenida' ? <em className="is-ok">Enviado</em> : <em>Onboarding</em>}
            </button>
          </li>
          {alCrearRoadmap ? (
            <li className="msj-accion is-fija">
              <button type="button" className="msj-accion__boton" onClick={alCrearRoadmap} title="Al salir de la llamada: pegás el Fathom y el documento de próximos pasos">
                <span>Crear roadmap</span>
                <em>Roadmap</em>
              </button>
            </li>
          ) : null}
          <li className="msj-accion is-fija is-contexto">
            <button type="button" className="msj-accion__boton" onClick={() => setEligiendoClase(true)} disabled={Boolean(pendiente)} title="Elegí una clase del classroom y le llega el link en el chat">
              <span>Enviar clase</span>
              {hecho === 'clase' ? <em className="is-ok">Enviado</em> : <em>Classroom</em>}
            </button>
          </li>
          <li className="msj-accion is-fija is-contexto">
            <button type="button" className="msj-accion__boton" onClick={descargarTexto} disabled={bajando} title="Baja toda la conversación de este chat en un .txt">
              <span>Descargar chat</span>
              <em>{bajando ? 'Bajando…' : '.txt'}</em>
            </button>
          </li>
          {acciones.map((a) => fila(`a${a.id}`, a))}
          {sugeridas.map((s, i) => fila(`s${i}`, s, { sugerida: true }))}
      </ul>
      {!acciones.length && !sugeridas.length ? (
        <button type="button" className="msj-acciones__vacio" onClick={() => setEditando({ nombre: 'Enviar mi agenda', texto: '{nombre}, te dejo mi link para agendar: ' })}>
          Creá tu primera acción, por ejemplo tu link de agenda.
        </button>
      ) : null}

      {eligiendoClase ? (
        <ElegirClase
          onCerrar={() => setEligiendoClase(false)}
          onElegir={(c) => {
            setEligiendoClase(false)
            disparar('clase', { nombre: c.titulo, texto: `{nombre}, te dejo esta clase: ${c.titulo}\n${c.url}` })
          }}
        />
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
