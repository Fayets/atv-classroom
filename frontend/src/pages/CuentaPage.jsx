import { useEffect, useRef, useState } from 'react'
import { cambiarNombre, fetchCuenta, prepararFoto, quitarFoto, subirFoto } from '../api/cuenta'
import AppHeader from '../components/AppHeader'
import CuposEquipo from '../components/cuenta/CuposEquipo'
import TuEquipo from '../components/cuenta/TuEquipo'
import TusDispositivos from '../components/cuenta/TusDispositivos'
import Tarjeta from '../components/cuenta/Tarjeta'
import VozTab from '../components/cuenta/VozTab'
import Credencial from '../components/cuenta/Credencial'
import { NotificacionesCuenta } from '../components/Notificaciones'
import FathomCuenta from '../components/cuenta/FathomCuenta'
import { useAuth } from '../context/AuthContext'
import '../styles/cuenta.css'
import '../styles/cuenta-rediseno.css'

// Mi cuenta, rediseño 2026-11 (estilos en cuenta-rediseno.css):
//   - A la izquierda, la credencial (components/cuenta/Credencial): un pase de socio holográfico que se
//     inclina con el mouse, con el pase perforado de semanas y las fechas. Al admin le suma Modo Miembro.
//   - A la derecha, las secciones numeradas (components/cuenta/Tarjeta), separadas por una línea fina.
//     Para sumar algo nuevo, se agrega otra <Tarjeta>.

// 120 → "4 meses", 45 → "45 días": en meses cuando cae cerca de un número redondo.
function duracion(dias) {
  const meses = Math.round(dias / 30.4)
  if (meses >= 1 && Math.abs(dias - meses * 30.4) <= 4) return `${meses} ${meses === 1 ? 'mes' : 'meses'}`
  return `${dias} días`
}

const fecha = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')

function textoDias(dias) {
  if (dias == null) return 'Sin fecha de vencimiento'
  if (dias < 0) return `Venció hace ${-dias} ${dias === -1 ? 'día' : 'días'}`
  if (dias === 0) return 'Vence hoy'
  return dias === 1 ? 'Te queda 1 día' : `Te quedan ${dias} días`
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
    setError('')
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
  const esCliente = c?.tipo === 'cliente'
  const esEquipo = c?.tipo === 'equipo'
  const primerNombre = (c?.nombre || '').split(' ')[0]

  return (
    <div className="app-shell cuenta-root">
      <AppHeader />
      <main className="cuenta">
        {error ? <p className="cuenta__error" role="alert">{error}</p> : null}
        {!c && !error ? <p className="cuenta__cargando">Cargando…</p> : null}

        {c ? (
          <div className="cta">
            <aside className="cta-lado" aria-label="Tu credencial">
              <input ref={selector} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange={elegirFoto} />
              <Credencial
                cuenta={c}
                tipo={esCliente ? (c.miembro ? 'Equipo del cliente' : 'Miembro') : c.rol_nombre || 'Equipo'}
                subiendo={subiendo}
                alElegirFoto={() => selector.current?.click()}
                alQuitarFoto={sacarFoto}
                alSalir={logout}
                nombre={
                  esCliente && !c.miembro ? (
                    <NombreTitular
                      cuenta={c}
                      alGuardar={(nombre) => {
                        setCuenta((x) => ({ ...x, nombre }))
                        actualizarUsuario({ nombre })
                      }}
                    />
                  ) : (
                    <p className="cuenta-perfil__nombre">{c.nombre}</p>
                  )
                }
              />
            </aside>

            <div className="cta-cuerpo">
              <header className="cta-cabeza">
                <p className="cta-cabeza__arriba">Mi cuenta</p>
                <h1>{primerNombre ? `${primerNombre}, esto es lo tuyo.` : 'Tu cuenta'}</h1>
                <p>
                  {esCliente
                    ? `Tu plan, cómo te avisamos, dónde tenés la sesión abierta${c.miembro ? '' : ' y quién más entra con vos'}.`
                    : 'Cómo te avisamos, dónde tenés la sesión abierta y tus herramientas.'}
                </p>
              </header>

              <div className="cta-secciones">
                {esCliente ? (
                  <Tarjeta
                    titulo={c.miembro ? `Plan de ${c.miembro.cliente_nombre}` : 'Tu plan'}
                    icono="plan"
                    bajada={c.miembro ? `Sos parte del equipo de ${c.miembro.cliente_nombre}.` : 'Cuánto llevás del programa y cuándo vence.'}
                  >
                    <PlanLinea cuenta={c} />
                  </Tarjeta>
                ) : null}

                <Tarjeta titulo="Notificaciones" icono="notificaciones" bajada="Para enterarte apenas te escriben.">
                  <NotificacionesCuenta />
                </Tarjeta>
                <TusDispositivos />
                {esCliente && !c.miembro ? (
                  <Tarjeta titulo="Tu equipo" icono="equipo" bajada="Socios, setters o closers que entran al chat con ATV.">
                    <TuEquipo />
                  </Tarjeta>
                ) : null}
                {esEquipo ? (
                  <Tarjeta titulo="Voz del Tab" icono="voz" bajada="Con qué voz te sugiere respuestas la IA.">
                    <VozTab />
                  </Tarjeta>
                ) : null}
                {esEquipo ? (
                  <Tarjeta titulo="Fathom" icono="fathom" bajada="Tus llamadas grabadas, conectadas al classroom.">
                    <FathomCuenta />
                  </Tarjeta>
                ) : null}
                {esEquipo && c.rol === 'admin' ? (
                  <Tarjeta titulo="Equipos de clientes" icono="equipo" bajada="Cuántas personas suma cada plan.">
                    <CuposEquipo />
                  </Tarjeta>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}

// El programa de punta a punta: una línea de "Empezaste" a "Vence" con una marca en hoy, y abajo los datos.
function PlanLinea({ cuenta: c }) {
  const total = c.duracion_dias || null
  const usados = total && c.dias_restantes != null ? Math.min(total, Math.max(0, total - c.dias_restantes)) : null
  const vencido = c.dias_restantes != null && c.dias_restantes < 0
  const poco = !vencido && c.dias_restantes != null && c.dias_restantes <= 15
  return (
    <div className="cta-plan">
      <div className="cta-plan__arriba">
        <span className="cta-plan__nombre">{c.plan_nombre || 'Sin plan'}</span>
        <span className={`cta-plan__dias${vencido ? ' is-vencido' : poco ? ' is-poco' : ''}`}>{textoDias(c.dias_restantes)}</span>
      </div>
      {usados != null ? (
        <div className="cta-linea" style={{ '--avance': usados / total }}>
          <div
            className="cta-linea__pista"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={usados}
            aria-label="Días del programa que ya pasaron"
          >
            <i />
            <span className="cta-linea__hoy">
              <b>Hoy</b>
            </span>
          </div>
          <div className="cta-linea__puntas">
            <span>
              <small>Empezaste</small>
              {fecha(c.fecha_inicio)}
            </span>
            <span>
              <small>Vence</small>
              {fecha(c.fecha_vencimiento)}
            </span>
          </div>
        </div>
      ) : null}
      <dl className="cta-plan__datos">
        {c.estado_texto ? (
          <div>
            <dt>Estado</dt>
            <dd>
              <span className={`cuenta-estado is-${c.estado || 'vigente'}`}>{c.estado_texto}</span>
            </dd>
          </div>
        ) : null}
        {c.duracion_dias ? (
          <div>
            <dt>Duración</dt>
            <dd>{duracion(c.duracion_dias)}</dd>
          </div>
        ) : null}
        {c.responsable ? (
          <div>
            <dt>Tu coach</dt>
            <dd>{c.responsable}</dd>
          </div>
        ) : null}
      </dl>
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
