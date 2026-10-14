import { useCallback, useEffect, useState } from 'react'
import { actualizarMiembroEquipo, borrarMiembroEquipo, crearMiembroEquipo, fetchEquipo } from '../api/admin'
import AppHeader from '../components/AppHeader'
import { useAuth } from '../context/AuthContext'
import { getUserInitials } from '../utils/user'
import '../styles/equipo.css'

const AREAS = [
  ['', 'Sin área'],
  ['marketing', 'Marketing'],
  ['ventas', 'Ventas'],
  ['sistemas', 'Sistemas'],
  ['equipo', 'Equipo'],
  ['fulfillment', 'Fulfillment'],
  ['mentalidad', 'Mentalidad'],
]
const ROLES = [
  ['coach', 'Coach'],
  ['admin', 'Admin'],
]
const NUEVO = { email: '', nombre: '', rol: 'coach', area: '' }

function Avatar({ miembro }) {
  if (miembro.foto_url) {
    return <img className="eq-avatar" src={miembro.foto_url} alt="" referrerPolicy="no-referrer" />
  }
  return <span className="eq-avatar eq-avatar--ini">{getUserInitials(miembro.nombre || miembro.email)}</span>
}

export default function EquipoPage() {
  const { user } = useAuth()
  const [miembros, setMiembros] = useState([])
  const [cargando, setCargando] = useState(true)
  const [nuevo, setNuevo] = useState(NUEVO)
  const [guardando, setGuardando] = useState(null)
  const [borrando, setBorrando] = useState(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    try {
      setMiembros(await fetchEquipo())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el equipo.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function agregar(event) {
    event.preventDefault()
    if (!nuevo.email.trim()) return
    setError('')
    setGuardando('nuevo')
    try {
      await crearMiembroEquipo({ ...nuevo, email: nuevo.email.trim(), area: nuevo.area || null })
      setNuevo(NUEVO)
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar.')
    } finally {
      setGuardando(null)
    }
  }

  async function borrar(miembro) {
    setError('')
    setGuardando(miembro.id)
    try {
      await borrarMiembroEquipo(miembro.id)
      setMiembros((lista) => lista.filter((m) => m.id !== miembro.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar.')
    } finally {
      setGuardando(null)
      setBorrando(null)
    }
  }

  async function cambiar(miembro, cambios) {
    setError('')
    setGuardando(miembro.id)
    try {
      const actualizado = await actualizarMiembroEquipo(miembro.id, cambios)
      setMiembros((lista) => lista.map((m) => (m.id === miembro.id ? actualizado : m)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(null)
    }
  }

  return (
    <div className="app-shell admin-page">
      <AppHeader />
      <main className="admin-page__main eq-main">
        <header className="admin-page__header">
          <div>
            <p className="admin-page__eyebrow">Panel admin</p>
            <h1 className="admin-page__title">Equipo</h1>
          </div>
        </header>

        <p className="eq-intro">
          Quien esté acá entra al classroom con su cuenta de Google. Los coaches ven el classroom completo; los admins
          además editan los módulos y el equipo.
        </p>

        {error ? (
          <p className="admin-page__error" role="alert">
            {error}
          </p>
        ) : null}

        <form className="eq-nuevo" onSubmit={agregar}>
          <input
            className="admin-input"
            type="email"
            placeholder="mail de Google"
            value={nuevo.email}
            onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
            required
          />
          <input
            className="admin-input"
            placeholder="Nombre"
            value={nuevo.nombre}
            onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
          />
          <select className="admin-input" value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}>
            {ROLES.map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
          <select className="admin-input" value={nuevo.area} onChange={(e) => setNuevo({ ...nuevo, area: e.target.value })}>
            {AREAS.map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
          <button type="submit" className="admin-btn admin-btn--primary" disabled={guardando === 'nuevo'}>
            {guardando === 'nuevo' ? 'Agregando…' : 'Agregar'}
          </button>
        </form>

        {cargando ? (
          <p className="eq-vacio">Cargando…</p>
        ) : (
          <ul className="eq-lista">
            {miembros.map((m) => (
              <li key={m.id} className={`eq-fila${m.activo ? '' : ' is-baja'}`}>
                <Avatar miembro={m} />
                <div className="eq-quien">
                  <strong>{m.nombre || m.email}</strong>
                  <span>{m.email}</span>
                </div>
                <span className={`eq-estado${m.con_google ? ' is-ok' : ''}`}>
                  {!m.activo ? 'De baja' : m.con_google ? 'Entró con Google' : m.con_clave ? 'Entra con clave' : 'Todavía no entró'}
                </span>
                <select
                  className="admin-input"
                  value={m.rol}
                  disabled={guardando === m.id || m.id === user?.usuario_id}
                  onChange={(e) => cambiar(m, { rol: e.target.value })}
                  aria-label={`Rol de ${m.nombre || m.email}`}
                >
                  {ROLES.map(([valor, etiqueta]) => (
                    <option key={valor} value={valor}>
                      {etiqueta}
                    </option>
                  ))}
                </select>
                <select
                  className="admin-input"
                  value={m.area || ''}
                  disabled={guardando === m.id}
                  onChange={(e) => cambiar(m, { area: e.target.value || null })}
                  aria-label={`Área de ${m.nombre || m.email}`}
                >
                  {AREAS.map(([valor, etiqueta]) => (
                    <option key={valor} value={valor}>
                      {etiqueta}
                    </option>
                  ))}
                </select>
                {!m.activo && borrando === m.id ? (
                  <span className="eq-borrar">
                    <button type="button" className="admin-btn admin-btn--primary" disabled={guardando === m.id} onClick={() => borrar(m)}>
                      {guardando === m.id ? 'Borrando…' : 'Sí, borrar'}
                    </button>
                    <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setBorrando(null)}>No</button>
                  </span>
                ) : (
                  <span className="eq-borrar">
                    <button
                      type="button"
                      className={`admin-btn ${m.activo ? 'admin-btn--ghost' : 'admin-btn--primary'}`}
                      disabled={guardando === m.id || m.id === user?.usuario_id}
                      onClick={() => cambiar(m, { activo: !m.activo })}
                    >
                      {m.activo ? 'Dar de baja' : 'Reactivar'}
                    </button>
                    {!m.activo ? (
                      <button type="button" className="admin-btn admin-btn--ghost admin-btn--danger" disabled={guardando === m.id} onClick={() => setBorrando(m.id)} title="Sacarlo del equipo para siempre">
                        Borrar
                      </button>
                    ) : null}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
