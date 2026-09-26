import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { enviarConsultaCoach, fetchFrentes, preguntarGuia } from '../api/frentes'
import AppHeader from '../components/AppHeader'
import AccesoRestante from '../components/AccesoRestante'
import { Chevron } from '../components/frentes/piezas'
import Pasos from '../components/frentes/Pasos'
import { useAuth } from '../context/AuthContext'
import { proximoPaso } from '../utils/frentes'
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
    setTexto(q)
    setPensando(true)
    setConsulta({ estado: 'idle', texto: q })
    try {
      const r = await preguntarGuia(q)
      setResultado({ ...r, texto: q })
    } catch (err) {
      setResultado({ error: err instanceof Error ? err.message : 'La guía no respondió. Probá de nuevo.' })
    } finally {
      setPensando(false)
    }
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
  const elegido = resultado?.slug ? problemas.find((p) => p.slug === resultado.slug) : null
  const abiertos = problemas.filter((p) => p.frente)
  const coach = datos?.coach?.nombre
  const nombre = user?.nombre?.split(' ')[0]

  return (
    <div className="app-shell im-root">
      <AppHeader />
      <main className="im-home">
        <section className="im-ask">
          <h1>
            {nombre ? `${nombre}, ¿qué` : '¿Qué'} está trabando
            <br />
            tu negocio hoy?
          </h1>
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
          <div className="im-ask__hints">
            {EJEMPLOS.map((h) => (
              <button key={h} type="button" onClick={() => preguntar(h)} disabled={pensando}>
                {h}
              </button>
            ))}
          </div>

          {resultado?.error ? <p className="im-error">{resultado.error}</p> : null}

          {elegido ? (
            <div className="im-route" key={resultado.texto}>
              <p className="im-route__lead">
                Esto se resuelve con un frente de trabajo: <b>{elegido.titulo}</b>
              </p>
              <ol className="im-route__steps">
                <li>
                  <span className="num">1</span>
                  <div>
                    <b>Resolver</b>
                    <span>
                      {elegido.clases_resolver} {elegido.clases_resolver === 1 ? 'clase' : 'clases'} que atacan el problema
                    </span>
                  </div>
                </li>
                <li>
                  <span className="num">2</span>
                  <div>
                    <b>Documentar</b>
                    <span>Tu SOP: {elegido.sop_nombre}</span>
                  </div>
                </li>
                <li>
                  <span className="num">3</span>
                  <div>
                    <b>Automatizar</b>
                    <span>{elegido.tiene_automatizacion ? 'Lo dejás andando solo con el sistema ATV' : `Lo armás con ${coach ?? 'tu coach'}`}</span>
                  </div>
                </li>
              </ol>
              <button type="button" className="pc-btn pc-complete pc-btn--lg" onClick={() => navigate(`/frentes/${elegido.slug}`)}>
                {elegido.frente ? 'Seguir este frente' : 'Abrir este frente'} <Chevron />
              </button>
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
