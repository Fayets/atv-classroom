import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, fetchAuthConfig } from '../api/client'
import GoogleButton from '../components/GoogleButton'
import { useAuth } from '../context/AuthContext'
import '../styles/login.css'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/


function validarEmail(value) {
  const limpio = value.trim()
  if (!limpio) return 'Ingresá tu email.'
  if (!EMAIL_REGEX.test(limpio)) return 'Ese email no parece válido.'
  return ''
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isEquipo, login, loginGoogle } = useAuth()
  const [googleClientId, setGoogleClientId] = useState(null)

  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate(isEquipo ? '/mensajes' : '/', { replace: true })
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
        navigate('/mensajes', { replace: true })
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
      navigate(['admin', 'coach'].includes(user.rol) ? '/mensajes' : '/', { replace: true })
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
      <section className="lg-portada" aria-label="ATV · Aumenta Tu Valor">
        <div className="lg-portada__arriba">
          <span className="lg-meta">ATV — Aumenta tu valor</span>
          <span className="lg-meta">{new Date().getFullYear()}</span>
        </div>
        <h1 className="lg-titulo">Ingresá a tu espacio</h1>
        <div className="lg-portada__centro">
          <img src="/atv-logo-negro.png" alt="ATV" className="lg-marca" width={373} height={488} />
          <p className="lg-meta lg-lema">SOP + Implementación + 1 a 1</p>
        </div>
      </section>

      <main className="lg-lado">
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
  )
}
