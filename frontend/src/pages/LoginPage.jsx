import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import '../styles/login.css'

// Las portadas de los módulos suben en tres columnas detrás del logo.
const COLUMNAS = [
  ['start-here', 'marketing', 'ads', 'systems'],
  ['advantage', 'sales', 'launch', 'case-of-study'],
  ['business-foundations', 'product', 'creator-acquisition', 'live-sessions-mentoria'],
]

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/


function validarEmail(value) {
  const limpio = value.trim()
  if (!limpio) return 'Ingresá tu email.'
  if (!EMAIL_REGEX.test(limpio)) return 'Ese email no parece válido.'
  return ''
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isAdmin, login } = useAuth()

  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate(isAdmin ? '/admin' : '/', { replace: true })
  }, [isAuthenticated, isAdmin, navigate])

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
      navigate(user.rol === 'admin' ? '/admin' : '/', { replace: true })
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
      <section className="lg-brand" aria-label="ATV · Aumenta Tu Valor">
        <div className="lg-mosaic" aria-hidden="true">
          {COLUMNAS.map((col, i) => (
            <div key={i} className="lg-mosaic__col">
              {[...col, ...col].map((slug, j) => (
                <img key={`${slug}-${j}`} src={`/modules/${slug}.png`} alt="" loading={j < col.length ? 'eager' : 'lazy'} />
              ))}
            </div>
          ))}
        </div>
        <div className="lg-brand__glow" aria-hidden="true" />
        <img src="/atv-logo.png" alt="ATV · Aumenta Tu Valor" className="lg-brand__logo" width={180} height={234} />
      </section>

      <main className="lg-panel">
        <form className="lg-form" onSubmit={handleSubmit} noValidate>
          {error ? (
            <p className="lg-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="lg-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className={emailError ? 'is-invalid' : ''}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              placeholder="vos@tuempresa.com"
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
              <span id="email-error" className="lg-field__hint">
                {emailError}
              </span>
            ) : null}
          </div>

          <div className="lg-field">
            <label htmlFor="contrasena">Contraseña</label>
            <div className="lg-pass">
              <input
                id="contrasena"
                type={verClave ? 'text' : 'password'}
                name="contrasena"
                autoComplete="current-password"
                value={contrasena}
                onChange={(e) => {
                  setContrasena(e.target.value)
                  if (error) setError('')
                }}
                disabled={cargando}
              />
              <button type="button" className="lg-pass__toggle" onClick={() => setVerClave((v) => !v)} aria-pressed={verClave}>
                {verClave ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          <button type="submit" className="lg-submit" disabled={cargando}>
            {cargando ? <span className="lg-submit__spin" aria-hidden="true" /> : null}
            {cargando ? 'Entrando…' : 'Entrar'}
          </button>

        </form>
      </main>
    </div>
  )
}
