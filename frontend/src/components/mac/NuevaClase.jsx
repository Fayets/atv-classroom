import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createAdminClase, createAdminSeccion, fetchAdminPrograma, fetchAdminProgramas } from '../../api/admin'
import { getVideoEmbedInfo } from '../../utils/video'

// Cargar una clase nueva desde el escritorio del admin: se elige el módulo (y la sección, si tiene varias),
// se pega el link del video y queda publicada, arriba de todo o al final.
export default function NuevaClase({ onCerrar, onVerModulo }) {
  const [modulos, setModulos] = useState(null)
  const [programaId, setProgramaId] = useState('')
  const [secciones, setSecciones] = useState(null)
  const [seccionId, setSeccionId] = useState('')
  const [form, setForm] = useState({ titulo: '', video_url: '', descripcion: '', arriba: false })
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [hecha, setHecha] = useState(null)
  const campo = useRef(null)

  useEffect(() => {
    fetchAdminProgramas()
      .then((lista) => setModulos([...lista].sort((a, b) => a.orden - b.orden)))
      .catch((e) => setError(e.message || 'No se pudieron traer los módulos.'))
    campo.current?.focus()
  }, [])

  useEffect(() => {
    setSecciones(null)
    setSeccionId('')
    if (!programaId) return
    let vivo = true
    fetchAdminPrograma(programaId)
      .then((p) => {
        if (!vivo) return
        const lista = [...(p.secciones || [])].sort((a, b) => a.orden - b.orden)
        setSecciones(lista)
        setSeccionId(lista[0] ? String(lista[0].id) : '')
      })
      .catch((e) => vivo && setError(e.message || 'No se pudo abrir el módulo.'))
    return () => {
      vivo = false
    }
  }, [programaId])

  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  const link = form.video_url.trim()
  const linkRaro = link && !getVideoEmbedInfo(link)
  const modulo = modulos?.find((m) => String(m.id) === programaId)

  async function crear(e) {
    e.preventDefault()
    if (!programaId) return setError('Elegí a qué módulo va.')
    if (!form.titulo.trim()) return setError('Poné el título de la clase.')
    if (link && !/^https?:\/\//.test(link)) return setError('El link del video tiene que empezar con https://')
    setOcupado(true)
    setError('')
    try {
      let seccion = secciones.find((s) => String(s.id) === seccionId)
      if (!seccion) seccion = await createAdminSeccion(programaId, { titulo: 'CLASES', orden: 1 })
      const ordenes = (seccion.clases || []).map((c) => c.orden)
      const orden = form.arriba ? (ordenes.length ? Math.min(...ordenes) - 1 : 1) : ordenes.length ? Math.max(...ordenes) + 1 : 1
      const clase = await createAdminClase(seccion.id, {
        titulo: form.titulo.trim(),
        orden,
        video_url: link || null,
        descripcion: form.descripcion.trim() || null,
      })
      setHecha({ ...clase, modulo: modulo?.titulo, programaId })
    } catch (err) {
      setError(err.message || 'No se pudo cargar la clase.')
    } finally {
      setOcupado(false)
    }
  }

  function otra() {
    setHecha(null)
    setForm({ titulo: '', video_url: '', descripcion: '', arriba: form.arriba })
    // Vuelve a leer el módulo para que la próxima quede en el orden correcto.
    const id = programaId
    setProgramaId('')
    setTimeout(() => setProgramaId(id), 0)
  }

  return createPortal(
    <div className="msj-modal__fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="msj-modal alta" role="dialog" aria-modal="true" aria-labelledby="nc-titulo">
        {!hecha ? (
          <form onSubmit={crear}>
            <h2 id="nc-titulo">Nueva clase</h2>
            <label className="msj-modal__campo">
              <span>Módulo</span>
              <select ref={campo} value={programaId} onChange={(e) => setProgramaId(e.target.value)} disabled={!modulos}>
                <option value="">{modulos ? 'Elegí el módulo' : 'Cargando módulos…'}</option>
                {(modulos || []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.titulo} · {m.total_clases} {m.total_clases === 1 ? 'clase' : 'clases'}
                  </option>
                ))}
              </select>
            </label>
            {secciones && secciones.length > 1 ? (
              <label className="msj-modal__campo">
                <span>Sección</span>
                <select value={seccionId} onChange={(e) => setSeccionId(e.target.value)}>
                  {secciones.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.titulo} · {s.clases.length} {s.clases.length === 1 ? 'clase' : 'clases'}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="msj-modal__campo">
              <span>Título</span>
              <input type="text" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} maxLength={160} placeholder="Cómo armar tu secuencia de historias" />
            </label>
            <label className="msj-modal__campo">
              <span>Link del video</span>
              <input type="url" inputMode="url" value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="YouTube, Vimeo, Loom, Fathom, Drive o MP4" />
            </label>
            {linkRaro ? <p className="msj-modal__ayuda">Ese link no se puede ver adentro del classroom: la clase va a mostrar el botón para abrirlo afuera.</p> : null}
            <label className="msj-modal__campo">
              <span>Descripción (opcional)</span>
              <textarea rows={3} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} maxLength={2000} />
            </label>
            <div className="nc-lugar" role="radiogroup" aria-label="Dónde queda en el módulo">
              <button type="button" role="radio" aria-checked={!form.arriba} className={!form.arriba ? 'is-on' : ''} onClick={() => setForm({ ...form, arriba: false })}>
                Al final
              </button>
              <button type="button" role="radio" aria-checked={form.arriba} className={form.arriba ? 'is-on' : ''} onClick={() => setForm({ ...form, arriba: true })}>
                Arriba de todo
              </button>
            </div>
            {error ? <p className="msj-modal__error" role="alert">{error}</p> : null}
            <div className="msj-modal__botones">
              <button type="button" onClick={onCerrar}>Cancelar</button>
              <button type="submit" className="is-primario" disabled={ocupado || !programaId || !secciones}>{ocupado ? 'Cargando…' : 'Cargar clase'}</button>
            </div>
          </form>
        ) : (
          <div>
            <h2 id="nc-titulo">Clase cargada</h2>
            <p className="msj-modal__ayuda">
              «{hecha.titulo}» ya está en {hecha.modulo ? `«${hecha.modulo}»` : 'el módulo'}, {form.arriba ? 'arriba de todo' : 'al final'}.
            </p>
            <div className="msj-modal__botones">
              <button type="button" onClick={otra}>Cargar otra</button>
              {onVerModulo ? (
                <button type="button" onClick={() => onVerModulo(hecha.programaId)}>Ver el módulo</button>
              ) : null}
              <button type="button" className="is-primario" onClick={onCerrar}>Listo</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
