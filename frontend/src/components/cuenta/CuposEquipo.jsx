import { useEffect, useState } from 'react'
import { fetchCupos, guardarCupos } from '../../api/equipo'

const NOMBRES = { mentoria: 'Mentoría', boost: 'Boost', advantage: 'Advantage', mid: 'Mid Level', entry: 'Entry Level' }

// Solo admins: cuántas personas de su equipo puede sumar cada cliente según su plan.
export default function CuposEquipo() {
  const [datos, setDatos] = useState(null)
  const [valores, setValores] = useState({})
  const [estado, setEstado] = useState('')

  useEffect(() => {
    fetchCupos()
      .then((d) => {
        setDatos(d)
        setValores(Object.fromEntries(d.planes.map((p) => [p.plan, p.maximo])))
      })
      .catch((e) => setEstado(e.message || 'No se pudo cargar.'))
  }, [])

  async function guardar(e) {
    e.preventDefault()
    setEstado('Guardando…')
    try {
      const d = await guardarCupos(Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, Number(v)])))
      setDatos(d)
      setEstado('Guardado')
      setTimeout(() => setEstado(''), 2000)
    } catch (err) {
      setEstado(err.message || 'No se pudo guardar.')
    }
  }

  if (!datos) return <p className="cuenta__cargando">{estado || 'Cargando…'}</p>
  const cambiado = datos.planes.some((p) => Number(valores[p.plan]) !== p.maximo)

  return (
    <form className="cuenta-cupos" onSubmit={guardar}>
      <p className="cuenta-equipo__ayuda">Cuántas personas de su equipo (socios, setters, closers) puede sumar cada cliente al chat.</p>
      <table>
        <thead>
          <tr>
            <th>Plan</th>
            <th>Cupo</th>
            <th>Sumados</th>
          </tr>
        </thead>
        <tbody>
          {datos.planes.map((p) => (
            <tr key={p.plan}>
              <td>{NOMBRES[p.plan] || p.plan}</td>
              <td>
                <input type="number" min={0} max={100} value={valores[p.plan] ?? ''} onChange={(e) => setValores({ ...valores, [p.plan]: e.target.value })} aria-label={`Cupo de ${NOMBRES[p.plan] || p.plan}`} />
              </td>
              <td className="is-num">{p.miembros}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cuenta-equipo__pie">
        <span>{estado}</span>
        <button type="submit" className="cuenta-boton" disabled={!cambiado}>Guardar</button>
      </div>
    </form>
  )
}
