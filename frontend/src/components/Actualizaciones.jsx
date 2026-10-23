import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Isotipo from './marca/Isotipo'
import '../styles/actualizaciones.css'

// Dos cosas para los deploys:
// 1. Si el servidor no contesta (se está reiniciando), "Estamos mejorando" en vez de errores; vuelve solo.
// 2. Cuando hay una versión nueva, la app se actualiza sola en un momento que no moleste: al cambiar de
//    pantalla, al volver a la app o tras unos minutos sin tocar nada. Nunca mientras alguien escribe.

const VERSION = __VERSION__
const CADA_MS = 2 * 60 * 1000
const QUIETO_MS = 4 * 60 * 1000

async function versionPublicada() {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return null
    return (await r.json()).version || null
  } catch {
    return null
  }
}

async function servidorResponde() {
  try {
    const r = await fetch(`/api/salud?t=${Date.now()}`, { cache: 'no-store' })
    return r.ok
  } catch {
    return false
  }
}

// Recarga pidiendo el index.html nuevo (el parámetro evita que el navegador use el guardado).
function recargar(version) {
  const url = new URL(window.location.href)
  url.searchParams.set('_v', version || Date.now().toString(36))
  window.location.replace(url.toString())
}

function escribiendo() {
  const el = document.activeElement
  if (!el) return false
  const campo = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'submit'].includes(el.type)) || el.isContentEditable
  return Boolean(campo && (el.value || el.textContent || '').trim())
}

export default function Actualizaciones() {
  const location = useLocation()
  const [caido, setCaido] = useState(false)
  const nueva = useRef(null)
  const ultimaActividad = useRef(Date.now())
  const primeraRuta = useRef(true)

  // --- 1. servidor caído ---
  useEffect(() => {
    let probando = false
    async function alCaer() {
      if (probando || !navigator.onLine) return
      probando = true
      // Una falla suelta no alcanza: se confirma antes de tapar la pantalla.
      if (await servidorResponde()) {
        probando = false
        return
      }
      setCaido(true)
      while (!(await servidorResponde())) await new Promise((ok) => setTimeout(ok, 2000))
      // Volvió: casi siempre es un deploy, así que se carga la versión nueva (o se recarga lo que había).
      const v = await versionPublicada()
      recargar(v)
    }
    window.addEventListener('atv-caida', alCaer)
    return () => window.removeEventListener('atv-caida', alCaer)
  }, [])

  // --- 2. versión nueva ---
  useEffect(() => {
    if (VERSION === 'dev') return undefined
    async function revisar() {
      const v = await versionPublicada()
      if (v && v !== VERSION) nueva.current = v
      return nueva.current
    }
    function aplicarSiSePuede() {
      if (nueva.current && !escribiendo()) recargar(nueva.current)
    }
    const alVolver = async () => {
      if (document.hidden) return
      if (await revisar()) aplicarSiSePuede()
    }
    const marcar = () => {
      ultimaActividad.current = Date.now()
    }
    const t = setInterval(async () => {
      await revisar()
      if (nueva.current && Date.now() - ultimaActividad.current > QUIETO_MS) aplicarSiSePuede()
    }, CADA_MS)
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('pageshow', alVolver)
    ;['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((e) => window.addEventListener(e, marcar, { passive: true }))
    revisar()
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('pageshow', alVolver)
      ;['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((e) => window.removeEventListener(e, marcar))
    }
  }, [])

  // Al cambiar de pantalla, si había versión nueva, se entra ya con la nueva.
  useEffect(() => {
    if (primeraRuta.current) {
      primeraRuta.current = false
      return
    }
    if (nueva.current) recargar(nueva.current)
  }, [location.pathname])

  if (!caido) return null
  return (
    <div className="atv-mejorando" role="status" aria-live="polite">
      <Isotipo className="atv-mejorando__logo" titulo="ATV" />
      <h1>Estamos mejorando ATV Classroom</h1>
      <p>Vuelve en unos segundos.</p>
      <span className="atv-mejorando__carga" aria-hidden="true" />
    </div>
  )
}
