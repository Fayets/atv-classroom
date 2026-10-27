import { useEffect, useRef, useState } from 'react'
import { cambiarNombre, fetchCuenta, prepararFoto, quitarFoto, subirFoto } from '../api/cuenta'
import AppHeader from '../components/AppHeader'
import CuposEquipo from '../components/cuenta/CuposEquipo'
import TuEquipo from '../components/cuenta/TuEquipo'
import TusDispositivos from '../components/cuenta/TusDispositivos'
import VozTab from '../components/cuenta/VozTab'
import { NotificacionesCuenta } from '../components/Notificaciones'
import FathomCuenta from '../components/cuenta/FathomCuenta'
import { useAuth } from '../context/AuthContext'
import '../styles/cuenta.css'
import { getUserInitials } from '../utils/user'

// 120 → "4 meses", 45 → "45 días": en meses cuando cae cerca de un número redondo.
function duracion(dias) {
  const meses = Math.round(dias / 30.4)
  if (meses >= 1 && Math.abs(dias - meses * 30.4) <= 4) return `${meses} ${meses === 1 ? 'mes' : 'meses'}`
  return `${dias} días`
}

const fecha = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')

// Mi cuenta: una tarjeta por sección. Para sumar algo nuevo, se agrega otra <Seccion>.
function Seccion({ titulo, children }) {
  return (
    <section className="cuenta-seccion">
      <h2>{titulo}</h2>
      <div className="cuenta-seccion__cuerpo">{children}</div>
    </section>
  )
}

function Dato({ nombre, children }) {
  return (
    <div className="cuenta-dato">
      <dt>{nombre}</dt>
      <dd>{children ?? '—'}</dd>
    </div>
  )
}

export default function CuentaPage() {
  const { logout, actualizarUsuario } = useAuth()
  const [cuenta, setCuenta] = useState(null)
  const [error, setError] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const selector = useRef(null)

  useEffect(() => {
    fetchCuenta()
      .then((c) => {
        setCuenta(c)
        actualizarUsuario({ foto_url: c.foto_url, ...(c.tipo === 'cliente' ? { dias_restantes: c.dias_restantes } : {}) })
      })
      .catch((e) => setError(e.message || 'No se pudo cargar tu cuenta.'))
  }, [actualizarUsuario])

  async function elegirFoto(e) {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setSubiendo(true)
    setError('')
    try {
      const { foto_url } = await subirFoto(await prepararFoto(archivo))
      setCuenta((c) => ({ ...c, foto_url, foto_propia: true }))
      actualizarUsuario({ foto_url })
    } catch (err) {
      setError(err.message || 'No se pudo subir la foto.')
    } finally {
      setSubiendo(false)
    }
  }

  async function sacarFoto() {
    setSubiendo(true)
    try {
      const { foto_url } = await quitarFoto()
      setCuenta((c) => ({ ...c, foto_url, foto_propia: false }))
      actualizarUsuario({ foto_url })
    } catch (err) {
      setError(err.message || 'No se pudo quitar la foto.')
    } finally {
      setSubiendo(false)
    }
  }

  const c = cuenta
  const total = c?.duracion_dias || null
  const usados = total && c?.dias_restantes != null ? Math.min(total, Math.max(0, total - c.dias_restantes)) : null
  const vencido = c?.dias_restantes != null && c.dias_restantes < 0

  return (
    <div className="app-shell cuenta-root">
      <AppHeader />
      <main className="cuenta">
        <header className="cuenta__cabeza">
          <h1>Mi cuenta</h1>
        </header>
        {error ? <p className="cuenta__error" role="alert">{error}</p> : null}
        {!c && !error ? <p className="cuenta__cargando">Cargando…</p> : null}

        {c ? (
          <>
            <Seccion titulo="Perfil">
              <div className="cuenta-perfil">
                <div className={`cuenta-foto${subiendo ? ' is-subiendo' : ''}`}>
                  {c.foto_url ? <img src={c.foto_url} alt="" referrerPolicy="no-referrer" /> : <span>{getUserInitials(c.nombre)}</span>}
                </div>
                <div className="cuenta-perfil__texto">
                  {c.tipo === 'cliente' && !c.miembro ? (
                    <NombreTitular
                      cuenta={c}
                      alGuardar={(nombre) => {
                        setCuenta((x) => ({ ...x, nombre }))
                        actualizarUsuario({ nombre })
                      }}
                    />
                  ) : (
                    <p className="cuenta-perfil__nombre">{c.nombre}</p>
                  )}
                  <p className="cuenta-perfil__mail">{c.email}</p>
                  <div className="cuenta-perfil__botones">
                    <input ref={selector} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange={elegirFoto} />
                    <button type="button" className="cuenta-boton" onClick={() => selector.current?.click()} disabled={subiendo}>
                      {subiendo ? 'Subiendo…' : c.foto_propia ? 'Cambiar foto' : 'Subir foto'}
                    </button>
                    {c.foto_propia ? (
                      <button type="button" className="cuenta-boton is-suave" onClick={sacarFoto} disabled={subiendo}>
                        Quitar
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </Seccion>

            {c.tipo === 'cliente' ? (
              <Seccion titulo={c.miembro ? `Plan de ${c.miembro.cliente_nombre}` : 'Tu plan'}>
                {c.miembro ? <p className="cuenta-equipo__soy">Sos parte del equipo de {c.miembro.cliente_nombre}.</p> : null}
                <div className="cuenta-plan">
                  <span className="cuenta-plan__nombre">{c.plan_nombre || 'Sin plan'}</span>
                  <span className={`cuenta-plan__dias${vencido ? ' is-vencido' : c.dias_restantes != null && c.dias_restantes <= 15 ? ' is-poco' : ''}`}>
                    {c.dias_restantes == null ? 'Sin fecha de vencimiento' : vencido ? `Venció hace ${-c.dias_restantes} días` : c.dias_restantes === 0 ? 'Vence hoy' : `${c.dias_restantes} ${c.dias_restantes === 1 ? 'día' : 'días'} de acceso`}
                  </span>
                </div>
                {usados != null ? (
                  <div className="cuenta-barra" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={usados} aria-label="Días de acceso usados">
                    <i style={{ width: `${(100 * usados) / total}%` }} />
                  </div>
                ) : null}
                <dl className="cuenta-datos">
                  {c.estado_texto ? <Dato nombre="Estado"><span className={`cuenta-estado is-${c.estado || 'vigente'}`}>{c.estado_texto}</span></Dato> : null}
                  {c.duracion_dias ? <Dato nombre="Duración del programa">{duracion(c.duracion_dias)}</Dato> : null}
                  {c.fecha_inicio ? <Dato nombre="Empezaste">{fecha(c.fecha_inicio)}</Dato> : null}
                  {c.fecha_vencimiento ? <Dato nombre="Vence">{fecha(c.fecha_vencimiento)}</Dato> : null}
                  {c.responsable ? <Dato nombre="Tu coach">{c.responsable}</Dato> : null}
                </dl>
              </Seccion>
            ) : (
              <Seccion titulo="Tu rol">
                <dl className="cuenta-datos">
                  <Dato nombre="Rol">{c.rol_nombre}</Dato>
                  {c.area ? <Dato nombre="Área">{c.area.charAt(0).toUpperCase() + c.area.slice(1)}</Dato> : null}
                </dl>
              </Seccion>
            )}

            <Seccion titulo="Notificaciones">
              <NotificacionesCuenta />
            </Seccion>
            <TusDispositivos />
            {c.tipo === 'cliente' && !c.miembro ? (
              <Seccion titulo="Tu equipo">
                <TuEquipo />
              </Seccion>
            ) : null}
            {c.tipo === 'equipo' ? (
              <Seccion titulo="Voz del Tab">
                <VozTab />
              </Seccion>
            ) : null}
            {c.tipo === 'equipo' ? (
              <Seccion titulo="Fathom">
                <FathomCuenta />
              </Seccion>
            ) : null}
            {c.tipo === 'equipo' && c.rol === 'admin' ? (
              <Seccion titulo="Equipos de clientes">
                <CuposEquipo />
              </Seccion>
            ) : null}

            <Seccion titulo="Sesión">
              <button type="button" className="cuenta-boton is-peligro" onClick={logout}>
                Cerrar sesión
              </button>
            </Seccion>
          </>
        ) : null}
      </main>
    </div>
  )
}

// El titular elige cómo se llama él. La cuenta y el canal mantienen el nombre del onboarding.
function NombreTitular({ cuenta, alGuardar }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(cuenta.nombre)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      const r = await cambiarNombre(valor)
      alGuardar(r.nombre)
      setEditando(false)
    } catch (err) {
      setError(err.message || 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  if (!editando) {
    return (
      <div className="cuenta-nombre">
        <p className="cuenta-perfil__nombre">
          {cuenta.nombre}
          <button type="button" className="cuenta-nombre__editar" onClick={() => { setValor(cuenta.nombre); setEditando(true) }}>
            Editar
          </button>
        </p>
        {cuenta.nombre_cuenta && cuenta.nombre_cuenta !== cuenta.nombre ? <p className="cuenta-nombre__cuenta">Cuenta: {cuenta.nombre_cuenta}</p> : null}
      </div>
    )
  }
  return (
    <form className="cuenta-nombre__form" onSubmit={guardar}>
      <input value={valor} onChange={(e) => setValor(e.target.value)} maxLength={80} autoFocus aria-label="Tu nombre" placeholder={cuenta.nombre_cuenta} />
      <p className="cuenta-nombre__ayuda">Así te ven en el chat. La cuenta se sigue llamando {cuenta.nombre_cuenta}.</p>
      {error ? <p className="cuenta-equipo__error" role="alert">{error}</p> : null}
      <div className="cuenta-nombre__botones">
        <button type="button" className="cuenta-boton is-suave" onClick={() => setEditando(false)} disabled={guardando}>Cancelar</button>
        <button type="submit" className="cuenta-boton" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}
