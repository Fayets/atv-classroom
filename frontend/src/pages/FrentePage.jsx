import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { actualizarFrente, enviarConsultaCoach, fetchFrente } from '../api/frentes'
import AppHeader from '../components/AppHeader'
import { Check, Chevron, Recursos, Video } from '../components/frentes/piezas'
import { tipoRecurso, tituloLindo, urlRecurso } from '../utils/frentes'
import '../styles/frentes.css'

// Un frente = un problema del negocio trabajado con el método ATV:
// resolver (clases) → documentar (las plantillas de SOP, completas con tu negocio) → revisarlas con el coach.

const PASOS = ['Resolver', 'Documentar', 'Revisar']

function ClaseItem({ c, aplicada, abierta, onAbrir, onAplicada, guardando }) {
  return (
    <div className={`im-clase${abierta ? ' is-open' : ''}`}>
      <button type="button" className="im-clase__head" onClick={onAbrir} aria-expanded={abierta}>
        <Check done={aplicada} />
        <span>{tituloLindo(c.titulo)}</span>
        <Chevron dir={abierta ? 'down' : 'right'} />
      </button>
      {abierta ? (
        <div className="im-clase__body">
          <Video clase={c} />
          {c.resumen ? (
            <div className="im-clase__brief">
              <p>{c.resumen}</p>
              {c.claves?.length ? (
                <ul>
                  {c.claves.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <button type="button" className={`pc-btn ${aplicada ? 'pc-btn--ghost' : 'pc-complete'}`} onClick={onAplicada} disabled={guardando}>
            <Check done={aplicada} /> {aplicada ? 'Aplicada' : 'Ya la apliqué'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

// Las plantillas se llaman "Documento Google 1": se nombran por la clase de donde salen.
function nombrePlantilla(p, repetidas) {
  const generico = /^(documento|planilla|formulario) google/i.test(p.titulo)
  if (!generico) return p.titulo
  const base = `${tipoRecurso(p).label.replace(' de Google', '')} de «${tituloLindo(p.clase_titulo)}»`
  const n = p.titulo.match(/(\d+)\s*$/)
  return repetidas[p.clase_id] > 1 && n ? `${base} · ${n[1]}` : base
}

// Una fila: la plantilla (se abre una copia) y, al lado, el link de tu versión completa.
function PlantillaSop({ p, nombre, link, guardando, onGuardar }) {
  const [editando, setEditando] = useState(!link)
  const [valor, setValor] = useState(link ?? '')
  const t = tipoRecurso(p)
  const id = `im-sop-${p.id}`

  useEffect(() => {
    setValor(link ?? '')
    setEditando(!link)
  }, [link])

  return (
    <li className={`im-plantilla${link ? ' is-ok' : ''}`}>
      <a href={urlRecurso(p.url)} target="_blank" rel="noopener noreferrer" className="im-plantilla__src">
        <span className={`pc-recurso__tag pc-tag--${t.tag.toLowerCase()}`}>{t.tag}</span>
        <span className="im-plantilla__txt">
          <b>{nombre}</b>
          <small>{p.url.includes('/copy') ? 'Plantilla · se abre una copia para vos' : 'Plantilla · hacé una copia'}</small>
        </span>
        <Chevron />
      </a>
      <div className="im-plantilla__tuya">
        {editando ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (!valor.trim()) return
              if (await onGuardar(valor.trim())) setEditando(false)
            }}
          >
            <label htmlFor={id} className="sr-only">
              Link de tu versión de {nombre}
            </label>
            <input id={id} value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Pegá el link de tu versión completa" inputMode="url" />
            <button type="submit" className="pc-btn pc-complete" disabled={guardando || !valor.trim()}>
              Guardar
            </button>
          </form>
        ) : (
          <div className="im-plantilla__lista">
            <Check done />
            <a href={link} target="_blank" rel="noopener noreferrer">
              Tu versión completa
            </a>
            <button type="button" className="im-plantilla__cambiar" onClick={() => setEditando(true)}>
              Cambiar
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

export default function FrentePage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [ver, setVer] = useState(null)
  const [abierta, setAbierta] = useState(null)
  const [link, setLink] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState('')
  const [ayuda, setAyuda] = useState('idle')

  useEffect(() => {
    let cancelado = false
    fetchFrente(slug)
      .then((data) => {
        if (cancelado) return
        setD(data)
        setLink(data.frente?.sop_link ?? '')
      })
      .catch((err) => {
        if (cancelado || (err instanceof ApiError && err.status === 401)) return
        setError(err instanceof ApiError && err.status === 404 ? 'Ese frente no existe.' : 'No se pudo cargar el frente.')
      })
    return () => {
      cancelado = true
    }
  }, [slug])

  if (error) {
    return (
      <div className="app-shell im-root">
        <AppHeader />
        <main className="im-home">
          <p className="im-error">{error}</p>
          <Link to="/" className="im-back">
            <Chevron dir="left" /> Volver
          </Link>
        </main>
      </div>
    )
  }
  if (!d) {
    return (
      <div className="app-shell im-root">
        <AppHeader />
        <p className="pc-loading">Cargando el frente…</p>
      </div>
    )
  }

  const f = d.frente ?? { vistas: [], sop_link: null, sops: {}, revisado: false, paso: 0 }
  const paso = f.paso
  const etapa = ver ?? Math.min(paso, 2)
  const todoAplicado = d.resolver.every((c) => f.vistas.includes(c.id))
  const plantillas = d.plantillas.filter((p) => p.completable)
  const apoyo = d.plantillas.filter((p) => !p.completable)
  const repetidas = plantillas.reduce((acc, p) => ({ ...acc, [p.clase_id]: (acc[p.clase_id] ?? 0) + 1 }), {})
  const completas = plantillas.filter((p) => f.sops?.[p.id])
  // Frentes de antes: un solo link de SOP para todo el frente.
  const legado = Boolean(f.sop_link) && !completas.length
  const documentado = plantillas.length && !legado ? completas.length === plantillas.length : Boolean(f.sop_link)
  const coach = d.coach?.nombre

  async function guardar(cambios) {
    setGuardando(true)
    setErrorGuardar('')
    try {
      const nuevo = await actualizarFrente(slug, cambios)
      setD((prev) => ({ ...prev, frente: nuevo }))
      return nuevo
    } catch (err) {
      setErrorGuardar(err instanceof Error ? err.message : 'No se pudo guardar.')
      return null
    } finally {
      setGuardando(false)
    }
  }

  const toggleAplicada = (id) => guardar({ vistas: f.vistas.includes(id) ? f.vistas.filter((x) => x !== id) : [...f.vistas, id] })

  async function pedirAyuda() {
    setAyuda('enviando')
    try {
      const etapaActual = PASOS[Math.min(etapa, 2)]
      await enviarConsultaCoach(`En la etapa ${etapaActual} (paso ${Math.min(etapa, 2) + 1} de 3)${etapa === 1 && plantillas.length ? `, con ${completas.length} de ${plantillas.length} SOPs completos` : ''}.`, slug)
      setAyuda('enviada')
    } catch {
      setAyuda('error')
    }
  }

  return (
    <div className="app-shell im-root">
      <AppHeader />
      <main className="im-frente">
        <nav className="im-frente__top">
          <Link to="/" className="im-back">
            <Chevron dir="left" /> Tus frentes
          </Link>
          <span className="pc-muted">{d.area}</span>
        </nav>

        <header className="im-frente__head">
          <h1>{d.titulo}</h1>
          <p>{d.sintoma}</p>
        </header>

        <div className="im-track" role="tablist" aria-label="Etapas del frente">
          {PASOS.map((nombre, i) => (
            <button
              key={nombre}
              type="button"
              role="tab"
              aria-selected={etapa === i}
              className={`im-track__s${i < paso ? ' is-done' : ''}${i === paso ? ' is-now' : ''}${etapa === i ? ' is-sel' : ''}`}
              onClick={() => setVer(i)}
            >
              <span className="num im-track__n">{i < paso ? <Check done /> : i + 1}</span>
              <span className="im-track__t">
                <b>{nombre}</b>
                <small>{i < paso ? 'Hecho' : i === paso ? 'Ahora' : 'Después'}</small>
              </span>
            </button>
          ))}
        </div>

        {errorGuardar ? <p className="im-error">{errorGuardar}</p> : null}

        <div className="im-frente__grid">
          <section className="im-stage" key={etapa}>
            {etapa === 0 ? (
              <>
                <h2>Entendé cómo se resuelve</h2>
                <p className="im-stage__sub">Mirá estas clases y aplicá cada una en tu negocio.</p>
                <div className="im-clases">
                  {d.resolver.map((c) => (
                    <ClaseItem
                      key={c.id}
                      c={c}
                      aplicada={f.vistas.includes(c.id)}
                      abierta={abierta === c.id}
                      onAbrir={() => setAbierta(abierta === c.id ? null : c.id)}
                      onAplicada={() => toggleAplicada(c.id)}
                      guardando={guardando}
                    />
                  ))}
                </div>
                <div className="im-siguiente">
                  <span className="num">2</span>
                  <div>
                    <b>En el siguiente paso están los SOPs</b>
                    <span>
                      {plantillas.length
                        ? `${plantillas.length} ${plantillas.length === 1 ? 'plantilla' : 'plantillas'} de estas clases para completar con los datos de tu negocio.`
                        : 'La plantilla para documentar cómo lo hace tu negocio.'}
                    </span>
                  </div>
                  <button type="button" className={`pc-btn ${todoAplicado ? 'pc-complete' : 'pc-btn--ghost'}`} onClick={() => setVer(1)}>
                    Ir a los SOPs <Chevron />
                  </button>
                </div>
              </>
            ) : etapa === 1 ? (
              <>
                <h2>Completá tus SOPs</h2>
                <p className="im-stage__sub">
                  Abrí cada plantilla (se crea una copia para vos), completala con los datos de tu negocio y pegá al lado el link de tu versión. Es el proceso que va a seguir tu equipo.
                </p>
                {plantillas.length ? (
                  <>
                    <p className="im-plantillas__meta num">
                      {completas.length} de {plantillas.length} completas
                    </p>
                    <ul className="im-plantillas">
                      {plantillas.map((p) => (
                        <PlantillaSop
                          key={p.id}
                          p={p}
                          nombre={nombrePlantilla(p, repetidas)}
                          link={f.sops?.[p.id]}
                          guardando={guardando}
                          onGuardar={(url) => guardar({ sops: { [p.id]: url } })}
                        />
                      ))}
                    </ul>
                  </>
                ) : (
                  <form
                    className="im-sop__form"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (link.trim()) await guardar({ sop_link: link.trim() })
                    }}
                  >
                    <label htmlFor="im-sop-link">{d.sop.nombre}: link de tu SOP</label>
                    <div>
                      <input id="im-sop-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/…" inputMode="url" />
                      <button type="submit" className="pc-btn pc-complete" disabled={guardando || !link.trim()}>
                        {f.sop_link ? 'Actualizar' : 'Guardar'}
                      </button>
                    </div>
                  </form>
                )}
                {apoyo.length ? (
                  <div className="im-apoyo">
                    <p>Material de apoyo</p>
                    <Recursos recursos={apoyo} />
                  </div>
                ) : null}
                {documentado ? (
                  <button type="button" className="pc-btn pc-btn--lg pc-complete" onClick={() => setVer(2)}>
                    Revisarlos con {coach ?? 'tu coach'} <Chevron />
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <h2>Revisá tus SOPs con {coach ?? 'tu coach'}</h2>
                <p className="im-stage__sub">
                  Llevalos a tu próxima llamada con {coach ?? 'tu coach'}{d.coach?.area ? ` (${d.coach.area})` : ''}. Te marca qué ajustar para que tu equipo los pueda seguir sin preguntarte.
                </p>
                {completas.length || f.sop_link ? (
                  <ul className="im-revisar">
                    {completas.map((p) => (
                      <li key={p.id}>
                        <Check done />
                        <a href={f.sops[p.id]} target="_blank" rel="noopener noreferrer">
                          {nombrePlantilla(p, repetidas)}
                        </a>
                      </li>
                    ))}
                    {legado ? (
                      <li>
                        <Check done />
                        <a href={f.sop_link} target="_blank" rel="noopener noreferrer">
                          {d.sop.nombre}
                        </a>
                      </li>
                    ) : null}
                  </ul>
                ) : (
                  <p className="pc-muted">Todavía no completaste ningún SOP. Arrancá por el paso 2.</p>
                )}
                <button
                  type="button"
                  className={`pc-btn pc-btn--lg ${f.revisado ? 'pc-btn--ghost' : 'pc-complete'}`}
                  onClick={() => guardar({ revisado: !f.revisado })}
                  disabled={guardando || (!f.revisado && !documentado)}
                >
                  <Check done={f.revisado} /> {f.revisado ? `Revisados con ${coach ?? 'tu coach'}` : `Ya los revisé con ${coach ?? 'mi coach'}`}
                </button>
                {!documentado && !f.revisado ? <p className="pc-muted im-note">Completá todos los SOPs antes de revisarlos.</p> : null}
              </>
            )}
          </section>

          <aside className="im-side">
            <div className="im-side__box">
              <p className="im-side__t">Resultado de este frente</p>
              <ul className="im-side__out">
                <li className={todoAplicado ? 'is-ok' : ''}>
                  <Check done={todoAplicado} /> Problema resuelto
                </li>
                <li className={documentado ? 'is-ok' : ''}>
                  <Check done={documentado} />
                  {plantillas.length ? (
                    <span className="num">
                      SOPs completos {completas.length}/{plantillas.length}
                    </span>
                  ) : (
                    'SOP documentado'
                  )}
                </li>
                <li className={f.revisado ? 'is-ok' : ''}>
                  <Check done={f.revisado} /> Revisado con {coach ?? 'tu coach'}
                </li>
              </ul>
            </div>
            <div className="im-side__box">
              <div className="im-coach im-coach--side">
                <span className="im-coach__av" aria-hidden="true">
                  {(coach ?? 'C').slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <b>{coach ? `Revisión con ${coach}` : 'Revisión con tu coach'}</b>
                  <span>{d.coach?.area ?? 'Cuando tengas tus SOPs'}</span>
                </div>
              </div>
              <button type="button" className="im-side__link" onClick={pedirAyuda} disabled={ayuda === 'enviando' || ayuda === 'enviada'}>
                {ayuda === 'enviada' ? `Listo, le avisamos a ${coach ?? 'tu coach'}` : ayuda === 'enviando' ? 'Enviando…' : '¿Te trabaste? Pedí ayuda'}
              </button>
              {ayuda === 'error' ? <p className="im-error">No se pudo enviar. Probá de nuevo.</p> : null}
            </div>
            {paso >= 3 ? (
              <button type="button" className="pc-btn pc-btn--light im-side__btn" onClick={() => navigate('/')}>
                Elegir el próximo frente
              </button>
            ) : null}
          </aside>
        </div>
      </main>
    </div>
  )
}
