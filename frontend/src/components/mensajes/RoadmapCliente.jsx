import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { borrarDoc, crearDoc, editarDoc, fetchRoadmap } from '../../api/roadmap'

const TIPOS = [
  ['revision', 'Revisión mensual'],
  ['inicial', 'Roadmap inicial'],
  ['complementario', 'Complementario'],
]
const hoy = () => new Date().toISOString().slice(0, 10)
const VACIO = { fathom_url: '', titulo: '', url: '', tipo: 'revision', area: '', pasos_total: '', paso_actual: '', principal: true }
const corta = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })

// Panel del coach: el roadmap del cliente. Se crea al salir de la llamada, empezando por el Fathom.
// pedido: cambia cada vez que el coach toca "Crear roadmap" en Acciones rápidas.
export default function RoadmapCliente({ clienteId, pedido = 0 }) {
  const [datos, setDatos] = useState(null)
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vivo = true
    setForm(null)
    setError('')
    fetchRoadmap(clienteId).then((d) => vivo && setDatos(d)).catch(() => vivo && setDatos(null))
    return () => {
      vivo = false
    }
  }, [clienteId])

  const seccion = useRef(null)
  // Solo un toque nuevo abre el formulario (al cambiar de cliente no se abre solo).
  const ultimoPedido = useRef(pedido)
  useEffect(() => {
    if (pedido === ultimoPedido.current) return
    ultimoPedido.current = pedido
    setError('')
    setForm({ ...VACIO, fecha: hoy() })
    setTimeout(() => seccion.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }, [pedido])

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    const num = (v) => (v === '' || v == null ? null : Number(v))
    if (!form.id && !form.fathom_url.trim()) {
      setGuardando(false)
      setError('Pegá primero el link de Fathom de la llamada.')
      return
    }
    const cuerpo = { ...form, pasos_total: num(form.pasos_total), paso_actual: num(form.paso_actual), area: form.area || null, fathom_url: form.fathom_url || null }
    delete cuerpo.id
    try {
      const d = form.id ? await editarDoc(form.id, cuerpo) : await crearDoc(clienteId, cuerpo)
      setDatos(d)
      setForm(null)
    } catch (err) {
      setError(err.message || 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  async function borrar() {
    setGuardando(true)
    try {
      setDatos(await borrarDoc(form.id))
      setForm(null)
    } catch (err) {
      setError(err.message || 'No se pudo borrar.')
    } finally {
      setGuardando(false)
    }
  }

  const docs = datos ? datos.grupos.flatMap((g) => g.docs.map((d) => ({ ...d, coach: g.coach }))) : []
  const principalId = datos?.principal?.id

  return (
    <section ref={seccion} className="msj-acciones rmc" aria-label="Roadmap del cliente">
      <div className="msj-acciones__cabeza">
        <p className="msj-seccion">Roadmap</p>
      </div>

      {form ? (
        <form className="rmc-form" onSubmit={guardar}>
          <label><span>Link de Fathom de la llamada</span><input value={form.fathom_url || ''} onChange={(e) => setForm({ ...form, fathom_url: e.target.value })} placeholder="https://fathom.video/…" autoFocus /></label>
          <small className="rmc-ayuda">El cliente va a poder ver la grabación desde su roadmap.</small>
          <label><span>Título</span><input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ventas" maxLength={80} /></label>
          <label><span>Link del documento de próximos pasos</span><input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://docs.google.com/…" /></label>
          <div className="rmc-fila">
            <label><span>Tipo</span><select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>{TIPOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
            <label><span>Fecha</span><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></label>
          </div>
          <label><span>Qué trabajás con el cliente</span><input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Setting y closing" maxLength={60} /></label>
          <div className="rmc-fila">
            <label><span>Paso actual</span><input type="number" min={0} max={50} value={form.paso_actual} onChange={(e) => setForm({ ...form, paso_actual: e.target.value })} /></label>
            <label><span>De</span><input type="number" min={0} max={50} value={form.pasos_total} onChange={(e) => setForm({ ...form, pasos_total: e.target.value })} /></label>
          </div>
          <label className="rmc-check"><input type="checkbox" checked={Boolean(form.principal)} onChange={(e) => setForm({ ...form, principal: e.target.checked })} /> Es el que tiene que seguir ahora</label>
          {error ? <p className="msj-acciones__error" role="alert">{error}</p> : null}
          <div className="rmc-botones">
            {form.id ? <button type="button" className="is-peligro" onClick={borrar} disabled={guardando}>Borrar</button> : null}
            <button type="button" onClick={() => setForm(null)}>Cancelar</button>
            <button type="submit" className="is-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      ) : null}

      {docs.length ? (
        <ul className="msj-acciones__lista">
          {docs.slice().reverse().map((d) => (
            <li key={d.id} className="msj-accion">
              <button
                type="button"
                className="msj-accion__boton"
                onClick={() => setForm({ id: d.id, fathom_url: d.fathom_url || '', titulo: d.titulo, url: d.url, tipo: d.tipo, fecha: d.fecha, area: d.area || '', pasos_total: d.pasos_total ?? '', paso_actual: d.paso_actual ?? '', principal: d.id === principalId })}
                title="Editar"
              >
                <span>{d.versiones > 1 ? `${d.titulo} · v${d.version}` : d.titulo}</span>
                <em className={d.id === principalId ? 'is-ok' : ''}>{d.id === principalId ? 'Seguir ahora' : d.estado === 'reemplazado' ? 'Reemplazado' : corta(d.fecha)}</em>
              </button>
            </li>
          ))}
        </ul>
      ) : !form ? (
        <p className="rmc-vacio">Todavía no hay roadmap. Crealo con “Crear roadmap” en Acciones rápidas al salir de la llamada.</p>
      ) : null}

      <Link className="rmc-ver" to={`/roadmap?cliente=${clienteId}`}>Ver el tablero como lo ve el cliente</Link>
    </section>
  )
}
