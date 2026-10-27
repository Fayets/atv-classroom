import { useEffect, useState } from 'react'
import { agregarMiembro, editarMiembro, fetchEquipo, quitarMiembro } from '../../api/equipo'
import { getUserInitials } from '../../utils/user'

// Todos los del equipo tienen los mismos permisos: no se elige rol (va 'otro' por compatibilidad).
const VACIO = { email: '', nombre: '', rol: 'otro' }

// El cliente suma a su equipo (socios, setters, closers…) al chat. Entran con su mail y la misma clave.
export default function TuEquipo() {
  const [datos, setDatos] = useState(null)
  const [form, setForm] = useState(null) // { id?, email, nombre, rol }
  const [confirmar, setConfirmar] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    fetchEquipo()
      .then(setDatos)
      .catch((e) => setError(e.message || 'No se pudo cargar tu equipo.'))
  }, [])

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      const { id, ...campos } = form
      const m = id ? await editarMiembro(id, campos) : await agregarMiembro(campos)
      setDatos((d) => ({ ...d, miembros: id ? d.miembros.map((x) => (x.id === id ? m : x)) : [...d.miembros, m] }))
      setForm(null)
    } catch (err) {
      setError(err.message || 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  async function quitar(m) {
    setConfirmar(null)
    setError('')
    try {
      await quitarMiembro(m.id)
      setDatos((d) => ({ ...d, miembros: d.miembros.filter((x) => x.id !== m.id) }))
    } catch (err) {
      setError(err.message || 'No se pudo sacar.')
    }
  }

  if (!datos) return error ? <p className="cuenta-equipo__error">{error}</p> : <p className="cuenta__cargando">Cargando…</p>
  const lleno = datos.miembros.length >= datos.maximo

  return (
    <div className="cuenta-equipo">
      <p className="cuenta-equipo__ayuda">
        Sumá a tu socio, setters o closers al chat con ATV. Cada uno entra con <b>su mail</b> y <b>tu misma clave</b>. Ven tu chat y todo el classroom.
      </p>

      {datos.miembros.length ? (
        <ul className="cuenta-equipo__lista">
          {datos.miembros.map((m) => (
            <li key={m.id}>
              <span className="cuenta-equipo__avatar">{getUserInitials(m.nombre)}</span>
              <span className="cuenta-equipo__quien">
                <b>{m.nombre}</b>
                <small>{m.email}</small>
              </span>
              {confirmar === m.id ? (
                <span className="cuenta-equipo__acciones">
                  <button type="button" className="is-peligro" onClick={() => quitar(m)}>Sacar</button>
                  <button type="button" onClick={() => setConfirmar(null)}>No</button>
                </span>
              ) : (
                <span className="cuenta-equipo__acciones">
                  <button type="button" onClick={() => setForm({ id: m.id, email: m.email, nombre: m.nombre, rol: m.rol })}>Editar</button>
                  <button type="button" onClick={() => setConfirmar(m.id)}>Sacar</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {form ? (
        <form className="cuenta-equipo__form" onSubmit={guardar}>
          <label>
            <span>Nombre</span>
            <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Leonardo" maxLength={80} autoFocus />
          </label>
          <label>
            <span>Mail</span>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="leo@gmail.com" autoComplete="off" />
          </label>
          <div className="cuenta-equipo__botones">
            <button type="button" className="cuenta-boton is-suave" onClick={() => setForm(null)}>Cancelar</button>
            <button type="submit" className="cuenta-boton" disabled={guardando}>{guardando ? 'Guardando…' : form.id ? 'Guardar' : 'Sumar'}</button>
          </div>
        </form>
      ) : (
        <div className="cuenta-equipo__pie">
          <span>
            {datos.miembros.length} de {datos.maximo} lugares
          </span>
          <button type="button" className="cuenta-boton" onClick={() => setForm({ ...VACIO })} disabled={lleno}>
            {lleno ? 'Equipo completo' : 'Sumar persona'}
          </button>
        </div>
      )}
      {error ? <p className="cuenta-equipo__error" role="alert">{error}</p> : null}
    </div>
  )
}
