import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import '../styles/login.css'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const METODO = [
  { n: '1', t: 'Resolver', d: 'el problema que hoy frena tu negocio' },
  { n: '2', t: 'Documentar', d: 'cómo se hace, en tu propio SOP' },
  { n: '3', t: 'Automatizar', d: 'para que funcione sin depender de vos' },
]

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
      <section className="lg-brand" aria-label="ATV">
        <div className="lg-brand__glow" aria-hidden="true" />
        <img src="/atv-logo.png" alt="ATV · Aumenta Tu Valor" className="lg-brand__logo" width={56} height={72} />
        <div className="lg-brand__copy">
          <h1>
            Tu negocio,
            <br />
            en implementación.
          </h1>
          <p>El programa de ATV para dueños de negocio que quieren sistemas, no más información.</p>
        </div>
        <ol className="lg-metodo">
          {METODO.map((m) => (
            <li key={m.n}>
              <span className="lg-metodo__n">{m.n}</span>
              <span>
                <b>{m.t}</b> {m.d}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <main className="lg-panel">
        <form className="lg-form" onSubmit={handleSubmit} noValidate>
          <header>
            <h2>Entrá a tu programa</h2>
            <p>Acceso exclusivo para clientes de ATV.</p>
          </header>

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

          <p className="lg-help">¿No podés entrar? Escribile a tu coach por tu canal de Discord.</p>
        </form>
      </main>
    </div>
  )
}
