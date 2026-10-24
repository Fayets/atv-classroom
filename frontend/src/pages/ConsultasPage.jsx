import { useEffect, useRef, useState } from 'react'
import { Marked } from 'marked'
import { empezarConsulta, estadoConsulta } from '../api/consultas'
import AppHeader from '../components/AppHeader'
import '../styles/consultas.css'

// Preguntarle al cerebro: todo lo que se habló con los clientes, sus llamadas, roadmaps y avance.
// La respuesta sale de consultas a la base (se pueden ver abajo de cada una), no de memoria.

const SUGERIDAS = [
  '¿Qué fue lo que más preguntaron los clientes?',
  '¿Qué objeciones aparecen más antes de cerrar una venta?',
  '¿Qué les funcionó a los clientes que más avanzaron?',
  '¿Qué clientes llevan más de 7 días sin escribir?',
  '¿Qué dolores se repiten este mes?',
  '¿Qué temas preguntan que no tienen una clase?',
]
const GUARDADO = 'atv-consultas-conversacion'

const escapar = (t) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
// Las respuestas citan mensajes de clientes: el HTML que venga adentro se muestra como texto, nunca se ejecuta.
const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html: ({ text }) => escapar(text),
    link({ href, tokens }) {
      const texto = this.parser.parseInline(tokens)
      return /^https?:\/\//i.test(href || '') ? `<a href="${escapar(href)}" target="_blank" rel="noopener noreferrer">${texto}</a>` : texto
    },
    image: ({ text }) => escapar(text || ''),
  },
})

function leer() {
  try {
    return JSON.parse(sessionStorage.getItem(GUARDADO) || '[]')
  } catch {
    return []
  }
}

export default function ConsultasPage() {
  const [turnos, setTurnos] = useState(leer)
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(null) // { pasos, desde }
  const [segundos, setSegundos] = useState(0)
  const lista = useRef(null)
  const campo = useRef(null)

  useEffect(() => {
    try {
      sessionStorage.setItem(GUARDADO, JSON.stringify(turnos.slice(-30)))
    } catch {
      /* sin almacenamiento: la conversación vive mientras la pestaña esté abierta */
    }
  }, [turnos])

  // Al preguntar (y mientras piensa) se baja hasta el final; cuando llega la respuesta, queda a la vista
  // su comienzo, para leerla de arriba hacia abajo.
  useEffect(() => {
    const el = lista.current
    if (!el) return
    const ultimo = turnos[turnos.length - 1]
    if (ultimo?.rol === 'cerebro' && !pensando) {
      const respuestas = el.querySelectorAll('.cq-resp')
      const r = respuestas[respuestas.length - 1]
      if (r) el.scrollTo({ top: r.offsetTop - el.offsetTop - 12, behavior: 'smooth' })
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [turnos, pensando])

  useEffect(() => {
    if (!pensando) return undefined
    const t = setInterval(() => setSegundos(Math.round((Date.now() - pensando.desde) / 1000)), 1000)
    return () => clearInterval(t)
  }, [pensando])

  async function preguntar(q) {
    const pregunta = (q ?? texto).trim()
    if (pregunta.length < 3 || pensando) return
    setTexto('')
    const historial = turnos.filter((t) => !t.error).map((t) => ({ rol: t.rol, texto: t.texto }))
    setTurnos((ts) => [...ts, { rol: 'equipo', texto: pregunta }])
    setPensando({ pasos: [], desde: Date.now() })
    setSegundos(0)
    try {
      const { id } = await empezarConsulta(pregunta, historial)
      for (;;) {
        await new Promise((ok) => setTimeout(ok, 1500))
        const r = await estadoConsulta(id)
        if (r.estado === 'pensando') {
          setPensando((p) => (p && p.pasos.length !== r.pasos.length ? { ...p, pasos: r.pasos } : p))
          continue
        }
        if (r.estado === 'listo') setTurnos((ts) => [...ts, { rol: 'cerebro', texto: r.respuesta, consultas: r.consultas }])
        else setTurnos((ts) => [...ts, { rol: 'cerebro', texto: r.error || 'No se pudo responder.', error: true }])
        break
      }
    } catch (err) {
      setTurnos((ts) => [...ts, { rol: 'cerebro', texto: err.message || 'No se pudo responder. Probá de nuevo.', error: true }])
    } finally {
      setPensando(null)
      campo.current?.focus()
    }
  }

  function nueva() {
    if (pensando) return
    setTurnos([])
    campo.current?.focus()
  }

  return (
    <div className="app-shell cq-root">
      <AppHeader />
      <div className="cq-cuerpo">
        <div className="cq-cab">
          <div>
            <h1>Consultas</h1>
            <span>Preguntale al cerebro sobre los clientes, sus conversaciones, llamadas y roadmaps</span>
          </div>
          {turnos.length ? (
            <button type="button" className="cq-nueva" onClick={nueva} disabled={Boolean(pensando)}>
              Nueva consulta
            </button>
          ) : null}
        </div>

        <div className="cq-lista" ref={lista} aria-live="polite">
          {!turnos.length && !pensando ? (
            <div className="cq-vacio">
              <p>Probá con una de estas o escribí la tuya:</p>
              <div className="cq-sugeridas">
                {SUGERIDAS.map((s) => (
                  <button key={s} type="button" onClick={() => preguntar(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {turnos.map((t, i) =>
            t.rol === 'equipo' ? (
              <p key={i} className="cq-yo">{t.texto}</p>
            ) : (
              <article key={i} className={`cq-resp${t.error ? ' is-error' : ''}`}>
                {/* eslint-disable-next-line react/no-danger */}
                <div className="cq-md" dangerouslySetInnerHTML={{ __html: t.error ? escapar(t.texto) : md.parse(t.texto || '') }} />
                {t.consultas?.length ? (
                  <details className="cq-como">
                    <summary>Cómo lo calculé · {t.consultas.length} {t.consultas.length === 1 ? 'consulta' : 'consultas'} a la base</summary>
                    <ol>
                      {t.consultas.map((c, j) => (
                        <li key={j}>
                          <b>{c.para_que || 'Consulta'}</b>
                          <span>{c.error ? `Error: ${c.error}` : `${c.filas} ${c.filas === 1 ? 'fila' : 'filas'}`}</span>
                          <pre>{c.sql}</pre>
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </article>
            ),
          )}

          {pensando ? (
            <div className="cq-pensando">
              <span className="cq-pensando__cab">
                <i aria-hidden="true" />
                Consultando el cerebro… {segundos ? `${segundos} s` : ''}
              </span>
              {pensando.pasos.length ? (
                <ul>
                  {pensando.pasos.map((p, i) => (
                    <li key={i} className={i === pensando.pasos.length - 1 ? 'is-ultimo' : ''}>{p}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <form
          className="cq-campo"
          onSubmit={(e) => {
            e.preventDefault()
            preguntar()
          }}
        >
          <textarea
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                preguntar()
              }
            }}
            placeholder="Preguntá sobre los clientes…"
            rows={1}
            maxLength={4000}
            aria-label="Pregunta"
          />
          <button type="submit" disabled={Boolean(pensando) || texto.trim().length < 3} aria-label="Preguntar">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </form>
      </div>
    </div>
  )
}
