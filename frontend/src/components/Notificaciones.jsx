import { useEffect, useState } from 'react'
import { estadoAvisos, probarAvisos } from '../utils/push'
import BotonAvisos from './BotonAvisos'

const TEXTO = {
  apagadas: 'Activalas para enterarte apenas te escriben, aunque tengas la app cerrada.',
  'ios-sin-anclar': 'En el iPhone primero anclá la app al inicio: en Safari tocá Compartir → “Agregar a pantalla de inicio” y abrila desde ese ícono.',
  bloqueadas: 'Están bloqueadas en este dispositivo. Activalas desde los ajustes del navegador (o del celular) para classroom.atvos.io.',
  'no-soporta': 'Este navegador no permite notificaciones. Probá con Chrome, o en el iPhone con la app anclada al inicio.',
  activas: 'Te llegan a este dispositivo.',
}
const CERRADO = 'atv-avisos-cartel-cerrado'

function useEstado() {
  const [estado, setEstado] = useState(null)
  useEffect(() => {
    let vivo = true
    estadoAvisos().then((e) => vivo && setEstado(e))
    return () => {
      vivo = false
    }
  }, [])
  return [estado, setEstado]
}

// En Mi cuenta: la campanita (BotonAvisos) prende y apaga las notificaciones de este dispositivo; abajo, el
// estado en una línea y, si están activas, "Mandarme una de prueba".
export function NotificacionesCuenta() {
  const [estado, setEstado] = useEstado()
  const [ocupado, setOcupado] = useState(false)
  const [nota, setNota] = useState('')

  async function probar() {
    setOcupado(true)
    setNota('')
    try {
      const r = await probarAvisos()
      setNota(r?.enviados ? 'Listo: en unos segundos te llega una de prueba.' : 'No se pudo mandar. Desactivalas y volvé a activarlas.')
    } catch (err) {
      setNota(err.message || 'No se pudo. Probá de nuevo.')
    } finally {
      setOcupado(false)
    }
  }

  if (!estado) return <p className="cuenta__cargando">Cargando…</p>
  return (
    <div className="cuenta-avisos">
      <div className="cuenta-avisos__botones">
        <BotonAvisos estado={estado} alCambiarEstado={setEstado} alFallar={setNota} />
        {estado === 'activas' ? (
          <button type="button" className="cuenta-boton is-suave" disabled={ocupado} onClick={probar}>
            Mandarme una de prueba
          </button>
        ) : null}
      </div>
      <p className={`cuenta-avisos__estado is-${estado}`}>
        <span aria-hidden="true" />
        {TEXTO[estado]}
      </p>
      {nota ? <p className="cuenta-avisos__nota">{nota}</p> : null}
    </div>
  )
}

// Arriba de Mensajes: un cartel corto con la campanita, hasta que las activa o lo cierra. Al activarlas, la
// campana suena, el cartel dice "Listo" un momento y se va solo.
export function NotificacionesCartel() {
  const [estado, setEstado] = useEstado()
  const [cerrado, setCerrado] = useState(() => {
    try {
      return localStorage.getItem(CERRADO) === '1'
    } catch {
      return false
    }
  })
  const [fallo, setFallo] = useState('')
  const [recien, setRecien] = useState(false) // las acaba de activar: el cartel se queda un momento
  const [saliendo, setSaliendo] = useState(false)

  useEffect(() => {
    if (!recien) return undefined
    const irse = setTimeout(() => setSaliendo(true), 2200)
    const fin = setTimeout(() => {
      setRecien(false)
      setSaliendo(false)
    }, 2600)
    return () => {
      clearTimeout(irse)
      clearTimeout(fin)
    }
  }, [recien])

  if (cerrado) return null
  if (!recien && !['apagadas', 'ios-sin-anclar'].includes(estado)) return null

  function cerrar() {
    setCerrado(true)
    try {
      localStorage.setItem(CERRADO, '1')
    } catch {
      /* sin almacenamiento: vuelve a aparecer la próxima vez */
    }
  }

  const texto = fallo
    ? fallo
    : estado === 'activas'
      ? <><b>Listo.</b> <span>Te avisamos apenas te escriban, aunque tengas la app cerrada.</span></>
      : estado === 'apagadas'
        ? <><b>Enterate apenas te escriben.</b> <span>Activá las notificaciones, aunque tengas la app cerrada.</span></>
        : TEXTO[estado] || TEXTO['ios-sin-anclar']

  return (
    <div className={`avisos-cartel${fallo ? ' is-error' : ''}${saliendo ? ' is-saliendo' : ''}`} role="region" aria-label="Notificaciones">
      <p>{texto}</p>
      {estado === 'apagadas' || estado === 'activas' ? (
        <BotonAvisos
          tamano="sm"
          estado={estado}
          alFallar={setFallo}
          alCambiarEstado={(nuevo) => {
            setEstado(nuevo)
            if (nuevo === 'activas') setRecien(true)
          }}
        />
      ) : null}
      <button type="button" className="avisos-cartel__x" onClick={cerrar} aria-label="Cerrar">×</button>
    </div>
  )
}
