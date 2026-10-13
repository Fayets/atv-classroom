import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { borrarCanal, crearCanal, editarCanal } from '../../api/mensajes'
import Alerta from './Alerta'
import { ROLES_CANAL, slugCanal } from '../../utils/mensajes'

// Crear o editar un canal grupal, como en Discord: nombre y roles que lo ven.
// Con `canal`, edita (y deja borrarlo); sin él, crea uno nuevo.
export default function NuevoCanal({ canal = null, onCerrar, onCreado, onBorrado }) {
  const editando = Boolean(canal)
  const esAnuncios = canal?.tipo === 'anuncios'
  const [nombre, setNombre] = useState(canal?.nombre || '')
  const [descripcion, setDescripcion] = useState(canal?.descripcion || '')
  const [roles, setRoles] = useState(canal?.roles?.length ? canal.roles : ['equipo'])
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const campo = useRef(null)

  useEffect(() => {
    campo.current?.focus()
    const esc = (e) => e.key === 'Escape' && !document.querySelector('.msj-alerta') && onCerrar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onCerrar])

  const alternar = (id) => setRoles((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]))
  const slug = slugCanal(nombre)

  async function crear(e) {
    e.preventDefault()
    if (!slug) {
      setError('Poné un nombre para el canal.')
      return
    }
    if (!esAnuncios && !roles.length) {
      setError('Elegí al menos un rol que vea el canal.')
      return
    }
    setEnviando(true)
    setError('')
    try {
      const hecho = editando
        ? await editarCanal(canal.id, { nombre: slug, descripcion: descripcion.trim(), ...(esAnuncios ? {} : { roles }) })
        : await crearCanal(slug, descripcion.trim() || null, roles)
      onCreado(hecho)
    } catch (err) {
      setError(err.message || 'No se pudo crear el canal.')
      setEnviando(false)
    }
  }

  async function borrar() {
    setConfirmarBorrado(false)
    setEnviando(true)
    try {
      await borrarCanal(canal.id)
      onBorrado?.(canal)
    } catch (err) {
      setError(err.message || 'No se pudo borrar el canal.')
      setEnviando(false)
    }
  }

  // Va a la raíz de la página: adentro de la ventana del escritorio quedaba recortada.
  return createPortal(
    <div className="msj-modal__fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="msj-modal" onSubmit={crear} role="dialog" aria-modal="true" aria-labelledby="msj-nuevo-canal">
        <h2 id="msj-nuevo-canal">{editando ? `Editar #${canal.nombre}` : 'Crear canal'}</h2>
        <p className="msj-modal__ayuda">
          {esAnuncios ? 'Canal de anuncios: lo leen todos y escribe solo el equipo.' : 'Un canal grupal, como en Discord. Lo ven y escriben los roles que elijas.'}
        </p>

        <label className="msj-modal__campo">
          <span>Nombre del canal</span>
          <div className="msj-modal__nombre">
            <i aria-hidden="true">#</i>
            <input ref={campo} type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="clase-en-vivo" maxLength={60} autoComplete="off" />
          </div>
          {nombre && slug !== nombre ? <small>Va a quedar como #{slug}</small> : null}
        </label>

        <label className="msj-modal__campo">
          <span>Descripción (opcional)</span>
          <input type="text" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Para qué es este canal" maxLength={300} />
        </label>

        {esAnuncios ? null : (
        <fieldset className="msj-modal__campo">
          <legend>Roles que ven el canal</legend>
          <div className="msj-roles">
            {ROLES_CANAL.map((r) => (
              <label key={r.id} className={`msj-rol${roles.includes(r.id) ? ' is-on' : ''}`}>
                <input type="checkbox" checked={roles.includes(r.id)} onChange={() => alternar(r.id)} />
                {r.nombre}
              </label>
            ))}
          </div>
          <small>Los admins lo ven siempre. Quien lo creó también, aunque no elija Equipo ATV.</small>
        </fieldset>
        )}

        {error ? <p className="msj-modal__error" role="alert">{error}</p> : null}

        <div className="msj-modal__botones">
          {editando ? (
            <button type="button" className="is-peligro" onClick={() => setConfirmarBorrado(true)} disabled={enviando}>
              Borrar canal
            </button>
          ) : null}
          <button type="button" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="is-primario" disabled={enviando}>
            {enviando ? (editando ? 'Guardando…' : 'Creando…') : editando ? 'Guardar' : 'Crear canal'}
          </button>
        </div>
      </form>
      {confirmarBorrado ? (
        <Alerta
          titulo={`¿Borrar #${canal.nombre}?`}
          texto="Se borran el canal y todos sus mensajes y archivos para todos. No se puede deshacer."
          confirmar="Borrar canal"
          peligro
          onConfirmar={borrar}
          onCancelar={() => setConfirmarBorrado(false)}
        />
      ) : null}
    </div>,
    document.body,
  )
}
