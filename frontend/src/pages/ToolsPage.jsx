import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client'
import { fetchTools } from '../api/tools'
import AppHeader from '../components/AppHeader'
import { Chevron } from '../components/frentes/piezas'
import Isotipo from '../components/marca/Isotipo'
import '../styles/frentes.css'
import '../styles/material.css'
import '../styles/tools.css'

// Tools: herramientas con IA. Las de su plan se usan; las pagas se ven con candado y se venden por WhatsApp.
// Las tapas son las mismas de los SOPs.
const TAPA = { roja: 'roja', negra: 'oscura', crema: 'piedra', blanca: 'blanca' }

function Tapa({ tool, indice, abierta, onAbrir }) {
  const paga = tool.estado === 'paga'
  return (
    <button
      type="button"
      className={`mt-tapa is-${TAPA[tool.tono] || 'oscura'}${paga ? ' tl-tapa--paga' : ''}${abierta ? ' is-on' : ''}`}
      onClick={onAbrir}
      aria-expanded={abierta}
    >
      <span className="mt-tapa__cab">
        <span className="num">TOOL {String(indice + 1).padStart(2, '0')}</span>
        <Isotipo className="mt-tapa__logo" titulo="ATV" />
      </span>
      <b>{tool.nombre}</b>
      <small>{tool.duracion}</small>
      <span className="mt-tapa__pie">
        {paga ? <span className="tl-candado">Bloqueado</span> : <span>INCLUIDA</span>}
        {paga && tool.precio ? <span>{tool.precio}</span> : null}
      </span>
      <Isotipo className="mt-tapa__marca" />
    </button>
  )
}

export default function ToolsPage() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(null)

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

        {error ? <p className="im-error">{error}</p> : !datos ? <p className="pc-loading">Cargando tools…</p> : (
          <div className="mt-sops">
            {grupos.map(([titulo, lista]) => (
              <section key={titulo} className="mt-estante">
                <div className="mt-estante__cab">
                  <h2>{titulo} <span className="num">{lista.length}</span></h2>
                </div>
                <div className="mt-estante__fila">
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
                    ) : (
                      <span className="mt-estante__pronto">Muy pronto</span>
                    )}
                  </div>
                ) : null}
              </section>
            ))}
            {!grupos.length ? <p className="mt-sops__vacio">Todavía no hay tools para tu plan.</p> : null}
          </div>
        )}
      </main>
    </div>
  )
}
