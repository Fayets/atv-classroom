import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchToolsAdmin, guardarToolsAdmin } from '../../api/tools'
import '../../styles/permisos.css'
import '../../styles/tools.css'

// Tools en el admin: el interruptor que muestra u oculta la sección a los clientes, y por cada tool su estado
// en cada plan (incluida, paga u oculta) y su precio.
const NOMBRE = { incluida: 'Incluida', paga: 'Paga', oculta: 'Oculta' }

export default function ToolsAdmin() {
  const [datos, setDatos] = useState(null)
  const [cambios, setCambios] = useState({}) // "plan|tool" → estado
  const [precios, setPrecios] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchToolsAdmin().then(setDatos).catch((e) => setError(e.message))
  }, [])

  async function guardar(body) {
    setGuardando(true)
    setError('')
    try {
      setDatos(await guardarToolsAdmin(body))
      return true
    } catch (e) {
      setError(e.message || 'No se pudo guardar.')
      return false
    } finally {
      setGuardando(false)
    }
  }

  async function guardarTabla() {
    const lista = Object.entries(cambios).map(([k, estado]) => {
      const [plan, tool] = k.split('|')
      return { plan, tool, estado }
    })
    if (await guardar({ cambios: lista, precios })) {
      setCambios({})
      setPrecios({})
    }
  }

  if (!datos) return <p className="pm-cargando">{error || 'Cargando tools…'}</p>
  const pendientes = Object.keys(cambios).length + Object.keys(precios).length
  const siguiente = (e) => datos.estados[(datos.estados.indexOf(e) + 1) % datos.estados.length]

  return (
    <div className="tl-admin">
      <div className="tl-toggle">
        <div>
          <b>Mostrar Tools a los clientes</b>
          <small>{datos.visible ? 'Los clientes ven la pestaña Tools.' : 'Oculta: solo la ve el equipo.'} <Link to="/tools">Ver cómo queda</Link></small>
        </div>
        <button
          type="button"
          className={`pm-switch is-${datos.visible ? 'si' : 'no'}`}
          role="switch"
          aria-checked={datos.visible}
          aria-label="Mostrar Tools a los clientes"
          disabled={guardando}
          onClick={() => guardar({ visible: !datos.visible })}
        >
          <span />
        </button>
      </div>

      <section className="pm-panel">
        <div className="pm-tabla" role="table">
          <div className="pm-fila pm-cabeza" role="row">
            <span role="columnheader">Tool</span>
            <span role="columnheader">Precio</span>
            {datos.planes.map((p) => <span key={p.id} role="columnheader">{p.nombre}</span>)}
          </div>
          {datos.tools.map((t) => (
            <div key={t.id} className="pm-fila" role="row">
              <div className="pm-que">
                <b>{t.nombre}</b>
                <small>{t.descripcion}</small>
              </div>
              <div className="pm-celda" role="cell">
                <input
                  className="tl-precio"
                  value={precios[t.id] ?? t.precio}
                  placeholder="USD 97/mes"
                  aria-label={`Precio de ${t.nombre}`}
                  onChange={(e) => setPrecios((p) => ({ ...p, [t.id]: e.target.value }))}
                />
              </div>
              {datos.planes.map((p) => {
                const k = `${p.id}|${t.id}`
                const v = cambios[k] ?? t.por_plan[p.id]
                return (
                  <div key={p.id} className="pm-celda" role="cell">
                    <button type="button" className={`tl-estado is-${v}`} aria-label={`${t.nombre} · ${p.nombre}: ${NOMBRE[v]}`}
                      onClick={() => setCambios((c) => ({ ...c, [k]: siguiente(v) }))}>
                      {NOMBRE[v]}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        {error ? <p className="pm-error" role="alert">{error}</p> : null}
        <div className="pm-pie">
          <span>{pendientes ? <><b>{pendientes} {pendientes === 1 ? 'cambio' : 'cambios'}</b> sin guardar</> : null}</span>
          <button type="button" className="pm-guardar" disabled={!pendientes || guardando} onClick={guardarTabla}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </section>
    </div>
  )
}
