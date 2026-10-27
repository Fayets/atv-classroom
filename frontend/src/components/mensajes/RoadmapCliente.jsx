import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { borrarDoc, crearDoc, editarDoc, fetchRoadmap } from '../../api/roadmap'
import RoadmapIA from './RoadmapIA'

const TIPOS = [
  ['revision', 'Revisión mensual'],
  ['inicial', 'Roadmap inicial'],
  ['complementario', 'Complementario'],
]
const hoy = () => new Date().toISOString().slice(0, 10)
const VACIO = { fathom_url: '', titulo: '', url: '', pasos_txt: '', tipo: 'revision', area: '', pasos_total: '', paso_actual: '', principal: true }
// Pasos como texto, uno por línea; los que hace ATV van con "ATV:" adelante.
const aTexto = (pasos) => (pasos || []).map((p) => (p.quien === 'atv' ? `ATV: ${p.texto}` : p.texto)).join('\n')
const deTexto = (t) => t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => (/^atv:/i.test(l) ? { texto: l.replace(/^atv:\s*/i, ''), quien: 'atv' } : { texto: l, quien: 'cliente' }))
const corta = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })

// Panel del coach: el roadmap del cliente. Se crea al salir de la llamada, empezando por el Fathom.
// pedido: cambia cada vez que el coach toca "Crear roadmap" en Acciones rápidas.
// llamadaId: viene de la carpeta Llamadas ("Crear roadmap" en una llamada): abre el armado con esa llamada.
export default function RoadmapCliente({ clienteId, canalId, cliente = 'el cliente', pedido = 0, llamadaId = null, onLlamadaUsada }) {
  const [datos, setDatos] = useState(null)
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [conIA, setConIA] = useState(false)
  const [aviso, setAviso] = useState('')

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
    setForm(null)
    setConIA(true)
  }, [pedido])

  const [llamadaIA, setLlamadaIA] = useState(null)
  useEffect(() => {
    if (!llamadaId) return
    setLlamadaIA(llamadaId)
    setForm(null)
    setConIA(true)
    onLlamadaUsada?.()
  }, [llamadaId]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const pasos = deTexto(form.pasos_txt || '')
    if (pasos.length || form.tenia_pasos) cuerpo.pasos = pasos
    delete cuerpo.id
    delete cuerpo.pasos_txt
    delete cuerpo.tenia_pasos
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

  // Borrar desde la lista: el tacho de cada fila pide confirmar ahí mismo.
  const [aBorrar, setABorrar] = useState(null)
  async function borrarDeLista(id) {
    setGuardando(true)
    try {
      setDatos(await borrarDoc(id))
      setABorrar(null)
      if (form?.id === id) setForm(null)
    } catch (err) {
      setError(err.message || 'No se pudo borrar.')
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

  // Sin roadmaps no se muestra la sección (se crea desde Acciones rápidas); el armado con IA igual se abre.
  const vacio = !docs.length && !form && !aviso
  return (
    <section ref={seccion} className={`msj-acciones rmc${vacio ? ' is-vacia' : ''}`} aria-label="Roadmap del cliente">
      <div className="msj-acciones__cabeza">
        <p className="msj-seccion">Roadmap</p>
      </div>

      {aviso ? <p className="rmc-aviso" role="status">{aviso}</p> : null}
      {conIA ? (
        <RoadmapIA
          clienteId={clienteId}
          canalId={canalId}
          cliente={cliente}
          llamadaId={llamadaIA}
          onCerrar={() => {
            setConIA(false)
            setLlamadaIA(null)
          }}
          onManual={() => {
            setConIA(false)
            setForm({ ...VACIO, fecha: hoy() })
            setTimeout(() => seccion.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
          }}
          onGuardado={(d, enviado) => {
            setDatos(d)
            setConIA(false)
            setLlamadaIA(null)
            setAviso(enviado ? 'Roadmap guardado y mensaje enviado.' : 'Roadmap guardado.')
            setTimeout(() => setAviso(''), 4000)
          }}
        />
      ) : null}
      {form ? (
        <form className="rmc-form" onSubmit={guardar}>
          <label><span>Link de Fathom de la llamada</span><input value={form.fathom_url || ''} onChange={(e) => setForm({ ...form, fathom_url: e.target.value })} placeholder="https://fathom.video/…" autoFocus /></label>
          <small className="rmc-ayuda">El cliente va a poder ver la grabación desde su roadmap.</small>
          <label><span>Título</span><input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ventas" maxLength={80} /></label>
          <label><span>Próximos pasos (uno por línea)</span><textarea rows={5} value={form.pasos_txt} onChange={(e) => setForm({ ...form, pasos_txt: e.target.value })} placeholder={'Grabá 3 historias por día\nATV: Reunión con Juampi'} /></label>
          <small className="rmc-ayuda">Los que hace ATV, con “ATV:” adelante. Lo tildado sigue tildado.</small>
          <label><span>Link de un documento (opcional)</span><input value={form.url || ''} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://docs.google.com/…" /></label>
          <div className="rmc-fila">
            <label><span>Tipo</span><select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>{TIPOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
            <label><span>Fecha</span><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></label>
          </div>
          <label><span>Qué trabajás con el cliente</span><input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Setting y closing" maxLength={60} /></label>
          {!form.pasos_txt?.trim() ? (
            <div className="rmc-fila">
              <label><span>Paso actual</span><input type="number" min={0} max={50} value={form.paso_actual} onChange={(e) => setForm({ ...form, paso_actual: e.target.value })} /></label>
              <label><span>De</span><input type="number" min={0} max={50} value={form.pasos_total} onChange={(e) => setForm({ ...form, pasos_total: e.target.value })} /></label>
            </div>
          ) : null}
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
            <li key={d.id} className="msj-accion rmc-item">
              {aBorrar === d.id ? (
                <div className="rmc-confirmar" role="alert">
                  <span>¿Borrar «{d.titulo}»?</span>
                  <button type="button" className="is-peligro" onClick={() => borrarDeLista(d.id)} disabled={guardando}>{guardando ? 'Borrando…' : 'Borrar'}</button>
                  <button type="button" onClick={() => setABorrar(null)}>No</button>
                </div>
              ) : (
              <>
              <button
                type="button"
                className="msj-accion__boton"
                onClick={() => setForm({ id: d.id, fathom_url: d.fathom_url || '', titulo: d.titulo, url: d.url || '', pasos_txt: aTexto(d.pasos), tenia_pasos: Boolean(d.pasos?.length), tipo: d.tipo, fecha: d.fecha, area: d.area || '', pasos_total: d.pasos?.length ? '' : d.pasos_total ?? '', paso_actual: d.pasos?.length ? '' : d.paso_actual ?? '', principal: d.id === principalId })}
                title="Editar"
              >
                <span>{d.versiones > 1 ? `${d.titulo} · v${d.version}` : d.titulo}</span>
                <em className={d.id === principalId ? 'is-ok' : ''} title={d.pasos?.length ? `${d.paso_actual} de ${d.pasos_total} pasos hechos` : undefined}>{d.id === principalId ? 'Seguir ahora' : d.estado === 'reemplazado' ? 'Reemplazado' : corta(d.fecha)}</em>
              </button>
              <button type="button" className="rmc-tacho" onClick={() => setABorrar(d.id)} aria-label={`Borrar ${d.titulo}`} title="Borrar">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" /></svg>
              </button>
              </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {docs.length ? <Link className="rmc-ver" to={`/roadmap?cliente=${clienteId}`}>Ver el tablero como lo ve el cliente</Link> : null}
    </section>
  )
}
