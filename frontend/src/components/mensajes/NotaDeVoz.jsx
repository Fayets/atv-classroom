import { useEffect, useRef, useState } from 'react'

const reloj = (s) => (Number.isFinite(s) && s >= 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00')

// Reproductor de audio propio. El del navegador no sirve para las notas grabadas en el classroom: el webm
// de MediaRecorder no trae la duración, así que la barra aparecía llena desde el principio. Acá la duración
// se averigua al cargar (saltando al final y volviendo) y la barra avanza con transform, un cuadro a la vez,
// sin re-render de React (igual que el arrastre del tablero).
export default function NotaDeVoz({ src }) {
  const audio = useRef(null)
  const barra = useRef(null)
  const tiempo = useRef(null)
  const cuadro = useRef(0)
  const [sonando, setSonando] = useState(false)
  const [duracion, setDuracion] = useState(null)

  // La duración real: si el archivo no la trae (Infinity), se pide el final y el navegador la descubre.
  useEffect(() => {
    const a = audio.current
    if (!a) return undefined
    const medir = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) {
        setDuracion(a.duration)
        return
      }
      const listo = () => {
        a.removeEventListener('timeupdate', listo)
        if (Number.isFinite(a.duration)) setDuracion(a.duration)
        a.currentTime = 0
      }
      a.addEventListener('timeupdate', listo)
      a.currentTime = 1e101
    }
    a.addEventListener('loadedmetadata', medir)
    if (a.readyState >= 1) medir()
    return () => a.removeEventListener('loadedmetadata', medir)
  }, [src])

  const pintar = () => {
    const a = audio.current
    if (!a) return
    const total = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : duracion
    const p = total ? Math.min(1, a.currentTime / total) : 0
    if (barra.current) barra.current.style.transform = `scaleX(${p})`
    if (tiempo.current) tiempo.current.textContent = reloj(a.paused && a.currentTime === 0 ? total : a.currentTime)
  }

  useEffect(() => {
    if (!sonando) {
      cancelAnimationFrame(cuadro.current)
      pintar()
      return undefined
    }
    const paso = () => {
      pintar()
      cuadro.current = requestAnimationFrame(paso)
    }
    cuadro.current = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(cuadro.current)
  }, [sonando, duracion]) // eslint-disable-line react-hooks/exhaustive-deps

  function alternar() {
    const a = audio.current
    if (!a) return
    if (a.paused) a.play().catch(() => setSonando(false))
    else a.pause()
  }

  // Tocar la barra salta a ese punto.
  function saltar(e) {
    const a = audio.current
    const total = Number.isFinite(a?.duration) && a.duration > 0 ? a.duration : duracion
    if (!a || !total) return
    const r = e.currentTarget.getBoundingClientRect()
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * total
    pintar()
  }

  return (
    <div className="nv">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setSonando(true)}
        onPause={() => setSonando(false)}
        onEnded={() => {
          setSonando(false)
          if (audio.current) audio.current.currentTime = 0
          pintar()
        }}
      />
      <button type="button" className="nv__boton" onClick={alternar} aria-label={sonando ? 'Pausar' : 'Reproducir'}>
        {sonando ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
        )}
      </button>
      <div className="nv__pista" onClick={saltar} role="presentation">
        <i ref={barra} className="nv__avance" />
      </div>
      {/* El texto lo pone pintar(): React no lo toca para no pisarse con el cuadro a cuadro. */}
      <span ref={tiempo} className="nv__tiempo" />
    </div>
  )
}
