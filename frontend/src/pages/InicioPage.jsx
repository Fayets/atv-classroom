import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { eliminarFrente, fetchFrentes, preguntarGuia } from '../api/frentes'
import AppHeader from '../components/AppHeader'
import AccesoRestante from '../components/AccesoRestante'
import { Chevron, EtiquetaRecurso } from '../components/frentes/piezas'
import Pasos from '../components/frentes/Pasos'
import SolicitudSop from '../components/frentes/SolicitudSop'
import HazGuia from '../components/inicio/HazGuia'
import { BandaPaso, TuSemana, useHoy } from '../components/inicio/Hoy'
import { pedirCartelPausa } from '../components/Pausa'
import { useAuth } from '../context/AuthContext'
import { proximoPaso, tipoRecurso, tituloLindo, urlRecurso } from '../utils/frentes'
import '../styles/frentes.css'
import '../styles/classroom-rediseno.css'
import '../styles/inicio.css'

// Rediseño 2026-11 (styles/inicio.css), en el idioma de Material (papel, vidrio, rojo ATV) con ideas de
// productos brasileños: la lista tipográfica gigante de Stone (lo que más traba, para preguntarle a la guía de
// un toque) y la banda de color de borde a borde de Nubank (el próximo paso del roadmap). El anillo de los días
// del programa (AnilloPrograma, en components/inicio/Hoy.jsx) queda guardado para usarlo en otra sección.

// La palabra del título con el subrayado a mano: el trazo se dibuja al entrar.
function Subrayada({ children }) {
  return (
    <span className="in-subrayada">
      {children}
      <svg viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true">
        <path d="M4 15 C 60 7, 120 6, 180 10 S 270 16, 296 9" />
      </svg>
    </span>
  )
}

// El cliente no entra a una biblioteca: entra con un problema de su negocio.
// La guía no responde la duda, arma el camino (resolver → SOP → automatizar) o deriva al coach.

const EJEMPLOS = ['Me dicen que lo van a pensar', 'No sé si estoy ganando plata', 'Todo depende de mí', 'SOP de onboarding']

// Lo que buscó, sin el "SOP de" de adelante: es el nombre con el que pide el que falta.
const nombreBuscado = (q) => q.replace(/^\s*(busco|necesito|quiero)?\s*(el|la|un|una)?\s*(sop|plantilla|guion|guión)\s+(de|del|para)\s+/i, '').replace(/^./, (c) => c.toUpperCase())

export default function InicioPage() {
  const navigate = useNavigate()
  const { user, isEquipo } = useAuth()
  const enPausa = Boolean(user?.pausa) && !isEquipo
  // El 2K no incluye la guía con IA: el inicio queda con su plan, su roadmap y el material.
  const sinGuia = !isEquipo && (user?.permisos?.ia ?? (user?.rol === '2k' ? 'no' : 'si')) === 'no'
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [pregunta, setPregunta] = useState('')
  const [arriba, setArriba] = useState(null) // a qué altura estaba el título antes de buscar (px)
  const [quitando, setQuitando] = useState(null)
  const [borrando, setBorrando] = useState(false)

  useEffect(() => {
    fetchFrentes()
      .then(setDatos)
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) setError('No se pudieron cargar tus frentes.')
      })
  }, [])

  async function preguntar(valor) {
    if (enPausa) return pedirCartelPausa()
    const q = (valor ?? texto).trim()
    if (q.length < 3 || pensando) return
    // El título no se mueve al buscar: se guarda a qué altura estaba dentro de la sección y, con la respuesta
    // a la vista (la primera pantalla deja de ocupar todo el alto), se usa como espacio de arriba.
    const seccion = campo.current?.closest('.in-ask')
    const titulo = seccion?.querySelector('h1')
    if (seccion && titulo && !pregunta) setArriba(Math.max(0, Math.round(titulo.getBoundingClientRect().top - seccion.getBoundingClientRect().top)))
    setTexto('')
    setPregunta(q)
    setResultado(null)
    setPensando(true)
    try {
      // Espera mínima para que el chat llegue a abrirse antes de la respuesta.
      const [r] = await Promise.all([preguntarGuia(q), new Promise((ok) => setTimeout(ok, 650))])
      setResultado({ ...r, texto: q })
    } catch (err) {
      setResultado({ error: err instanceof Error ? err.message : 'La guía no respondió. Probá de nuevo.' })
    } finally {
      setPensando(false)
    }
  }

  async function quitarFrente(slug) {
    setBorrando(true)
    try {
      await eliminarFrente(slug)
      setDatos((prev) => ({ ...prev, problemas: prev.problemas.map((p) => (p.slug === slug ? { ...p, frente: null } : p)) }))
      setQuitando(null)
    } catch {
      setError('No se pudo quitar el frente. Probá de nuevo.')
    } finally {
      setBorrando(false)
    }
  }

  const problemas = datos?.problemas ?? []
  const recomendaciones = resultado?.recomendaciones ?? []
  const sops = resultado?.modo === 'sops' ? resultado.sops ?? [] : null
  const frenteSugerido = resultado?.frente ? problemas.find((p) => p.slug === resultado.frente.slug) : null
  const abiertos = problemas.filter((p) => p.frente)
  const nombre = user?.nombre?.split(' ')[0]
  const hoy = useHoy()
  const campo = useRef(null)

  return (
    <div className="app-shell im-root cr-root in-root">
      <AppHeader />
      <main className="im-home in-home">
        {sinGuia ? (
          <section className="im-ask">
            <div className="im-hero">
              <div className="im-hero__inner in-hero">
                <div className="in-hero__txt">
                  <h1>
                    {nombre ? `${nombre}, ¿por dónde` : '¿Por dónde'}
                    <br />
                    <Subrayada>seguimos</Subrayada> hoy?
                  </h1>
                </div>
              </div>
            </div>
          </section>
        ) : (
        <section className={`im-ask in-ask${pregunta ? ' is-chat' : ''}`} style={pregunta && arriba != null ? { '--in-arriba': `${arriba}px` } : undefined}>
          {/* El haz de luz (LaserFlow) cae sobre el campo de la guía. */}
          <HazGuia campoRef={campo} />
          {/* Al preguntar, el título queda: la respuesta aparece abajo del campo y solo se va la lista de ejemplos.
              Para otra consulta se escribe de nuevo en el mismo campo. */}
          <div className="im-hero">
            <div className="im-hero__inner in-hero">
              <div className="in-hero__txt">
                <h1>
                  {nombre ? `${nombre}, ¿qué` : '¿Qué'} está <Subrayada>trabando</Subrayada>
                  <br />
                  tu negocio hoy?
                </h1>
              </div>
            </div>
          </div>
          <form
            ref={campo}
            className="im-ask__form"
            onSubmit={(e) => {
              e.preventDefault()
              preguntar()
            }}
          >
            <label htmlFor="im-q" className="visually-hidden">
              Contá qué está trabando tu negocio
            </label>
            <input
              id="im-q"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Contá qué te traba o buscá un SOP"
              // En pausa no se usa la IA: apenas toca para escribir, el cartel de hablar con Lucas.
              onMouseDown={enPausa ? (e) => { e.preventDefault(); pedirCartelPausa() } : undefined}
              onFocus={enPausa ? (e) => { e.target.blur(); pedirCartelPausa() } : undefined}
              autoComplete="off"
              maxLength={1500}
            />
            <button type="submit" className="im-ask__ir" disabled={pensando || texto.trim().length < 3} aria-label={pensando ? 'Armando tu camino' : 'Armar mi camino'}>
              {pensando ? (
                <span className="im-ask__girando" aria-hidden="true" />
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              )}
            </button>
          </form>
          {/* Lo que más traba, como la lista gigante de Stone: cada renglón le pregunta a la guía. Una vez que se
              buscó algo, la lista ya no aparece. */}
          {pregunta ? null : (
            <div className="im-ask__hints in-traba">
              <p className="in-traba__etq">O tocá lo que más se repite</p>
              <ul>
                {EJEMPLOS.map((h, i) => (
                  <li key={h} style={{ '--i': i }}>
                    <button type="button" onClick={() => preguntar(h)} disabled={pensando}>
                      <span>{h}</span>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Celular: la primera pantalla es solo la pregunta; esto avisa que abajo sigue (el resto se ve al bajar). */}
          {pregunta ? null : (
            <button
              type="button"
              className="in-scroll"
              onClick={() => document.querySelector('.in-banda, .in-semana, .in-frentes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              Scrolleá
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          )}

          <div className={`im-reveal${pregunta ? ' is-open' : ''}`} aria-live="polite">
            <div className="im-reveal__inner">
              {pregunta ? (
                <div className="im-chat">
                  <p className="im-chat__yo">
                    <span className="visually-hidden">Vos: </span>
                    {pregunta}
                  </p>
                  {pensando ? (
                    <p className="im-chat__typing">
                      <span className="visually-hidden">La guía está armando tu camino</span>
                      <i aria-hidden="true" />
                      <i aria-hidden="true" />
                      <i aria-hidden="true" />
                    </p>
                  ) : (
                    <>
                      {resultado?.error ? <p className="im-error">{resultado.error}</p> : null}
                      {sops ? (
                        <div className="im-route" key={resultado.texto}>
                          <p className="im-route__lead">
                            {sops.length
                              ? sops.length === 1 ? 'Este es el SOP que tenemos de eso.' : 'Estos son los SOPs que tenemos de eso, el más exacto primero.'
                              : 'Todavía no tenemos un SOP de eso. Pedilo y te lo armamos.'}
                          </p>
                          {sops.length ? (
                            <ol className="im-recs">
                              {sops.map((r, i) => (
                                <li key={r.clase_id ?? r.url} className="im-rec" style={{ '--i': i }}>
                                  <span className="num im-rec__n">{i + 1}</span>
                                  <div className="im-rec__body">
                                    <span className="im-rec__where">{r.seccion ? `${r.modulo} › ${tituloLindo(r.seccion)}` : r.modulo}</span>
                                    <b>{r.fuente === 'skool' ? r.titulo : tituloLindo(r.titulo)}</b>
                                    {r.recursos.length ? (
                                      <div className="im-rec__sops">
                                        {r.recursos.map((rec) => (
                                          <a key={rec.id ?? rec.url} href={urlRecurso(rec.url)} target="_blank" rel="noopener noreferrer" className="im-sopchip">
                                            <EtiquetaRecurso recurso={rec} />
                                            {/^(documento|planilla|formulario) google/i.test(rec.titulo) ? tipoRecurso(rec).label : rec.titulo}
                                          </a>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                  {r.fuente === 'skool' ? (
                                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="pc-btn pc-btn--light im-rec__ver">
                                      Abrir en Skool <Chevron />
                                    </a>
                                  ) : (
                                    <Link to={`/classroom/${r.programa_id}?clase=${r.clase_id}`} className="pc-btn pc-btn--light im-rec__ver">
                                      Ver el SOP <Chevron />
                                    </Link>
                                  )}
                                </li>
                              ))}
                            </ol>
                          ) : null}
                          <SolicitudSop
                            key={resultado.texto}
                            consulta={resultado.texto}
                            coach={resultado.coach}
                            nombreInicial={nombreBuscado(resultado.texto)}
                            abiertoInicial={!sops.length}
                            titulo={sops.length ? '¿No es lo que buscabas?' : 'Solicitá el SOP'}
                          />
                        </div>
                      ) : recomendaciones.length ? (
                        <div className="im-route" key={resultado.texto}>
                          <p className="im-route__lead">Para esto te sirven estas clases. Miralas y usá su plantilla como tu SOP.</p>
                          <ol className="im-recs">
                            {recomendaciones.map((r, i) => (
                              <li key={r.clase_id} className="im-rec" style={{ '--i': i }}>
                                <span className="num im-rec__n">{i + 1}</span>
                                <div className="im-rec__body">
                                  <span className="im-rec__where">
                                    {r.modulo} › {tituloLindo(r.seccion)}
                                  </span>
                                  <b>{tituloLindo(r.titulo)}</b>
                                  {r.cubre ? <span className="im-rec__cubre">Cubre: “{r.cubre}”</span> : null}
                                  {r.recursos.length ? (
                                    <div className="im-rec__sops">
                                      {r.recursos.map((rec) => (
                                        <a key={rec.id ?? rec.url} href={urlRecurso(rec.url)} target="_blank" rel="noopener noreferrer" className="im-sopchip">
                                          <EtiquetaRecurso recurso={rec} />
                                          {/^(documento|planilla|formulario) google/i.test(rec.titulo) ? tipoRecurso(rec).label : rec.titulo}
                                        </a>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                                <Link to={`/classroom/${r.programa_id}?clase=${r.clase_id}`} className="pc-btn pc-btn--light im-rec__ver">
                                  Video explicativo <Chevron />
                                </Link>
                              </li>
                            ))}
                          </ol>
                          {resultado.coach ? (
                            <div className="im-coachbox">
                              <span className="im-coach__av" aria-hidden="true">
                                {resultado.coach.nombre.slice(0, 2).toUpperCase()}
                              </span>
                              <div>
                                <b>Cuando lo implementes, revisalo con {resultado.coach.nombre}</b>
                                <span>{resultado.coach.area}</span>
                              </div>
                            </div>
                          ) : null}
                          {frenteSugerido ? (
                            <div className="im-frentebox">
                              <div>
                                <b>Trabajalo como frente</b>
                                <span>{frenteSugerido.titulo}: resolver, completar tus SOPs y revisarlos con tu coach, con tu avance guardado.</span>
                              </div>
                              <button type="button" className="pc-btn pc-complete" onClick={() => navigate(`/frentes/${frenteSugerido.slug}`)}>
                                {frenteSugerido.frente ? 'Seguir el frente' : 'Abrir frente'} <Chevron />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : resultado && !resultado.error ? (
                        <div className="im-route im-route--coach" key={resultado.texto}>
                          <p className="im-route__lead">
                            No hay una clase ni un SOP que cubra esto, y no te vamos a inventar una respuesta.{' '}
                            {resultado.coach ? `Lo ves en una call con ${resultado.coach.nombre}.` : null}
                          </p>
                          {resultado.coach ? (
                            <div className="im-coach">
                              <span className="im-coach__av" aria-hidden="true">
                                {resultado.coach.nombre.slice(0, 2).toUpperCase()}
                              </span>
                              <div>
                                <b>{resultado.coach.nombre}</b>
                                <span>{resultado.coach.area}</span>
                              </div>
                            </div>
                          ) : null}
                          <SolicitudSop consulta={resultado.texto} coach={resultado.coach} />
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </section>
        )}

        {error ? <p className="im-error">{error}</p> : null}

        {isEquipo ? null : (
          <>
            <BandaPaso paso={hoy.paso} />
            <TuSemana clase={hoy.clase} modulo={hoy.modulo} chat={hoy.chat} sops={hoy.sops} avance={hoy.avance} />
          </>
        )}

        {abiertos.length ? (
          <section className="im-sec in-frentes">
            <h2 className="in-titulo">Tus frentes abiertos</h2>
            <div className="im-open">
              {abiertos.map((p) =>
                quitando === p.slug ? (
                  <div key={p.slug} className="im-open__confirm" role="group" aria-label={`Quitar ${p.titulo}`}>
                    <span>
                      ¿Quitar <b>{p.titulo}</b>? Se borra tu avance y el link de tu SOP.
                    </span>
                    <div>
                      <button type="button" className="pc-btn pc-btn--ghost" onClick={() => setQuitando(null)} disabled={borrando}>
                        Cancelar
                      </button>
                      <button type="button" className="pc-btn pc-complete" onClick={() => quitarFrente(p.slug)} disabled={borrando}>
                        {borrando ? 'Quitando…' : 'Quitar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={p.slug} className="im-open__item">
                    <Link to={`/frentes/${p.slug}`} className="im-open__row">
                      <span className="im-open__area">{p.area}</span>
                      <b>{p.titulo}</b>
                      <Pasos paso={p.frente.paso} />
                      <span className="im-open__next">
                        {proximoPaso(p.frente.paso)}
                        <Chevron />
                      </span>
                    </Link>
                    <button type="button" className="im-open__x" onClick={() => setQuitando(p.slug)} aria-label={`Quitar ${p.titulo}`} title="Quitar este frente">
                      <svg viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M3 3l6 6M9 3l-6 6" />
                      </svg>
                    </button>
                  </div>
                ),
              )}
            </div>
          </section>
        ) : null}

        {!datos && !error ? <p className="pc-loading">Cargando tus frentes…</p> : null}

        {isEquipo ? (
          <footer className="im-foot">
            <AccesoRestante />
            <Link to="/classroom">Ver todo el material, módulo por módulo</Link>
          </footer>
        ) : null}
      </main>
    </div>
  )
}
