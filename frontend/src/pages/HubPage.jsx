import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import AppHeader from '../components/AppHeader'
import AccesoRestante from '../components/AccesoRestante'
import MainNav from '../components/MainNav'
import { useAuth } from '../context/AuthContext'
import { ApiError, getStoredToken } from '../api/client'

/** Frase del título — cambiar acá si querés otro copy */
export const HUB_TITLE_PREFIX = 'Pregunta lo que '
export const HUB_TITLE_EMPHASIS = 'sea'

/** Nombre del agente RAG */
export const AGENT_NAME = 'Juan'

const CHAT_MAX_WIDTH = '780px'
const FUENTES_MARKER = 'FUENTES:'
const FUENTES_HOLD_BACK = FUENTES_MARKER.length - 1

const ATV = {
  black: '#0a0a0a',
  surface: '#141414',
  border: '#232323',
  red: '#980000',
  text: '#f2f2f0',
  secondary: '#88857c',
  muted: '#5f5e5a',
  userBubble: '#1a1a1a',
  userBorder: '#2a2a2a',
  avatarUser: '#2a2a2a',
}

marked.setOptions({
  breaks: true,
  gfm: true,
})

function IconClip() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16.5 6.5v9.75a4.25 4.25 0 01-8.5 0V5.75a2.75 2.75 0 015.5 0v10.5a1.5 1.5 0 01-3 0V6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconSendUp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 19V5M12 5l-5 5M12 5l5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function mensajeError(error) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'Tu sesión expiró. Volvé a iniciar sesión.'
    }
    if (error.status === 504) {
      return 'Juan tardó demasiado en responder. Intentá de nuevo.'
    }
    if (error.status === 502) {
      return 'No pudimos obtener una respuesta del asistente. Intentá más tarde.'
    }
    return error.message || 'Ocurrió un error inesperado.'
  }
  return 'Ocurrió un error inesperado. Intentá de nuevo.'
}

function obtenerIniciales(nombre) {
  if (!nombre?.trim()) return '?'
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length >= 2) {
    return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase()
  }
  return partes[0].slice(0, 2).toUpperCase()
}

function renderMarkdown(texto) {
  const html = marked.parse(texto || '')
  const conLinks = html.replace(
    /(\/programas\/(\d+)\?clase=(\d+))/g,
    '<a href="/classroom/$2?clase=$3" style="color: #e8453f">ver clase →</a>',
  )
  return { __html: conLinks }
}

function procesarChunkStream(pending, chunk) {
  const buffer = pending + chunk
  const markerIdx = buffer.indexOf(FUENTES_MARKER)

  if (markerIdx !== -1) {
    const texto = buffer.slice(0, markerIdx)
    const fuentesRaw = buffer.slice(markerIdx + FUENTES_MARKER.length)

    try {
      const fuentes = JSON.parse(fuentesRaw)
      return { pending: '', texto, fuentes, terminado: true }
    } catch {
      return { pending: buffer, texto: '', fuentes: null, terminado: false }
    }
  }

  if (buffer.length <= FUENTES_HOLD_BACK) {
    return { pending: buffer, texto: '', fuentes: null, terminado: false }
  }

  const texto = buffer.slice(0, buffer.length - FUENTES_HOLD_BACK)
  const restante = buffer.slice(buffer.length - FUENTES_HOLD_BACK)
  return { pending: restante, texto, fuentes: null, terminado: false }
}

function Avatar({ label, variant = 'user' }) {
  const esAgente = variant === 'agent'
  return (
    <div
      style={{
        flexShrink: 0,
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.68rem',
        fontWeight: 600,
        letterSpacing: esAgente ? '0.02em' : '0',
        background: esAgente ? ATV.red : ATV.avatarUser,
        color: esAgente ? '#fff' : ATV.text,
      }}
      aria-hidden="true"
    >
      {label}
    </div>
  )
}

function MarkdownContent({ text }) {
  return (
    <div
      className="hub-chat-md"
      dangerouslySetInnerHTML={renderMarkdown(text)}
    />
  )
}

function UserBubble({ pregunta, iniciales }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'flex-end',
        gap: '10px',
        marginBottom: '16px',
      }}
    >
      <div
        style={{
          maxWidth: '75%',
          padding: '12px 16px',
          background: ATV.userBubble,
          border: `1px solid ${ATV.userBorder}`,
          borderRadius: '18px 18px 4px 18px',
          color: ATV.text,
          fontSize: '0.88rem',
          lineHeight: 1.5,
          textAlign: 'left',
        }}
      >
        {pregunta}
      </div>
      <Avatar label={iniciales} variant="user" />
    </div>
  )
}

function AgentBubble({ item }) {
  const mostrarFuentes = item.typingComplete && !item.pending && item.fuentes?.length > 0
  const mostrarCursor = item.streaming && !item.pending

  return (
    <div style={{ marginBottom: '16px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
        }}
      >
        <Avatar label="A" variant="agent" />
        <div style={{ flex: 1, minWidth: 0, maxWidth: '90%' }}>
          <div
            style={{
              padding: '12px 16px',
              background: ATV.surface,
              border: `1px solid ${ATV.border}`,
              borderRadius: '18px 18px 18px 4px',
              color: ATV.text,
              fontSize: '0.88rem',
              lineHeight: 1.55,
              textAlign: 'left',
            }}
          >
            {item.pending ? (
              <span style={{ color: ATV.secondary }}>
                {AGENT_NAME} está pensando...
              </span>
            ) : (
              <>
                <MarkdownContent text={item.respuesta} />
                {mostrarCursor && (
                  <span className="hub-stream-cursor" aria-hidden="true">
                    |
                  </span>
                )}
              </>
            )}
          </div>

          {mostrarFuentes && (
            <div style={{ marginTop: '8px', paddingLeft: '4px' }}>
              {item.fuentes.map((fuente) => (
                <p
                  key={`${fuente.modulo}-${fuente.clase}`}
                  style={{
                    margin: '2px 0 0',
                    fontSize: '11px',
                    color: ATV.muted,
                    lineHeight: 1.4,
                  }}
                >
                  Fuente: {fuente.modulo} → {fuente.clase}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ChatInput({ mensaje, setMensaje, cargando, onSubmit, centered = false }) {
  return (
    <form
      className="hub-chat"
      onSubmit={onSubmit}
      style={
        centered
          ? undefined
          : { width: '100%', maxWidth: CHAT_MAX_WIDTH, margin: '0 auto' }
      }
    >
      <div className="hub-chat__field">
        <input
          type="text"
          className="hub-chat__input"
          placeholder={`Pregúntale a ${AGENT_NAME} lo que sea...`}
          value={mensaje}
          onChange={(event) => setMensaje(event.target.value)}
          aria-label={`Mensaje para ${AGENT_NAME}`}
          disabled={cargando}
        />
        <div className="hub-chat__actions">
          <button
            type="button"
            className="hub-chat__icon-btn"
            aria-label="Adjuntar archivo"
            disabled
            title="Próximamente"
          >
            <IconClip />
          </button>
          <button
            type="submit"
            className="hub-chat__send"
            aria-label="Enviar mensaje"
            disabled={!mensaje.trim() || cargando}
          >
            <IconSendUp />
          </button>
        </div>
      </div>
    </form>
  )
}

export default function HubPage() {
  const { user } = useAuth()
  const iniciales = obtenerIniciales(user?.nombre)

  const [mensaje, setMensaje] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [historial, setHistorial] = useState([])

  const chatEndRef = useRef(null)

  const tieneMensajes = historial.length > 0

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [historial, cargando])

  async function enviarChatStream(pregunta, messageId) {
    const token = getStoredToken()
    const headers = { 'Content-Type': 'application/json' }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ pregunta }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      const detail = data.detail
      const message =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail[0]?.msg
            : 'Error inesperado'
      throw new ApiError(message, response.status)
    }

    if (!response.body) {
      throw new ApiError('No se pudo leer la respuesta del asistente.', 502)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const resultado = procesarChunkStream(pending, chunk)
      pending = resultado.pending

      if (resultado.terminado) {
        setHistorial((prev) =>
          prev.map((entry) => {
            if (entry.id !== messageId) return entry
            return {
              ...entry,
              pending: false,
              streaming: false,
              typingComplete: true,
              respuesta: entry.respuesta + resultado.texto,
              fuentes: resultado.fuentes ?? [],
            }
          }),
        )
        return
      }

      if (resultado.texto) {
        setHistorial((prev) =>
          prev.map((entry) => {
            if (entry.id !== messageId) return entry
            return {
              ...entry,
              pending: false,
              streaming: true,
              respuesta: entry.respuesta + resultado.texto,
            }
          }),
        )
      }
    }

    if (pending) {
      const markerIdx = pending.indexOf(FUENTES_MARKER)
      if (markerIdx !== -1) {
        const texto = pending.slice(0, markerIdx)
        const fuentesRaw = pending.slice(markerIdx + FUENTES_MARKER.length)
        const fuentes = JSON.parse(fuentesRaw)

        setHistorial((prev) =>
          prev.map((entry) => {
            if (entry.id !== messageId) return entry
            return {
              ...entry,
              pending: false,
              streaming: false,
              typingComplete: true,
              respuesta: entry.respuesta + texto,
              fuentes,
            }
          }),
        )
        return
      }

      setHistorial((prev) =>
        prev.map((entry) => {
          if (entry.id !== messageId) return entry
          return {
            ...entry,
            pending: false,
            streaming: false,
            typingComplete: true,
            respuesta: entry.respuesta + pending,
          }
        }),
      )
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const pregunta = mensaje.trim()
    if (!pregunta || cargando) return

    const messageId = Date.now()

    setMensaje('')
    setError('')
    setCargando(true)

    setHistorial((prev) => [
      ...prev.map((entry) => ({ ...entry, typingComplete: true, streaming: false })),
      {
        id: messageId,
        pregunta,
        respuesta: '',
        fuentes: [],
        pending: true,
        streaming: false,
        typingComplete: false,
      },
    ])

    try {
      await enviarChatStream(pregunta, messageId)
    } catch (err) {
      setHistorial((prev) => prev.filter((entry) => entry.id !== messageId))
      setError(mensajeError(err))
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="app-shell hub-page">
      <style>{`
        @keyframes hub-cursor-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }

        .hub-stream-cursor {
          display: inline-block;
          margin-left: 1px;
          color: ${ATV.text};
          font-weight: 300;
          animation: hub-cursor-blink 1s step-end infinite;
        }

        .hub-chat-md p {
          margin: 0 0 0.65em;
        }

        .hub-chat-md p:last-child {
          margin-bottom: 0;
        }

        .hub-chat-md h3 {
          margin: 0.4em 0 0.5em;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.35;
          color: ${ATV.text};
        }

        .hub-chat-md strong {
          font-weight: 600;
          color: ${ATV.text};
        }

        .hub-chat-md em {
          font-style: italic;
        }

        .hub-chat-md ul,
        .hub-chat-md ol {
          margin: 0.4em 0 0.65em;
          padding: 0;
          list-style: none;
        }

        .hub-chat-md li {
          margin: 0.25em 0;
          padding-left: 1rem;
        }

        .hub-chat-md blockquote {
          margin: 0.5em 0;
          padding: 0.35em 0 0.35em 0.85em;
          border-left: 3px solid ${ATV.red};
          color: ${ATV.secondary};
        }

        .hub-page__main--chat {
          align-items: stretch;
          justify-content: flex-start;
          min-height: calc(100dvh - 73px);
          padding: 24px 20px 0;
        }

        .hub-page__hero--compact {
          max-width: ${CHAT_MAX_WIDTH};
          width: 100%;
          margin: 0 auto;
          flex-shrink: 0;
        }

        .hub-page__hero--compact .hub-page__title {
          margin-bottom: 20px;
          font-size: clamp(1.6rem, 4vw, 2.1rem);
        }

        .hub-page__hero--compact .main-nav {
          margin-bottom: 14px;
        }

        .hub-page__hero--compact .hub-page__access {
          margin-bottom: 20px;
        }

        .hub-chat-area {
          flex: 1;
          width: 100%;
          max-width: ${CHAT_MAX_WIDTH};
          margin: 0 auto;
          overflow-y: auto;
          padding: 8px 0 16px;
          scrollbar-width: thin;
          scrollbar-color: ${ATV.border} transparent;
        }

        .hub-chat-footer {
          flex-shrink: 0;
          width: 100%;
          padding: 12px 20px 20px;
          background: linear-gradient(180deg, transparent 0%, rgba(10, 10, 10, 0.92) 28%);
        }
      `}</style>

      <div className="hub-page__halo" aria-hidden="true" />

      <AppHeader />

      {!tieneMensajes ? (
        <main className="hub-page__main">
          <div className="hub-page__hero">
            <p className="hub-page__eyebrow">Aumenta tu valor</p>

            <h1 className="hub-page__title">
              {HUB_TITLE_PREFIX}
              <em className="hub-page__title-em">{HUB_TITLE_EMPHASIS}</em>
            </h1>

            <MainNav />

            <AccesoRestante />

            <ChatInput
              mensaje={mensaje}
              setMensaje={setMensaje}
              cargando={cargando}
              onSubmit={handleSubmit}
              centered
            />

            {error && (
              <p
                style={{
                  margin: '14px 0 0',
                  maxWidth: '480px',
                  fontSize: '0.82rem',
                  color: ATV.red,
                  lineHeight: 1.45,
                }}
                role="alert"
              >
                {error}
              </p>
            )}
          </div>
        </main>
      ) : (
        <main
          className="hub-page__main hub-page__main--chat"
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          <div className="hub-page__hero hub-page__hero--compact">
            <p className="hub-page__eyebrow">Aumenta tu valor</p>

            <h1 className="hub-page__title">
              {HUB_TITLE_PREFIX}
              <em className="hub-page__title-em">{HUB_TITLE_EMPHASIS}</em>
            </h1>

            <MainNav />

            <AccesoRestante />
          </div>

          <div
            className="hub-chat-area"
            style={{
              maxHeight: 'calc(100dvh - 73px - 220px - 96px)',
            }}
            aria-live="polite"
          >
            {historial.map((item) => (
              <div key={item.id}>
                <UserBubble pregunta={item.pregunta} iniciales={iniciales} />
                <AgentBubble item={item} />
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="hub-chat-footer">
            <ChatInput
              mensaje={mensaje}
              setMensaje={setMensaje}
              cargando={cargando}
              onSubmit={handleSubmit}
            />

            {error && (
              <p
                style={{
                  margin: '10px auto 0',
                  maxWidth: CHAT_MAX_WIDTH,
                  fontSize: '0.82rem',
                  color: ATV.red,
                  lineHeight: 1.45,
                  textAlign: 'center',
                }}
                role="alert"
              >
                {error}
              </p>
            )}
          </div>
        </main>
      )}
    </div>
  )
}
