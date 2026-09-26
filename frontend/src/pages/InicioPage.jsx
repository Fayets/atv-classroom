import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { enviarConsultaCoach, fetchFrentes, preguntarGuia } from '../api/frentes'
import AppHeader from '../components/AppHeader'
import AccesoRestante from '../components/AccesoRestante'
import { Chevron } from '../components/frentes/piezas'
import Pasos from '../components/frentes/Pasos'
import { useAuth } from '../context/AuthContext'
import { proximoPaso, tipoRecurso, tituloLindo } from '../utils/frentes'
import '../styles/frentes.css'

// El cliente no entra a una biblioteca: entra con un problema de su negocio.
// La guía no responde la duda, arma el camino (resolver → SOP → automatizar) o deriva al coach.

const EJEMPLOS = ['Me dicen que lo van a pensar', 'No sé si estoy ganando plata', 'Todo depende de mí']

export default function InicioPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [pregunta, setPregunta] = useState('')
  const [consulta, setConsulta] = useState({ estado: 'idle', texto: '' })

  useEffect(() => {
    fetchFrentes()
      .then(setDatos)
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) setError('No se pudieron cargar tus frentes.')
      })
  }, [])

  async function preguntar(valor) {
    const q = (valor ?? texto).trim()
    if (q.length < 3 || pensando) return
    setTexto('')
    setPregunta(q)
    setResultado(null)
    setPensando(true)
    setConsulta({ estado: 'idle', texto: q })
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

  function nuevaConsulta() {
    setPregunta('')
    setResultado(null)
    setTexto('')
    document.getElementById('im-q')?.focus()
  }

  async function mandarAlCoach() {
    setConsulta((c) => ({ ...c, estado: 'enviando' }))
    try {
      await enviarConsultaCoach(consulta.texto)
      setConsulta((c) => ({ ...c, estado: 'enviada' }))
    } catch {
      setConsulta((c) => ({ ...c, estado: 'error' }))
    }
  }

  const problemas = datos?.problemas ?? []
  const recomendaciones = resultado?.recomendaciones ?? []
  const frenteSugerido = resultado?.frente ? problemas.find((p) => p.slug === resultado.frente.slug) : null
  const abiertos = problemas.filter((p) => p.frente)
  const coach = datos?.coach?.nombre
  const nombre = user?.nombre?.split(' ')[0]

  return (
    <div className="app-shell im-root">
      <AppHeader />
      <main className="im-home">
        <section className={`im-ask${pregunta ? ' is-chat' : ''}`}>
          <div className="im-hero" aria-hidden={Boolean(pregunta)}>
            <div className="im-hero__inner">
              <h1>
                {nombre ? `${nombre}, ¿qué` : '¿Qué'} está trabando
                <br />
                tu negocio hoy?
              </h1>
            </div>
          </div>
          <div className="im-chatbar">
            <span className="im-chatbar__t">Guía ATV</span>
            <button type="button" className="im-chatbar__new" onClick={nuevaConsulta} disabled={pensando}>
              Nueva consulta
            </button>
          </div>
          <form
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
              placeholder="Ej: agendan llamadas pero la mitad no se presenta"
              autoComplete="off"
              maxLength={1500}
            />
            <button type="submit" className="pc-btn pc-btn--light" disabled={pensando || texto.trim().length < 3}>
              {pensando ? 'Armando tu camino…' : 'Armar mi camino'}
            </button>
          </form>
          <div className="im-ask__hints" aria-hidden={Boolean(pregunta)}>
            {EJEMPLOS.map((h) => (
              <button key={h} type="button" onClick={() => preguntar(h)} disabled={pensando}>
                {h}
              </button>
            ))}
          </div>

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
                      {recomendaciones.length ? (
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
                                        <a key={rec.id ?? rec.url} href={rec.url} target="_blank" rel="noopener noreferrer" className="im-sopchip">
                                          <span>{tipoRecurso(rec).tag}</span>
                                          {/^(documento|planilla|formulario) google/i.test(rec.titulo) ? tipoRecurso(rec).label : rec.titulo}
                                        </a>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                                <Link to={`/classroom/${r.programa_id}?clase=${r.clase_id}`} className="pc-btn pc-btn--light im-rec__ver">
                                  Ver clase <Chevron />
                                </Link>
                              </li>
                            ))}
                          </ol>
                          {frenteSugerido ? (
                            <div className="im-frentebox">
                              <div>
                                <b>Trabajalo como frente</b>
                                <span>{frenteSugerido.titulo}: resolver, documentar tu SOP y automatizar, con tu avance guardado.</span>
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
                            No hay una clase ni un SOP que resuelva esto, y no te vamos a inventar una respuesta. Lo ve {coach ?? 'tu coach'}.
                          </p>
                          <div className="im-coach">
                            <span className="im-coach__av" aria-hidden="true">
                              {(coach ?? 'C').slice(0, 2).toUpperCase()}
                            </span>
                            <div>
                              <b>{coach ?? 'Tu coach'}</b>
                              <span>Tu consulta queda registrada para que la vea</span>
                            </div>
                            <button type="button" className={`pc-btn ${consulta.estado === 'enviada' ? 'pc-btn--ghost' : 'pc-btn--light'}`} onClick={mandarAlCoach} disabled={consulta.estado === 'enviando' || consulta.estado === 'enviada'}>
                              {consulta.estado === 'enviada' ? 'Consulta enviada' : consulta.estado === 'enviando' ? 'Enviando…' : 'Mandarle la consulta'}
                            </button>
                          </div>
                          {consulta.estado === 'error' ? <p className="im-error">No se pudo enviar. Probá de nuevo.</p> : null}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {error ? <p className="im-error">{error}</p> : null}

        {abiertos.length ? (
          <section className="im-sec">
            <h2>Tus frentes abiertos</h2>
            <div className="im-open">
              {abiertos.map((p) => (
                <Link key={p.slug} to={`/frentes/${p.slug}`} className="im-open__row">
                  <span className="im-open__area">{p.area}</span>
                  <b>{p.titulo}</b>
                  <Pasos paso={p.frente.paso} />
                  <span className="im-open__next">
                    {proximoPaso(p.frente.paso)}
                    <Chevron />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {!datos && !error ? <p className="pc-loading">Cargando tus frentes…</p> : null}

        <footer className="im-foot">
          <AccesoRestante />
          <Link to="/classroom">Ver todo el material, módulo por módulo</Link>
        </footer>
      </main>
    </div>
  )
}
