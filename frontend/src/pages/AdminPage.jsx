import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createAdminClase,
  createAdminPrograma,
  createAdminSeccion,
  deleteAdminClase,
  deleteAdminPrograma,
  deleteAdminRecurso,
  deleteAdminSeccion,
  fetchAdminPrograma,
  fetchAdminProgramas,
  updateAdminClase,
  updateAdminPrograma,
  updateAdminSeccion,
  uploadRecursoPdf,
} from '../api/admin'
import AppHeader from '../components/AppHeader'

const PROGRAMA_VACIO = {
  titulo: '',
  slug: '',
  descripcion: '',
  orden: 0,
  cover_url: '',
}

function normalizeUrl(url) {
  const trimmed = url?.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function isPdfRecurso(recurso) {
  return recurso?.tipo === 'pdf' || recurso?.url?.startsWith('/uploads/')
}

function normalizeDetalle(data) {
  if (!data?.secciones) return data
  return {
    ...data,
    secciones: data.secciones.map((seccion) => ({
      ...seccion,
      clases: (seccion.clases ?? []).map((clase) => ({
        ...clase,
        recursos: clase.recursos ?? [],
      })),
    })),
  }
}

function Field({ label, children }) {
  return (
    <label className="admin-field">
      <span className="admin-field__label">{label}</span>
      {children}
    </label>
  )
}

export default function AdminPage() {
  const [programas, setProgramas] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [formPrograma, setFormPrograma] = useState(PROGRAMA_VACIO)
  const [cargandoLista, setCargandoLista] = useState(true)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const loadLista = useCallback(async () => {
    setCargandoLista(true)
    try {
      const data = await fetchAdminProgramas()
      setProgramas(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar módulos.')
    } finally {
      setCargandoLista(false)
    }
  }, [])

  const loadDetalle = useCallback(async (programaId) => {
    setCargandoDetalle(true)
    setError('')
    try {
      const data = await fetchAdminPrograma(programaId)
      setDetalle(normalizeDetalle(data))
      setFormPrograma({
        titulo: data.titulo || '',
        slug: data.slug || '',
        descripcion: data.descripcion || '',
        orden: data.orden ?? 0,
        cover_url: data.cover_url || '',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el módulo.')
    } finally {
      setCargandoDetalle(false)
    }
  }, [])

  useEffect(() => {
    loadLista()
  }, [loadLista])

  useEffect(() => {
    if (selectedId) {
      loadDetalle(selectedId)
    } else {
      setDetalle(null)
      setFormPrograma(PROGRAMA_VACIO)
    }
  }, [selectedId, loadDetalle])

  async function handleNuevoPrograma() {
    setGuardando(true)
    setError('')
    try {
      const creado = await createAdminPrograma({
        titulo: 'Nuevo módulo',
        orden: programas.length + 1,
      })
      await loadLista()
      setSelectedId(creado.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el módulo.')
    } finally {
      setGuardando(false)
    }
  }

  async function handleGuardarPrograma() {
    if (!selectedId) return
    setGuardando(true)
    setError('')
    try {
      const actualizado = await updateAdminPrograma(selectedId, {
        titulo: formPrograma.titulo.trim(),
        slug: formPrograma.slug.trim() || null,
        descripcion: formPrograma.descripcion.trim() || null,
        orden: Number(formPrograma.orden) || 0,
        cover_url: formPrograma.cover_url.trim() || null,
      })
      setDetalle(actualizado)
      await loadLista()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  async function handleEliminarPrograma() {
    if (!selectedId) return
    if (!window.confirm('¿Eliminar este módulo y todo su contenido?')) return

    setGuardando(true)
    setError('')
    try {
      await deleteAdminPrograma(selectedId)
      setSelectedId(null)
      await loadLista()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.')
    } finally {
      setGuardando(false)
    }
  }

  async function handleNuevaSeccion() {
    if (!selectedId) return
    const titulo = window.prompt('Nombre de la sección:')
    if (!titulo?.trim()) return

    setGuardando(true)
    setError('')
    try {
      await createAdminSeccion(selectedId, {
        titulo: titulo.trim(),
        orden: detalle?.secciones?.length ?? 0,
      })
      await loadDetalle(selectedId)
      await loadLista()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la sección.')
    } finally {
      setGuardando(false)
    }
  }

  async function handleGuardarSeccion(seccion) {
    setGuardando(true)
    setError('')
    try {
      await updateAdminSeccion(seccion.id, {
        titulo: seccion.titulo,
        orden: Number(seccion.orden) || 0,
      })
      await loadDetalle(selectedId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la sección.')
    } finally {
      setGuardando(false)
    }
  }

  async function handleEliminarSeccion(seccionId) {
    if (!window.confirm('¿Eliminar esta sección y sus clases?')) return
    setGuardando(true)
    setError('')
    try {
      await deleteAdminSeccion(seccionId)
      await loadDetalle(selectedId)
      await loadLista()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.')
    } finally {
      setGuardando(false)
    }
  }

  async function handleNuevaClase(seccionId) {
    const titulo = window.prompt('Nombre de la clase:')
    if (!titulo?.trim()) return

    setGuardando(true)
    setError('')
    try {
      const seccion = detalle?.secciones?.find((s) => s.id === seccionId)
      await createAdminClase(seccionId, {
        titulo: titulo.trim(),
        orden: seccion?.clases?.length ?? 0,
      })
      await loadDetalle(selectedId)
      await loadLista()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la clase.')
    } finally {
      setGuardando(false)
    }
  }

  async function handleGuardarClase(clase) {
    const recursosPendientes = (clase.recursos || []).filter(
      (recurso) =>
        !isPdfRecurso(recurso) && recurso.titulo?.trim() && !recurso.url?.trim(),
    )
    if (recursosPendientes.length) {
      setError('Completá la URL de todos los links antes de guardar.')
      return
    }

    setGuardando(true)
    setError('')
    try {
      const recursos = (clase.recursos || [])
        .map((recurso, index) => {
          if (isPdfRecurso(recurso)) {
            if (!recurso.url?.trim()) return null
            return {
              titulo: recurso.titulo.trim(),
              url: recurso.url.trim(),
              orden: index,
            }
          }
          if (recurso.titulo?.trim() && recurso.url?.trim()) {
            return {
              titulo: recurso.titulo.trim(),
              url: normalizeUrl(recurso.url),
              orden: index,
            }
          }
          return null
        })
        .filter(Boolean)

      await updateAdminClase(clase.id, {
        titulo: clase.titulo,
        orden: Number(clase.orden) || 0,
        video_url: clase.video_url?.trim() || '',
        duracion_segundos: clase.duracion_segundos
          ? Number(clase.duracion_segundos)
          : null,
        descripcion: clase.descripcion?.trim() || null,
        recursos,
      })
      await loadDetalle(selectedId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la clase.')
    } finally {
      setGuardando(false)
    }
  }

  async function handleEliminarClase(claseId) {
    if (!window.confirm('¿Eliminar esta clase?')) return
    setGuardando(true)
    setError('')
    try {
      await deleteAdminClase(claseId)
      await loadDetalle(selectedId)
      await loadLista()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.')
    } finally {
      setGuardando(false)
    }
  }

  function updateSeccionLocal(seccionId, campo, valor) {
    setDetalle((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        secciones: prev.secciones.map((s) =>
          s.id === seccionId ? { ...s, [campo]: valor } : s,
        ),
      }
    })
  }

  function updateClaseLocal(seccionId, claseId, campo, valor) {
    setDetalle((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        secciones: prev.secciones.map((s) =>
          s.id === seccionId
            ? {
                ...s,
                clases: s.clases.map((c) =>
                  c.id === claseId ? { ...c, [campo]: valor } : c,
                ),
              }
            : s,
        ),
      }
    })
  }

  function addRecursoLocal(seccionId, claseId) {
    setDetalle((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        secciones: prev.secciones.map((s) =>
          s.id === seccionId
            ? {
                ...s,
                clases: s.clases.map((c) =>
                  c.id === claseId
                    ? {
                        ...c,
                        recursos: [
                          ...(c.recursos || []),
                          { titulo: '', url: '', orden: (c.recursos || []).length },
                        ],
                      }
                    : c,
                ),
              }
            : s,
        ),
      }
    })
  }

  function updateRecursoLocal(seccionId, claseId, index, campo, valor) {
    setDetalle((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        secciones: prev.secciones.map((s) =>
          s.id === seccionId
            ? {
                ...s,
                clases: s.clases.map((c) =>
                  c.id === claseId
                    ? {
                        ...c,
                        recursos: (c.recursos || []).map((recurso, i) =>
                          i === index ? { ...recurso, [campo]: valor } : recurso,
                        ),
                      }
                    : c,
                ),
              }
            : s,
        ),
      }
    })
  }

  function removeRecursoLocal(seccionId, claseId, index) {
    setDetalle((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        secciones: prev.secciones.map((s) =>
          s.id === seccionId
            ? {
                ...s,
                clases: s.clases.map((c) =>
                  c.id === claseId
                    ? {
                        ...c,
                        recursos: (c.recursos || []).filter((_, i) => i !== index),
                      }
                    : c,
                ),
              }
            : s,
        ),
      }
    })
  }

  async function handleSubirPdf(claseId, file) {
    if (!file) return

    setGuardando(true)
    setError('')
    try {
      const titulo = file.name.replace(/\.pdf$/i, '').trim()
      await uploadRecursoPdf(claseId, file, titulo || 'Documento')
      await loadDetalle(selectedId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el PDF.')
    } finally {
      setGuardando(false)
    }
  }

  async function handleEliminarRecurso(seccionId, claseId, recurso, index) {
    if (isPdfRecurso(recurso) && recurso.id) {
      if (!window.confirm('¿Eliminar este PDF?')) return

      setGuardando(true)
      setError('')
      try {
        await deleteAdminRecurso(recurso.id)
        await loadDetalle(selectedId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo eliminar el PDF.')
      } finally {
        setGuardando(false)
      }
      return
    }

    removeRecursoLocal(seccionId, claseId, index)
  }

  return (
    <div className="app-shell admin-page">
      <AppHeader />

      <main className="admin-page__main">
        <header className="admin-page__header">
          <div>
            <p className="admin-page__eyebrow">Panel admin</p>
            <h1 className="admin-page__title">Configuración de módulos</h1>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={handleNuevoPrograma}
            disabled={guardando}
          >
            + Nuevo módulo
          </button>
        </header>

        {error ? (
          <p className="admin-page__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="admin-page__layout">
          <aside className="admin-list">
            <h2 className="admin-list__title">Módulos</h2>
            {cargandoLista ? (
              <p className="admin-list__empty">Cargando…</p>
            ) : programas.length === 0 ? (
              <p className="admin-list__empty">No hay módulos todavía.</p>
            ) : (
              <ul className="admin-list__items">
                {programas.map((programa) => (
                  <li key={programa.id}>
                    <button
                      type="button"
                      className={`admin-list__item${selectedId === programa.id ? ' admin-list__item--active' : ''}`}
                      onClick={() => setSelectedId(programa.id)}
                    >
                      <span className="admin-list__item-title">{programa.titulo}</span>
                      <span className="admin-list__item-meta">
                        {programa.total_secciones} sec · {programa.total_clases} clases
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="admin-editor">
            {!selectedId ? (
              <div className="admin-editor__empty">
                <p>Seleccioná un módulo de la lista o creá uno nuevo.</p>
              </div>
            ) : cargandoDetalle ? (
              <div className="admin-editor__empty">
                <p>Cargando módulo…</p>
              </div>
            ) : (
              <>
                <div className="admin-editor__section">
                  <h2 className="admin-editor__heading">Datos del módulo</h2>
                  <div className="admin-editor__grid">
                    <Field label="Título">
                      <input
                        className="admin-input"
                        value={formPrograma.titulo}
                        onChange={(e) =>
                          setFormPrograma((p) => ({ ...p, titulo: e.target.value }))
                        }
                      />
                    </Field>
                    <Field label="Slug">
                      <input
                        className="admin-input"
                        value={formPrograma.slug}
                        onChange={(e) =>
                          setFormPrograma((p) => ({ ...p, slug: e.target.value }))
                        }
                        placeholder="start-here"
                      />
                    </Field>
                    <Field label="Orden">
                      <input
                        className="admin-input"
                        type="number"
                        value={formPrograma.orden}
                        onChange={(e) =>
                          setFormPrograma((p) => ({ ...p, orden: e.target.value }))
                        }
                      />
                    </Field>
                    <Field label="Cover URL">
                      <input
                        className="admin-input"
                        value={formPrograma.cover_url}
                        onChange={(e) =>
                          setFormPrograma((p) => ({ ...p, cover_url: e.target.value }))
                        }
                        placeholder="/modules/start-here.png"
                      />
                    </Field>
                    <Field label="Descripción">
                      <textarea
                        className="admin-input admin-input--area"
                        rows={3}
                        value={formPrograma.descripcion}
                        onChange={(e) =>
                          setFormPrograma((p) => ({
                            ...p,
                            descripcion: e.target.value,
                          }))
                        }
                      />
                    </Field>
                  </div>
                  <div className="admin-editor__actions">
                    <button
                      type="button"
                      className="admin-btn admin-btn--primary"
                      onClick={handleGuardarPrograma}
                      disabled={guardando}
                    >
                      Guardar módulo
                    </button>
                    <Link
                      to={`/classroom/${selectedId}`}
                      className="admin-btn admin-btn--ghost"
                      target="_blank"
                    >
                      Ver en classroom
                    </Link>
                    <button
                      type="button"
                      className="admin-btn admin-btn--danger"
                      onClick={handleEliminarPrograma}
                      disabled={guardando}
                    >
                      Eliminar módulo
                    </button>
                  </div>
                </div>

                <div className="admin-editor__section">
                  <div className="admin-editor__section-head">
                    <h2 className="admin-editor__heading">Secciones y clases</h2>
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      onClick={handleNuevaSeccion}
                      disabled={guardando}
                    >
                      + Sección
                    </button>
                  </div>

                  {!detalle?.secciones?.length ? (
                    <p className="admin-editor__hint">
                      Este módulo no tiene secciones. Agregá una para empezar.
                    </p>
                  ) : (
                    detalle.secciones.map((seccion) => (
                      <div key={seccion.id} className="admin-block">
                        <div className="admin-block__head">
                          <input
                            className="admin-input admin-input--inline"
                            value={seccion.titulo}
                            onChange={(e) =>
                              updateSeccionLocal(seccion.id, 'titulo', e.target.value)
                            }
                          />
                          <input
                            className="admin-input admin-input--orden"
                            type="number"
                            value={seccion.orden}
                            onChange={(e) =>
                              updateSeccionLocal(seccion.id, 'orden', e.target.value)
                            }
                            title="Orden"
                          />
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost admin-btn--sm"
                            onClick={() => handleGuardarSeccion(seccion)}
                            disabled={guardando}
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--danger admin-btn--sm"
                            onClick={() => handleEliminarSeccion(seccion.id)}
                            disabled={guardando}
                          >
                            Eliminar
                          </button>
                        </div>

                        <ul className="admin-clases">
                          {seccion.clases.map((clase) => (
                            <li key={clase.id} className="admin-clase">
                              <div className="admin-clase__row">
                                <input
                                  className="admin-input"
                                  value={clase.titulo}
                                  onChange={(e) =>
                                    updateClaseLocal(
                                      seccion.id,
                                      clase.id,
                                      'titulo',
                                      e.target.value,
                                    )
                                  }
                                  placeholder="Título de la clase"
                                />
                                <input
                                  className="admin-input admin-input--orden"
                                  type="number"
                                  value={clase.orden}
                                  onChange={(e) =>
                                    updateClaseLocal(
                                      seccion.id,
                                      clase.id,
                                      'orden',
                                      e.target.value,
                                    )
                                  }
                                  title="Orden"
                                />
                              </div>
                              <input
                                className="admin-input"
                                value={clase.video_url || ''}
                                onChange={(e) =>
                                  updateClaseLocal(
                                    seccion.id,
                                    clase.id,
                                    'video_url',
                                    e.target.value,
                                  )
                                }
                                placeholder="URL del video (YouTube, Vimeo, Loom o MP4)"
                              />
                              <label className="admin-field">
                                <span className="admin-field__label">
                                  Descripción
                                </span>
                                <textarea
                                  className="admin-input admin-input--area admin-input--desc"
                                  rows={6}
                                  value={clase.descripcion || ''}
                                  onChange={(e) =>
                                    updateClaseLocal(
                                      seccion.id,
                                      clase.id,
                                      'descripcion',
                                      e.target.value,
                                    )
                                  }
                                  placeholder={
                                    '**Intro en negrita**\n\n---\n\nPárrafo normal. Usá **negrita** inline.'
                                  }
                                />
                              </label>
                              <div className="admin-recursos">
                                <div className="admin-recursos__head">
                                  <span className="admin-field__label">Recursos</span>
                                  <div className="admin-recursos__actions">
                                    <button
                                      type="button"
                                      className="admin-btn admin-btn--ghost admin-btn--sm"
                                      onClick={() =>
                                        addRecursoLocal(seccion.id, clase.id)
                                      }
                                      disabled={guardando}
                                    >
                                      + Link
                                    </button>
                                    <label className="admin-btn admin-btn--ghost admin-btn--sm admin-btn--file">
                                      + Subir PDF
                                      <input
                                        type="file"
                                        accept=".pdf,application/pdf"
                                        hidden
                                        disabled={guardando}
                                        onChange={(e) => {
                                          const file = e.target.files?.[0]
                                          e.target.value = ''
                                          if (file) {
                                            handleSubirPdf(clase.id, file)
                                          }
                                        }}
                                      />
                                    </label>
                                  </div>
                                </div>
                                {(clase.recursos || []).map((recurso, recursoIndex) =>
                                  isPdfRecurso(recurso) ? (
                                    <div
                                      key={recurso.id ?? `${clase.id}-pdf-${recursoIndex}`}
                                      className="admin-recurso admin-recurso--pdf"
                                    >
                                      <span className="admin-recurso__badge">PDF</span>
                                      <span className="admin-recurso__name">{recurso.titulo}</span>
                                      {recurso.url ? (
                                        <a
                                          href={recurso.url}
                                          className="admin-recurso__link"
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          Ver
                                        </a>
                                      ) : null}
                                      <button
                                        type="button"
                                        className="admin-btn admin-btn--danger admin-btn--sm"
                                        onClick={() =>
                                          handleEliminarRecurso(
                                            seccion.id,
                                            clase.id,
                                            recurso,
                                            recursoIndex,
                                          )
                                        }
                                        disabled={guardando}
                                      >
                                        Quitar
                                      </button>
                                    </div>
                                  ) : (
                                    <div
                                      key={`${clase.id}-recurso-${recursoIndex}`}
                                      className="admin-recurso"
                                    >
                                      <input
                                        className="admin-input"
                                        value={recurso.titulo}
                                        onChange={(e) =>
                                          updateRecursoLocal(
                                            seccion.id,
                                            clase.id,
                                            recursoIndex,
                                            'titulo',
                                            e.target.value,
                                          )
                                        }
                                        placeholder="Nombre (ej. Presentación)"
                                      />
                                      <input
                                        className="admin-input"
                                        value={recurso.url}
                                        onChange={(e) =>
                                          updateRecursoLocal(
                                            seccion.id,
                                            clase.id,
                                            recursoIndex,
                                            'url',
                                            e.target.value,
                                          )
                                        }
                                        placeholder="https://drive.google.com/..."
                                      />
                                      <button
                                        type="button"
                                        className="admin-btn admin-btn--danger admin-btn--sm"
                                        onClick={() =>
                                          handleEliminarRecurso(
                                            seccion.id,
                                            clase.id,
                                            recurso,
                                            recursoIndex,
                                          )
                                        }
                                        disabled={guardando}
                                      >
                                        Quitar
                                      </button>
                                    </div>
                                  ),
                                )}
                                <p className="admin-recursos__hint">
                                  Los PDFs se guardan en el servidor al subirlos. Los links se
                                  guardan con Guardar en la clase.
                                </p>
                              </div>
                              <div className="admin-clase__row">
                                <input
                                  className="admin-input"
                                  type="number"
                                  value={clase.duracion_segundos ?? ''}
                                  onChange={(e) =>
                                    updateClaseLocal(
                                      seccion.id,
                                      clase.id,
                                      'duracion_segundos',
                                      e.target.value,
                                    )
                                  }
                                  placeholder="Duración (segundos)"
                                />
                                <button
                                  type="button"
                                  className="admin-btn admin-btn--primary admin-btn--sm"
                                  onClick={() => handleGuardarClase(clase)}
                                  disabled={guardando}
                                >
                                  Guardar
                                </button>
                                <button
                                  type="button"
                                  className="admin-btn admin-btn--danger admin-btn--sm"
                                  onClick={() => handleEliminarClase(clase.id)}
                                  disabled={guardando}
                                >
                                  Eliminar
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>

                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          onClick={() => handleNuevaClase(seccion.id)}
                          disabled={guardando}
                        >
                          + Clase
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
