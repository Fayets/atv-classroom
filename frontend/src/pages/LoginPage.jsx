import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, fetchAuthConfig } from '../api/client'
import GoogleButton from '../components/GoogleButton'
import Lightfall from '../components/efectos/Lightfall'
import Isotipo from '../components/marca/Isotipo'
import { elegirModo } from '../utils/modo'
import { useAuth } from '../context/AuthContext'
import '../styles/login.css'
import { VOLVER_A } from './LeveragePage'


const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/


function validarEmail(value) {
  const limpio = value.trim()
  if (!limpio) return 'Ingresá tu email.'
  if (!EMAIL_REGEX.test(limpio)) return 'Ese email no parece válido.'
  return ''
}

// Si venía de conectar ATV Leverage, vuelve ahí después de entrar (lo deja LeveragePage). Solo esa ruta.
function destino(porDefecto) {
  try {
    const volver = sessionStorage.getItem(VOLVER_A)
    sessionStorage.removeItem(VOLVER_A)
    if (volver && volver.startsWith('/leverage/conectar?')) return volver
  } catch {
    /* sin almacenamiento: va a la pantalla de siempre */
  }
  return porDefecto
}

// Claro / oscuro: sigue a <html data-modo="azul"> (index.html lo aplica antes de pintar).
function useModoOscuro() {
  const [oscuro, setOscuro] = useState(() => document.documentElement.dataset.modo === 'azul')
  useEffect(() => {
    const html = document.documentElement
    const mirar = new MutationObserver(() => setOscuro(html.dataset.modo === 'azul'))
    mirar.observe(html, { attributes: true, attributeFilter: ['data-modo'] })
    return () => mirar.disconnect()
  }, [])
  return oscuro
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isEquipo, login, loginGoogle } = useAuth()
  const [googleClientId, setGoogleClientId] = useState(null)

  const oscuro = useModoOscuro()
  const [angosto] = useState(() => window.matchMedia('(max-width: 720px)').matches)
  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate(destino(isEquipo ? '/mensajes' : '/'), { replace: true })
  }, [isAuthenticated, isEquipo, navigate])

  useEffect(() => {
    let vivo = true
    fetchAuthConfig()
      .then((cfg) => vivo && setGoogleClientId(cfg?.google_client_id || null))
      .catch(() => null)
    return () => {
      vivo = false
    }
  }, [])

  const handleGoogle = useCallback(
    async (credencial) => {
      setError('')
      setCargando(true)
      try {
        await loginGoogle(credencial)
        navigate(destino('/mensajes'), { replace: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No pudimos iniciar tu sesión con Google.')
      } finally {
        setCargando(false)
      }
    },
    [loginGoogle, navigate],
  )

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const errEmail = validarEmail(email)
    setEmailError(errEmail)
    if (errEmail) return
    if (!contrasena) {
      setError('Ingresá tu contraseña.')
      return
    }

    setCargando(true)
    try {
      const user = await login(email.trim(), contrasena.trim())
      navigate(destino(['admin', 'coach'].includes(user.rol) ? '/mensajes' : '/'), { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('El email o la contraseña no coinciden.')
      } else {
        setError(err instanceof Error ? err.message : 'No pudimos iniciar tu sesión. Probá de nuevo.')
      }
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="lg-root">
      {/* La lluvia de luz (Lightfall) cubre todo el login; en celular, a menos resolución para no gastar batería. */}
      <div className="lg-fondo" aria-hidden="true">
        <Lightfall
          key={oscuro ? 'oscuro' : 'claro'}
          colors={oscuro ? ['#ff2518', '#c0392b', '#7a1a0c'] : ['#c0392b', '#571306']}
          backgroundColor={oscuro ? '#c0392b' : '#94a3b8'}
          speed={0.3}
          streakCount={2}
          streakWidth={0.6}
          twinkle={0.5}
          backgroundGlow={oscuro ? 0.06 : 0.1}
          headGlow={0.55}
          bloom={0.3}
          mouseInteraction
          holdToWarp
          intro
          streakLength={1}
          density={0.6}
          glow={1}
          depth={0.5}
          zoom={3}
          mouseStrength={0.4}
          mouseRadius={0.35}
          lens={0.5}
          fade={0}
          lightMode={!oscuro}
          dpr={angosto ? 1 : undefined}
        />
      </div>

      <header className="lg-top">
        <span className="lg-top__marca">
          <Isotipo className="lg-top__iso" />
          <span>ATV Classroom</span>
        </span>
        <span className="lg-top__der">
          <span className="lg-meta">Acceso de socios · {new Date().getFullYear()}</span>
          {/* Claro / oscuro desde el login: queda guardado igual que desde el menú del avatar. */}
          <button
            type="button"
            className="lg-modo"
            onClick={() => elegirModo(oscuro ? 'claro' : 'oscuro')}
            aria-label={oscuro ? 'Pasar a modo claro' : 'Pasar a modo oscuro'}
            title={oscuro ? 'Modo claro' : 'Modo oscuro'}
          >
            {oscuro ? (
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
            )}
          </button>
        </span>
      </header>

      <div className="lg-escena">
        <section className="lg-texto">
          <p className="lg-meta lg-texto__ojo">El Classroom de ATV</p>
          <h1>
            Tu programa,
            <br />
            <em>clase por clase.</em>
          </h1>
          <p className="lg-texto__bajada">Los módulos, las sesiones en vivo y tu equipo en un solo lugar. Entrá y seguí donde lo dejaste.</p>
        </section>

        <main className="lg-ficha">
          <div className="lg-caja">
          <h2>Iniciá sesión</h2>
          <form className="lg-form" onSubmit={handleSubmit} noValidate>
            {error ? (
              <p className="lg-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="lg-campo">
              <input
                id="email"
                className={emailError ? 'is-invalid' : ''}
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                placeholder="Email"
                aria-label="Email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (emailError) setEmailError('')
                  if (error) setError('')
                }}
                onBlur={() => email.trim() && setEmailError(validarEmail(email))}
                disabled={cargando}
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? 'email-error' : undefined}
              />
              {emailError ? (
                <span id="email-error" className="lg-campo__aviso">
                  {emailError}
                </span>
              ) : null}
            </div>
            <div className="lg-campo lg-pass">
              <input
                id="contrasena"
                type={verClave ? 'text' : 'password'}
                name="contrasena"
                autoComplete="current-password"
                placeholder="Contraseña"
                aria-label="Contraseña"
                value={contrasena}
                onChange={(e) => {
                  setContrasena(e.target.value)
                  if (error) setError('')
                }}
                disabled={cargando}
              />
              <button type="button" className="lg-pass__ver" onClick={() => setVerClave((v) => !v)} aria-pressed={verClave}>
                {verClave ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            <button type="submit" className="lg-entrar" disabled={cargando}>
              <span>{cargando ? 'Entrando…' : 'Entrar'}</span>
              {cargando ? (
                <span className="lg-entrar__spin" aria-hidden="true" />
              ) : (
                <svg viewBox="0 0 22 10" aria-hidden="true"><path d="M1 5 H20 M16 1 L20 5 L16 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
            </button>
          </form>
          <div className="lg-pie">
            {googleClientId ? (
              <GoogleButton clientId={googleClientId} onCredential={handleGoogle} variante="texto">
                Equipo de ATV: entrar con Google
              </GoogleButton>
            ) : null}
            <p className="lg-ayuda">¿No te llega la clave? Escribinos por tu canal.</p>
          </div>
        </div>
        </main>
      </div>

      {/* El wordmark del Brand System (la A sin travesaño y la V como ">"), ahora como firma grande al pie. */}
      <footer className="lg-firma" aria-label="Aumenta tu valor">
        <span aria-hidden="true">
          ΛUMENTA<sup>®</sup> TU &gt;ALOR
        </span>
      </footer>
    </div>
  )
}
