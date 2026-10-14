import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { anularAlta, buscarFicha, crearAlta, enviarOnboarding, fetchAltas } from '../../api/altas'

const PLANES = ['Entry Level', 'Mid Level', 'High Level', 'Boost', 'Mentoría']
// Va al contrato de ZapSign. High Level y Boost firman el contrato de High Level: siempre pago único.
const PAGOS = ['Pago único', 'Dos cuotas', 'Tres cuotas']
const PAGO_UNICO = ['High Level', 'Boost']
const usd = (n) => `USD ${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
const corta = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR') : '')
const cuando = (iso) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function Copiable({ valor }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      type="button"
      className="alta-copiar"
      onClick={() => {
        navigator.clipboard?.writeText(valor).then(() => {
          setOk(true)
          setTimeout(() => setOk(false), 1500)
        })
      }}
    >
      <code>{valor}</code>
      <span>{ok ? 'Copiado' : 'Copiar'}</span>
    </button>
  )
}

// Nuevo onboarding: lo que hacía /add-client en Discord, desde el escritorio del classroom.
// Si hubo una seña, la ficha ya existe en atv-clients: mientras se escribe el nombre se busca sola y,
// si quien hace el onboarding confirma que es ese cliente, se completa esa ficha en vez de crear otra.
// Se muestra cuánto dejó de seña: Nick sabe el monto que mandó a la caja y así la reconoce.
// El mail de onboarding no sale solo: se manda una vez con el botón.
// sena: si se abre desde el grupo "Señas" de Mensajes, ya viene elegida (Nick completa mail y pago).
export default function NuevoCliente({ onCerrar, onAbrirChat, sena = null }) {
  const [form, setForm] = useState({
    nombre: sena?.nombre || '',
    email: '',
    plan: sena?.plan && PLANES.includes(sena.plan) ? sena.plan : 'Entry Level',
    pago: '',
    ficha_id: sena?.id ?? null,
    sin_ficha: false,
  })
  const [candidatas, setCandidatas] = useState([])
  const [elegida, setElegida] = useState(sena)
  const [todas, setTodas] = useState(false)
  const [hecha, setHecha] = useState(null)
  const [recientes, setRecientes] = useState([])
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [anulando, setAnulando] = useState(false)
  const campo = useRef(null)

  useEffect(() => {
    if (sena) document.querySelector('.msj-modal.alta input[inputmode=email]')?.focus()
    else campo.current?.focus()
    fetchAltas().then(setRecientes).catch(() => null)
    const esc = (e) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onCerrar, sena])

  // Señas abiertas (fichas que Franco crea en atv-clients al cobrar la seña). Se muestran todas, con las
  // que se parecen al nombre o al mail arriba: Franco y Nick no siempre las nombran igual.
  useEffect(() => {
    if (hecha) return undefined
    const t = setTimeout(() => {
      buscarFicha(form.nombre.trim(), form.email.trim()).then(setCandidatas).catch(() => setCandidatas([]))
    }, 350)
    return () => clearTimeout(t)
  }, [form.nombre, form.email, hecha])
  const ficha = elegida && elegida.id === form.ficha_id ? elegida : null
  const preguntar = candidatas.length && !form.ficha_id && !form.sin_ficha
  const COINCIDE = { mail: 'Mismo mail', nombre: 'Mismo nombre', parecido: 'Nombre parecido' }
  const pagoUnico = PAGO_UNICO.includes(form.plan)
  const faltaPago = !pagoUnico && !form.pago

  async function crear(e) {
    e.preventDefault()
    setOcupado('crear')
    setError('')
    try {
      const a = await crearAlta(form)
      setHecha(a)
      setRecientes((r) => [a, ...r])
    } catch (err) {
      setError(err.message || 'No se pudo dar de alta.')
    } finally {
      setOcupado('')
    }
  }

  async function enviar(alta) {
    setOcupado(`mail-${alta.id}`)
    setError('')
    try {
      const a = await enviarOnboarding(alta.id)
      setRecientes((r) => r.map((x) => (x.id === a.id ? a : x)))
      if (hecha?.id === a.id) setHecha(a)
    } catch (err) {
      setError(err.message || 'No se pudo mandar el mail.')
    } finally {
      setOcupado('')
    }
  }

  async function anular() {
    setOcupado('anular')
    setError('')
    try {
      await anularAlta(hecha.id)
      setRecientes((r) => r.filter((x) => x.id !== hecha.id))
      setHecha(null)
      setAnulando(false)
      setForm({ nombre: '', email: '', plan: 'Entry Level', pago: '', ficha_id: null, sin_ficha: false })
      setElegida(null)
    } catch (err) {
      setError(err.message || 'No se pudo anular.')
    } finally {
      setOcupado('')
    }
  }

  const pendientes = recientes.filter((a) => !a.mail_enviado_en && a.id !== hecha?.id)

  return createPortal(
    <div className="msj-modal__fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="msj-modal alta" role="dialog" aria-modal="true" aria-labelledby="alta-titulo">
        {!hecha ? (
          <form onSubmit={crear}>
            <h2 id="alta-titulo">Nuevo onboarding</h2>
            <p className="msj-modal__ayuda">Crea el onboarding con su contrato, el canal de Discord, su chat en el classroom y su ficha. El mail de onboarding lo mandás después con un botón.</p>

            <label className="msj-modal__campo">
              <span>Nombre y apellido</span>
              <input ref={campo} type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Juan Pérez" maxLength={80} />
            </label>
            <label className="msj-modal__campo">
              <span>Mail</span>
              <input type="text" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="juan@gmail.com" autoComplete="off" />
            </label>
            {preguntar ? (
              <div className="alta-sena" role="group" aria-label="¿Dejó seña?">
                <b>¿Dejó seña?</b>
                <small>Señas cobradas que todavía no tienen onboarding. Elegí la de este cliente aunque el nombre no sea igual.</small>
                <div className="alta-sena__lista">
                  {(todas ? candidatas : candidatas.slice(0, 4)).map((c) => (
                    <div key={c.id} className={`alta-sena__fila${c.coincide ? ' is-sugerida' : ''}`}>
                      <span>
                        {c.nombre} · {c.plan}{c.monto ? ` · ${usd(c.monto)}` : ''}{c.fecha ? ` · ${corta(c.fecha)}` : ''}
                        {c.coincide ? <em>{COINCIDE[c.coincide]}</em> : null}
                      </span>
                      <button type="button" className="is-si" onClick={() => { setElegida(c); setForm((f) => ({ ...f, ficha_id: c.id, sin_ficha: false, plan: c.plan && PLANES.includes(c.plan) ? c.plan : f.plan })) }}>Es esta</button>
                    </div>
                  ))}
                </div>
                <div className="alta-sena__pie">
                  {candidatas.length > 4 ? (
                    <button type="button" className="alta-sena__mas" onClick={() => setTodas((t) => !t)}>{todas ? 'Ver menos' : `Ver todas las señas (${candidatas.length})`}</button>
                  ) : <span />}
                  <button type="button" className="alta-sena__no" onClick={() => setForm((f) => ({ ...f, ficha_id: null, sin_ficha: true }))}>No dejó seña</button>
                </div>
              </div>
            ) : ficha ? (
              <p className="alta-sena__ok">
                Se completa la ficha de la seña de {ficha.nombre}: conserva lo pagado y el acceso corre desde hoy.{' '}
                <button type="button" onClick={() => setForm((f) => ({ ...f, ficha_id: null, sin_ficha: false }))}>Cambiar</button>
              </p>
            ) : form.sin_ficha && candidatas.length ? (
              <p className="alta-sena__ok is-gris">
                No dejó seña: se crea una ficha nueva.{' '}
                <button type="button" onClick={() => setForm((f) => ({ ...f, sin_ficha: false }))}>Cambiar</button>
              </p>
            ) : null}
            <fieldset className="msj-modal__campo">
              <legend>Plan</legend>
              <div className="msj-roles">
                {PLANES.map((p) => (
                  <label key={p} className={`msj-rol${form.plan === p ? ' is-on' : ''}`}>
                    <input type="radio" name="plan" checked={form.plan === p} onChange={() => setForm({ ...form, plan: p })} />
                    {p}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="msj-modal__campo">
              <legend>Modalidad de pago</legend>
              {pagoUnico ? (
                <p className="alta-pago-fijo">Pago único: el contrato de {form.plan} es siempre de un pago.</p>
              ) : (
                <div className="msj-roles">
                  {PAGOS.map((p) => (
                    <label key={p} className={`msj-rol${form.pago === p ? ' is-on' : ''}`}>
                      <input type="radio" name="pago" checked={form.pago === p} onChange={() => setForm({ ...form, pago: p })} />
                      {p}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            {error ? <p className="msj-modal__error" role="alert">{error}</p> : null}
            <div className="msj-modal__botones">
              <button type="button" onClick={onCerrar}>Cancelar</button>
              <button type="submit" className="is-primario" disabled={ocupado === 'crear' || Boolean(preguntar) || faltaPago}>{ocupado === 'crear' ? 'Creando…' : 'Crear onboarding'}</button>
            </div>
          </form>
        ) : (
          <div>
            <h2 id="alta-titulo">Onboarding de {hecha.nombre} creado</h2>
            <ul className="alta-hecho">
              <li className="is-ok">Ficha lista · plan {hecha.plan}</li>
              <li className="is-ok">Su chat en el classroom</li>
              {hecha.discord_invite_url ? (
                <li className="is-ok">Canal de Discord #{hecha.canal}</li>
              ) : (
                <li className="is-aviso">El canal de Discord no se pudo crear: {String(hecha.discord_error || '').replace(/\.+$/, '')}. Crealo a mano en Discord si hace falta.</li>
              )}
              <li className={hecha.mail_enviado_en ? 'is-ok' : 'is-pendiente'}>
                {hecha.mail_enviado_en ? `Link de onboarding enviado a ${hecha.email}` : 'Falta mandarle el link de onboarding'}
              </li>
            </ul>
            <div className="alta-datos">
              <span>Entra al classroom con</span>
              <Copiable valor={hecha.email} />
              <Copiable valor={hecha.clave_classroom} />
              {hecha.discord_invite_url ? (
                <>
                  <span>Invitación a Discord</span>
                  <Copiable valor={hecha.discord_invite_url} />
                </>
              ) : null}
            </div>
            {error ? <p className="msj-modal__error" role="alert">{error}</p> : null}
            <div className="msj-modal__botones">
              {!hecha.mail_enviado_en ? (
                anulando ? (
                  <button type="button" className="is-peligro" onClick={anular} disabled={ocupado === 'anular'}>{ocupado === 'anular' ? 'Anulando…' : 'Sí, anular todo'}</button>
                ) : (
                  <button type="button" className="is-peligro" onClick={() => setAnulando(true)}>Anular alta</button>
                )
              ) : null}
              <button type="button" onClick={() => onAbrirChat(hecha.canal_id)}>Abrir su chat</button>
              {!hecha.mail_enviado_en ? (
                <button type="button" className="is-primario" onClick={() => enviar(hecha)} disabled={ocupado === `mail-${hecha.id}`}>
                  {ocupado === `mail-${hecha.id}` ? 'Enviando…' : 'Enviar link de onboarding'}
                </button>
              ) : (
                <button type="button" className="is-primario" onClick={onCerrar}>Listo</button>
              )}
            </div>
          </div>
        )}

        {pendientes.length ? (
          <div className="alta-pendientes">
            <p>Altas sin el link de onboarding</p>
            <ul>
              {pendientes.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <span>
                    <b>{a.nombre}</b>
                    <small>{a.plan} · {cuando(a.creado_en)}{a.creado_por ? ` · ${a.creado_por.split(' ')[0]}` : ''}</small>
                  </span>
                  <button type="button" onClick={() => enviar(a)} disabled={ocupado === `mail-${a.id}`}>{ocupado === `mail-${a.id}` ? 'Enviando…' : 'Enviar link'}</button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
