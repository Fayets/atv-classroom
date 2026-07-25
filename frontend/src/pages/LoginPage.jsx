import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function IconArrow() {
  return (
    <svg
      className="login-submit__icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function isValidEmail(value) {
  return EMAIL_REGEX.test(value.trim())
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isAdmin, login } = useAuth()

  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      navigate(isAdmin ? '/admin' : '/', { replace: true })
    }
  }, [isAuthenticated, isAdmin, navigate])

  function validateEmailField(value) {
    const trimmed = value.trim()
    if (!trimmed) {
      return 'Ingresá tu email.'
    }
    if (!isValidEmail(trimmed)) {
      return 'Ingresá un email válido.'
    }
    return ''
  }

  function handleEmailBlur() {
    if (email.trim()) {
      setEmailError(validateEmailField(email))
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    const emailValidation = validateEmailField(email)
    setEmailError(emailValidation)
    if (emailValidation) {
      return
    }

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
        setError(err.message || 'Email o contrasena incorrectos.')
      } else {
        setError(
          err instanceof Error ? err.message : 'No se pudo iniciar sesión.',
        )
      }
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="login-page">
      <main className="login-main">
        <div className="login-card">
          <div className="login-card__logo-wrap">
            <img
              src="/atv-logo.png"
              alt="ATV — Aumenta Tu Valor"
              className="login-card__logo"
              width={72}
              height={72}
            />
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {error ? (
              <p className="login-error" role="alert">
                {error}
              </p>
            ) : null}

            <label className="login-field">
              <span className="visually-hidden">Email</span>
              <input
                id="email"
                className={`login-input${emailError ? ' login-input--invalid' : ''}`}
                type="email"
                name="email"
                autoComplete="email"
                placeholder="Email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  if (emailError) setEmailError('')
                  if (error) setError('')
                }}
                onBlur={handleEmailBlur}
                disabled={cargando}
                aria-invalid={Boolean(emailError)}
              />
              {emailError ? (
                <span className="login-field__hint" role="alert">
                  {emailError}
                </span>
              ) : null}
            </label>

            <label className="login-field">
              <span className="visually-hidden">Contraseña</span>
              <input
                id="contrasena"
                className="login-input"
                type="password"
                name="contrasena"
                autoComplete="current-password"
                placeholder="Contraseña"
                value={contrasena}
                onChange={(event) => {
                  setContrasena(event.target.value)
                  if (error) setError('')
                }}
                disabled={cargando}
              />
            </label>

            <button
              type="submit"
              className="login-submit"
              disabled={cargando}
              aria-label={cargando ? 'Ingresando' : 'Ingresar'}
            >
              {cargando ? (
                <span className="login-submit__loading" aria-hidden="true" />
              ) : (
                <IconArrow />
              )}
            </button>
          </form>

          <p className="login-footer">Solo miembros autorizados</p>
        </div>
      </main>
    </div>
  )
}
