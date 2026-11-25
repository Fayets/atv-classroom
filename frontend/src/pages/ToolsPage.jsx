import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client'
import { abrirTool, fetchTools } from '../api/tools'
import AppHeader from '../components/AppHeader'
import { Chevron } from '../components/frentes/piezas'
import { DefsTools, DibujoTool } from '../components/tools/DibujosTools'
import '../styles/frentes.css'
import '../styles/material.css'
import '../styles/classroom-rediseno.css'
import '../styles/tools.css'

// Tools: herramientas con IA, en el lenguaje de Material (papel, vidrio, títulos grandes y el rojo ATV).
// Arriba, un tablero (bento) con las del plan: la destacada ocupa dos columnas. Abajo, la vitrina oscura
// con las que se suman por WhatsApp: el dibujo empañado y el precio a la vista. Cada tarjeta ya trae su
// descripción y su acción; no hay que abrirla para saber qué hace.

const Candado = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></svg>
)

function Accion({ tool, contacto, abriendo, onAbrir }) {
  if (tool.estado === 'paga') {
    return contacto?.link ? (
      <a href={contacto.link} target="_blank" rel="noreferrer" className="tl-cta tl-cta--claro">
        Sumarla con {contacto.nombre.split(' ')[0]} <Chevron />
      </a>
    ) : null
  }
  if (!tool.abrir) return <span className="tl-pronto">Muy pronto</span>
  return (
    <button type="button" className="tl-cta" disabled={abriendo} onClick={onAbrir}>
      {abriendo ? 'Abriendo…' : 'Abrir'} <Chevron />
    </button>
  )
}

function Tarjeta({ tool, destacada, contacto, abriendo, onAbrir }) {
  const paga = tool.estado === 'paga'
  return (
    <article className={`tl-card${destacada ? ' is-destacada' : ''}${paga ? ' is-paga' : ''}`} aria-labelledby={`tl-${tool.id}`}>
      <div className="tl-card__dib" aria-hidden="true">
        <DibujoTool id={tool.id} />
        {paga ? <span className="tl-card__candado"><Candado /> No está en tu plan</span> : null}
      </div>
      <div className="tl-card__txt">
        <div className="tl-card__chips">
          {tool.nuevo ? <span className="tl-chip is-nuevo">Nuevo</span> : null}
          <span className="tl-chip">{tool.duracion}</span>
          {paga && tool.precio ? <span className="tl-chip is-precio num">{tool.precio}</span> : null}
        </div>
        <h3 id={`tl-${tool.id}`}>{tool.nombre}</h3>
        <p>{tool.descripcion}</p>
        <div className="tl-card__pie">
          <Accion tool={tool} contacto={contacto} abriendo={abriendo} onAbrir={onAbrir} />
        </div>
      </div>
    </article>
  )
}

export default function ToolsPage() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [abriendo, setAbriendo] = useState(null)

  // Salta al proyecto de agentes con un pase firmado que vence en un minuto (no hay que volver a loguearse).
  async function abrir(id) {
    setAbriendo(id)
    setError('')
    try {
      const { url } = await abrirTool(id)
      window.location.assign(url)
    } catch (e) {
      setError(e.message || 'No se pudo abrir la tool.')
      setAbriendo(null)
    }
  }

  useEffect(() => {
    let cancelado = false
    fetchTools()
      .then((d) => !cancelado && setDatos(d))
      .catch((err) => {
        if (cancelado || (err instanceof ApiError && err.status === 401)) return
        setError(err.message || 'No se pudieron cargar las tools.')
      })
    return () => {
      cancelado = true
    }
  }, [])

  const tools = datos?.tools || []
  const incluidas = tools.filter((t) => t.estado === 'incluida')
  const pagas = tools.filter((t) => t.estado === 'paga')
  // La destacada: la nueva del plan si hay una; si no, la primera. Va primero y ocupa dos columnas.
  const destacada = incluidas.find((t) => t.nuevo) || incluidas[0]
  const tablero = destacada ? [destacada, ...incluidas.filter((t) => t !== destacada)] : []
  const contacto = datos?.contacto
  const tarjeta = (t, extra = {}) => (
    <Tarjeta key={t.id} tool={t} contacto={contacto} abriendo={abriendo === t.id} onAbrir={() => abrir(t.id)} {...extra} />
  )

  return (
    <div className="app-shell im-root cr-root tl-root">
      <AppHeader />
      <DefsTools />
      <main className="mt-grid-page tl-page">
        <header className="mt-grid-head">
          <Link to="/" className="im-back">
            <Chevron dir="left" /> Inicio
          </Link>
          <h1>Tools</h1>
          <p className="tl-lead">Herramientas con IA que hacen el trabajo pesado de tu negocio.</p>
          {datos ? (
            <p className="tl-resumen">
              <b className="num">{incluidas.length}</b> en tu plan
              {pagas.length ? (
                <>
                  <span className="cr-resumen__sep" aria-hidden="true">·</span>
                  <span className="num">{pagas.length}</span> para sumar
                </>
              ) : null}
            </p>
          ) : null}
          {datos?.visible === false ? (
            <span className="tl-aviso">Oculta para los clientes · <Link to="/admin?vista=tools">prenderla</Link></span>
          ) : null}
        </header>

        {error && !datos ? <p className="im-error">{error}</p> : !datos ? <p className="pc-loading">Cargando tools…</p> : (
          <>
            {tablero.length ? (
              <section className="tl-seccion" aria-labelledby="tl-en-plan">
                <h2 id="tl-en-plan">En tu plan <span className="num">{tablero.length}</span></h2>
                <div className="tl-bento">{tablero.map((t) => tarjeta(t, { destacada: t === destacada && tablero.length > 1 }))}</div>
              </section>
            ) : null}

            {pagas.length ? (
              <section className="tl-vitrina" aria-labelledby="tl-para-sumar">
                <div className="tl-vitrina__cab">
                  <h2 id="tl-para-sumar">Para sumar <span className="num">{pagas.length}</span></h2>
                  <p>
                    {contacto?.nombre
                      ? `No vienen en tu plan. Se suman hablando con ${contacto.nombre.split(' ')[0]} por WhatsApp.`
                      : 'No vienen en tu plan.'}
                  </p>
                </div>
                <div className="tl-vitrina__grilla">{pagas.map((t) => tarjeta(t))}</div>
              </section>
            ) : null}

            {error ? <p className="im-error" role="alert">{error}</p> : null}
            {!tools.length ? <p className="mt-sops__vacio">Todavía no hay tools para tu plan.</p> : null}
          </>
        )}
      </main>
    </div>
  )
}
