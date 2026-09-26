import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { actualizarFrente, enviarConsultaCoach, fetchFrente } from '../api/frentes'
import AppHeader from '../components/AppHeader'
import { Check, Chevron, Recursos, Video } from '../components/frentes/piezas'
import { tituloLindo } from '../utils/frentes'
import '../styles/frentes.css'

// Un frente = un problema del negocio trabajado con el método ATV:
// resolver (clases) → documentar (el SOP del cliente) → automatizar (sistema o coach).

const PASOS = ['Resolver', 'Documentar', 'Automatizar']

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
          {c.recursos?.length ? <Recursos recursos={c.recursos} /> : null}
          <button type="button" className={`pc-btn ${aplicada ? 'pc-btn--ghost' : 'pc-complete'}`} onClick={onAplicada} disabled={guardando}>
            <Check done={aplicada} /> {aplicada ? 'Aplicada' : 'Ya la apliqué'}
          </button>
        </div>
      ) : null}
    </div>
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

  const f = d.frente ?? { vistas: [], sop_link: null, automatizado: false, paso: 0 }
  const paso = f.paso
  const etapa = ver ?? Math.min(paso, 2)
  const resolverIds = d.resolver.map((c) => c.id)
  const todoAplicado = resolverIds.every((id) => f.vistas.includes(id))

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
      await enviarConsultaCoach(`Pide ayuda con el frente "${d.titulo}" (etapa: ${PASOS[Math.min(paso, 2)]}).`, slug)
      setAyuda('enviada')
    } catch {
      setAyuda('error')
    }
  }

  const coach = d.coach?.nombre

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
                <p className="im-stage__sub">Mirá estas clases y aplicá cada una en tu negocio. Cuando las apliques todas, pasás a documentarlo.</p>
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
              </>
            ) : etapa === 1 ? (
              <>
                <h2>Convertilo en tu SOP</h2>
                <p className="im-stage__sub">
                  Hacé tu copia de la plantilla, completala con cómo lo hace tu negocio y pegá el link. Ese documento es el proceso que tu equipo va a seguir.
                </p>
                <div className="im-sop">
                  <p className="im-sop__name">{d.sop.nombre}</p>
                  {d.sop.recursos.length ? <Recursos recursos={d.sop.recursos} /> : <p className="pc-muted">Esta plantilla todavía no está cargada. Pedísela a {coach ?? 'tu coach'}.</p>}
                  {d.sop.cubrir.length ? (
                    <div className="im-sop__must">
                      <p>Tu SOP tiene que cubrir</p>
                      <ul>
                        {d.sop.cubrir.map((k) => (
                          <li key={k}>{k}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <form
                    className="im-sop__form"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (!link.trim()) return
                      const nuevo = await guardar({ sop_link: link.trim() })
                      if (nuevo) setVer(null)
                    }}
                  >
                    <label htmlFor="im-sop-link">Link de tu SOP</label>
                    <div>
                      <input id="im-sop-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/…" inputMode="url" />
                      <button type="submit" className="pc-btn pc-complete" disabled={guardando || !link.trim()}>
                        {f.sop_link ? 'Actualizar' : 'Listo, está documentado'}
                      </button>
                    </div>
                  </form>
                  {!todoAplicado ? <p className="pc-muted im-note">Podés armarlo ya, aunque te falte aplicar alguna clase.</p> : null}
                </div>
              </>
            ) : (
              <>
                <h2>Dejalo andando solo</h2>
                {d.automatizar.length ? (
                  <>
                    <p className="im-stage__sub">Con el sistema ATV, este proceso deja de depender de que alguien se acuerde.</p>
                    <div className="im-clases">
                      {d.automatizar.map((c) => (
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
                  </>
                ) : (
                  <p className="im-stage__sub">Para este problema todavía no hay un sistema listo. Lo automatizás con {coach ?? 'tu coach'}.</p>
                )}
                <button type="button" className={`pc-btn pc-btn--lg ${f.automatizado ? 'pc-btn--ghost' : 'pc-complete'}`} onClick={() => guardar({ automatizado: !f.automatizado })} disabled={guardando}>
                  <Check done={f.automatizado} /> {f.automatizado ? 'Automatizado' : 'Ya está automatizado'}
                </button>
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
                <li className={f.sop_link ? 'is-ok' : ''}>
                  <Check done={Boolean(f.sop_link)} />
                  {f.sop_link ? (
                    <a href={f.sop_link} target="_blank" rel="noopener noreferrer">
                      Tu SOP
                    </a>
                  ) : (
                    'SOP documentado'
                  )}
                </li>
                <li className={f.automatizado ? 'is-ok' : ''}>
                  <Check done={f.automatizado} /> Proceso automatizado
                </li>
              </ul>
            </div>
            <div className="im-side__box">
              <div className="im-coach im-coach--side">
                <span className="im-coach__av" aria-hidden="true">
                  {(coach ?? 'C').slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <b>¿Te trabaste?</b>
                  <span>{coach ? `${coach} ve este frente con vos` : 'Tu coach ve este frente con vos'}</span>
                </div>
              </div>
              <button type="button" className="pc-btn pc-btn--ghost im-side__btn" onClick={pedirAyuda} disabled={ayuda === 'enviando' || ayuda === 'enviada'}>
                {ayuda === 'enviada' ? 'Pedido registrado' : ayuda === 'enviando' ? 'Enviando…' : 'Pedir ayuda con este frente'}
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
