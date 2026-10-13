import { useEffect, useRef, useState } from 'react'

const MAX_SEGUNDOS = 5 * 60
const FORMATOS = [
  ['audio/webm;codecs=opus', 'webm'],
  ['audio/mp4', 'm4a'],
  ['audio/ogg;codecs=opus', 'ogg'],
  ['audio/webm', 'webm'],
]

const reloj = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export const puedeGrabar = () => typeof window !== 'undefined' && Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia)

// Nota de voz como en WhatsApp: se graba, se ve el tiempo, y se cancela o se manda.
// Solo para clientes (el equipo responde escribiendo).
export default function GrabarAudio({ onMandar, onCerrar }) {
  const [segundos, setSegundos] = useState(0)
  const [error, setError] = useState('')
  const grabador = useRef(null)
  const partes = useRef([])
  const destino = useRef('cancelar') // qué hacer al parar: mandar o descartar
  const formato = useRef(FORMATOS[0])
  // Las funciones del padre van por ref: si cambian, la grabación no se reinicia.
  const alMandar = useRef(onMandar)
  const alCerrar = useRef(onCerrar)
  alMandar.current = onMandar
  alCerrar.current = onCerrar

  useEffect(() => {
    let vivo = true
    let flujo = null
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((f) => {
        if (!vivo) return f.getTracks().forEach((t) => t.stop())
        flujo = f
        formato.current = FORMATOS.find(([m]) => MediaRecorder.isTypeSupported(m)) || ['', 'webm']
        const r = new MediaRecorder(f, formato.current[0] ? { mimeType: formato.current[0] } : undefined)
        r.ondataavailable = (e) => e.data.size && partes.current.push(e.data)
        r.onstop = () => {
          f.getTracks().forEach((t) => t.stop())
          if (destino.current !== 'mandar' || !partes.current.length) return alCerrar.current()
          const tipo = (r.mimeType || formato.current[0] || 'audio/webm').split(';')[0]
          const ext = tipo.includes('mp4') ? 'm4a' : tipo.includes('ogg') ? 'ogg' : 'webm'
          const blob = new Blob(partes.current, { type: tipo })
          alMandar.current(new File([blob], `nota-de-voz.${ext}`, { type: tipo }))
        }
        r.start(250)
        grabador.current = r
      })
      .catch(() => vivo && setError('Para grabar, permití el micrófono en tu navegador.'))
    return () => {
      vivo = false
      if (grabador.current?.state === 'recording') {
        destino.current = 'cancelar'
        grabador.current.stop()
      } else flujo?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  useEffect(() => {
    if (error) return undefined
    const t = setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [error])

  function terminar(como) {
    destino.current = como
    if (grabador.current?.state === 'recording') grabador.current.stop()
    else alCerrar.current()
  }

  useEffect(() => {
    if (segundos >= MAX_SEGUNDOS) terminar('mandar')
  }, [segundos]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="msj-grabar" role="group" aria-label="Grabando nota de voz">
      <button type="button" className="msj-grabar__cancelar" onClick={() => terminar('cancelar')} aria-label="Descartar la nota de voz" title="Descartar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
        </svg>
      </button>
      {error ? (
        <span className="msj-grabar__error" role="alert">{error}</span>
      ) : (
        <span className="msj-grabar__estado">
          <i aria-hidden="true" />
          Grabando <b>{reloj(segundos)}</b>
          <small>máximo 5:00</small>
        </span>
      )}
      <button type="button" className="msj-grabar__mandar" onClick={() => terminar('mandar')} disabled={Boolean(error)} aria-label="Mandar la nota de voz">
        ➤
      </button>
    </div>
  )
}
