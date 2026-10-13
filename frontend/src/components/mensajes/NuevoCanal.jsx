import { useEffect, useRef, useState } from 'react'
import { crearCanal } from '../../api/mensajes'
import { ROLES_CANAL, slugCanal } from '../../utils/mensajes'

// Crear un canal grupal, como en Discord: nombre y roles que lo ven. Lo usa cualquiera del equipo.
export default function NuevoCanal({ onCerrar, onCreado }) {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [roles, setRoles] = useState(['equipo'])
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const campo = useRef(null)

  useEffect(() => {
    campo.current?.focus()
    const esc = (e) => e.key === 'Escape' && onCerrar()
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
    if (!roles.length) {
      setError('Elegí al menos un rol que vea el canal.')
      return
    }
    setEnviando(true)
    setError('')
    try {
      const canal = await crearCanal(slug, descripcion.trim() || null, roles)
      onCreado(canal)
    } catch (err) {
      setError(err.message || 'No se pudo crear el canal.')
      setEnviando(false)
    }
  }

  return (
    <div className="msj-modal__fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="msj-modal" onSubmit={crear} role="dialog" aria-modal="true" aria-labelledby="msj-nuevo-canal">
        <h2 id="msj-nuevo-canal">Crear canal</h2>
        <p className="msj-modal__ayuda">Un canal grupal, como en Discord. Lo ven y escriben los roles que elijas.</p>

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
          <small>Los admins lo ven siempre. Vos también, aunque no elijas Equipo ATV.</small>
        </fieldset>

        {error ? <p className="msj-modal__error" role="alert">{error}</p> : null}

        <div className="msj-modal__botones">
          <button type="button" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="is-primario" disabled={enviando}>
            {enviando ? 'Creando…' : 'Crear canal'}
          </button>
        </div>
      </form>
    </div>
  )
}
