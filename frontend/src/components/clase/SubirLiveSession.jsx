import { useEffect, useState } from 'react'
import { fetchModulosLive, subirLiveSession } from '../../api/liveSessions'
import { getVideoEmbedInfo } from '../../utils/video'

const hoy = () => new Date().toLocaleDateString('en-CA') // AAAA-MM-DD en la hora local

// Para el equipo: pegar el link de la grabación (Fathom, YouTube, Loom, Drive…) y que quede como clase nueva
// arriba de todo en el módulo de live sessions.
export default function SubirLiveSession({ programaId, onSubida }) {
  const [abierto, setAbierto] = useState(false)
  const [modulos, setModulos] = useState([])
  const [form, setForm] = useState({ programa_id: programaId, titulo: '', url: '', fecha: hoy(), descripcion: '' })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (abierto && !modulos.length) fetchModulosLive().then(setModulos).catch(() => setModulos([]))
  }, [abierto, modulos.length])

  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))
  const seVe = form.url.trim() ? Boolean(getVideoEmbedInfo(form.url)) : null

  async function enviar(e) {
    e.preventDefault()
    setEnviando(true)
    setError('')
    try {
      const clase = await subirLiveSession({ ...form, programa_id: Number(form.programa_id), descripcion: form.descripcion || null })
      setAbierto(false)
      setForm({ programa_id: programaId, titulo: '', url: '', fecha: hoy(), descripcion: '' })
      onSubida?.(clase)
    } catch (err) {
      setError(err.message || 'No se pudo subir.')
    } finally {
      setEnviando(false)
    }
  }

  if (!abierto) {
    return (
      <button type="button" className="pc-btn ls-abrir" onClick={() => setAbierto(true)}>
        + Subir live session
      </button>
    )
  }
  return (
    <div className="ls-fondo" onClick={() => !enviando && setAbierto(false)}>
      <form className="ls-form" onSubmit={enviar} onClick={(e) => e.stopPropagation()}>
        <h2>Subir live session</h2>
        <label>
          Módulo
          <select value={form.programa_id} onChange={cambiar('programa_id')}>
            {(modulos.length ? modulos : [{ id: programaId, titulo: 'Este módulo' }]).map((m) => (
              <option key={m.id} value={m.id}>
                {m.titulo}
              </option>
            ))}
          </select>
        </label>
        <label>
          Título de la clase
          <input value={form.titulo} onChange={cambiar('titulo')} placeholder="Ej.: Cómo cerrar el lo voy a pensar" required maxLength={160} autoFocus />
        </label>
        <label>
          Link de la grabación
          <input value={form.url} onChange={cambiar('url')} placeholder="Fathom, YouTube, Loom, Vimeo o Drive" required inputMode="url" />
          {seVe === false ? <small>Este link no se puede ver dentro del classroom: va a quedar el botón para abrirlo.</small> : null}
          {seVe ? <small className="is-ok">Se va a ver adentro de la clase.</small> : null}
        </label>
        <label>
          Fecha de la sesión
          <input type="date" value={form.fecha} onChange={cambiar('fecha')} />
        </label>
        <label>
          <span className="ls-etq">
            De qué se habló <em>(opcional)</em>
          </span>
          <textarea value={form.descripcion} onChange={cambiar('descripcion')} rows={3} maxLength={2000} />
        </label>
        {error ? <p className="ls-error">{error}</p> : null}
        <div className="ls-botones">
          <button type="button" className="pc-btn pc-btn--ghost" onClick={() => setAbierto(false)} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" className="pc-btn" disabled={enviando}>
            {enviando ? 'Subiendo…' : 'Subir'}
          </button>
        </div>
      </form>
    </div>
  )
}
