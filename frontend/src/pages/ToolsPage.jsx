import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client'
import { abrirTool, fetchTools } from '../api/tools'
import AppHeader from '../components/AppHeader'
import { Chevron } from '../components/frentes/piezas'
import Isotipo from '../components/marca/Isotipo'
import { DefsTools, DibujoTool } from '../components/tools/DibujosTools'
import '../styles/frentes.css'
import '../styles/material.css'
import '../styles/tools.css'

// Tools: herramientas con IA. Las de su plan se usan; las pagas se ven con candado y el dibujo empañado, y se
// venden por WhatsApp. Las portadas son tapas verticales con el dibujo de línea de las portadas de los módulos.
function Tapa({ tool, indice, abierta, onAbrir }) {
  const paga = tool.estado === 'paga'
  return (
    <button type="button" className={`tl-tapa${paga ? ' is-paga' : ''}${abierta ? ' is-on' : ''}`} onClick={onAbrir} aria-expanded={abierta}>
      <span className="tl-tapa__meta">
        <span>Tool {String(indice + 1).padStart(2, '0')}</span>
        <span>{paga && tool.precio ? tool.precio : tool.duracion}</span>
      </span>
      <span className="tl-tapa__dib"><DibujoTool id={tool.id} /></span>
      {paga ? (
        <span className="tl-tapa__candado">
          <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></svg>
          Bloqueado
        </span>
      ) : null}
      <span className="tl-tapa__cab">
        <span className={`tl-tapa__pill${tool.nuevo ? ' is-nuevo' : ''}`}>{tool.nuevo ? 'Nuevo' : 'Tool'}</span>
        <b>{tool.nombre}</b>
      </span>
      <span className="tl-tapa__pie">
        <span>{paga ? 'Para sumar' : 'En tu plan'}</span>
        <Isotipo className="tl-tapa__iso" />
      </span>
    </button>
  )
}

export default function ToolsPage() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(null)
  const [abriendo, setAbriendo] = useState(false)

  // Salta al proyecto de agentes con un pase firmado que vence en un minuto (no hay que volver a loguearse).
  async function abrir(id) {
    setAbriendo(true)
    setError('')
    try {
      const { url } = await abrirTool(id)
      window.location.assign(url)
    } catch (e) {
      setError(e.message || 'No se pudo abrir la tool.')
      setAbriendo(false)
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
  const grupos = [
    ['En tu plan', tools.filter((t) => t.estado === 'incluida')],
    ['Para sumar', tools.filter((t) => t.estado === 'paga')],
  ].filter(([, lista]) => lista.length)
  const sel = tools.find((t) => t.id === abierta)
  const contacto = datos?.contacto

  return (
    <div className="app-shell im-root">
      <AppHeader />
      <DefsTools />
      <main className="mt-grid-page">
        <header className="mt-grid-head">
          <Link to="/" className="im-back">
            <Chevron dir="left" /> Inicio
          </Link>
          <h1>Tools</h1>
          {datos?.visible === false ? (
            <span className="tl-aviso">Oculta para los clientes · <Link to="/admin?vista=tools">prenderla</Link></span>
          ) : null}
        </header>

        {error && !datos ? <p className="im-error">{error}</p> : !datos ? <p className="pc-loading">Cargando tools…</p> : (
          <div className="mt-sops">
            {grupos.map(([titulo, lista]) => (
              <section key={titulo} className="mt-estante">
                <div className="mt-estante__cab">
                  <h2>{titulo} <span className="num">{lista.length}</span></h2>
                </div>
                <div className="mt-estante__fila tl-fila">
                  {lista.map((t) => (
                    <Tapa key={t.id} tool={t} indice={tools.indexOf(t)} abierta={abierta === t.id} onAbrir={() => setAbierta(abierta === t.id ? null : t.id)} />
                  ))}
                </div>
                {sel && lista.includes(sel) ? (
                  <div className="mt-estante__det">
                    <div className="mt-estante__det-txt">
                      <h3>{sel.nombre}</h3>
                      <p className="tl-desc">{sel.descripcion}</p>
                    </div>
                    {sel.estado === 'paga' ? (
                      contacto?.link ? (
                        <a href={contacto.link} target="_blank" rel="noreferrer" className="pc-btn pc-btn--light">
                          Sumarla con {contacto.nombre.split(' ')[0]} <Chevron />
                        </a>
                      ) : null
                    ) : sel.abrir ? (
                      <button type="button" className="pc-btn pc-btn--light" disabled={abriendo} onClick={() => abrir(sel.id)}>
                        {abriendo ? 'Abriendo…' : 'Abrir'} <Chevron />
                      </button>
                    ) : (
                      <span className="mt-estante__pronto">Muy pronto</span>
                    )}
                  </div>
                ) : null}
              </section>
            ))}
            {error ? <p className="im-error" role="alert">{error}</p> : null}
            {!grupos.length ? <p className="mt-sops__vacio">Todavía no hay tools para tu plan.</p> : null}
          </div>
        )}
      </main>
    </div>
  )
}
