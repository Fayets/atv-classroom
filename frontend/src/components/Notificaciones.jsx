import { useEffect, useState } from 'react'
import { activarAvisos, apagarAvisos, estadoAvisos, probarAvisos } from '../utils/push'

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

// En Mi cuenta: el estado de este dispositivo, con activar, probar y apagar.
export function NotificacionesCuenta() {
  const [estado, setEstado] = useEstado()
  const [ocupado, setOcupado] = useState(false)
  const [nota, setNota] = useState('')

  async function hacer(fn, despues) {
    setOcupado(true)
    setNota('')
    try {
      const r = await fn()
      if (typeof r === 'string') setEstado(r)
      if (despues) setNota(despues(r))
    } catch (err) {
      setNota(err.message || 'No se pudo. Probá de nuevo.')
    } finally {
      setOcupado(false)
    }
  }

  if (!estado) return <p className="cuenta__cargando">Cargando…</p>
  return (
    <div className="cuenta-avisos">
      <p className={`cuenta-avisos__estado is-${estado}`}>
        <span aria-hidden="true" />
        {TEXTO[estado]}
      </p>
      <div className="cuenta-avisos__botones">
        {estado === 'apagadas' ? (
          <button type="button" className="cuenta-boton" disabled={ocupado} onClick={() => hacer(activarAvisos)}>
            {ocupado ? 'Activando…' : 'Activar notificaciones'}
          </button>
        ) : null}
        {estado === 'activas' ? (
          <>
            <button type="button" className="cuenta-boton is-suave" disabled={ocupado}
              onClick={() => hacer(probarAvisos, (r) => (r?.enviados ? 'Listo: en unos segundos te llega una de prueba.' : 'No se pudo mandar. Desactivalas y volvé a activarlas.'))}>
              Mandarme una de prueba
            </button>
            <button type="button" className="cuenta-boton is-suave" disabled={ocupado} onClick={() => hacer(apagarAvisos)}>
              Desactivar
            </button>
          </>
        ) : null}
      </div>
      {nota ? <p className="cuenta-avisos__nota">{nota}</p> : null}
    </div>
  )
}

// Arriba de Mensajes: un cartel corto para activarlas, hasta que las activa o lo cierra.
export function NotificacionesCartel() {
  const [estado, setEstado] = useEstado()
  const [cerrado, setCerrado] = useState(() => {
    try {
      return localStorage.getItem(CERRADO) === '1'
    } catch {
      return false
    }
  })
  const [ocupado, setOcupado] = useState(false)
  if (cerrado || !['apagadas', 'ios-sin-anclar'].includes(estado)) return null

  function cerrar() {
    setCerrado(true)
    try {
      localStorage.setItem(CERRADO, '1')
    } catch {
      /* sin almacenamiento: vuelve a aparecer la próxima vez */
    }
  }

  return (
    <div className="msj-avisos" role="region" aria-label="Notificaciones">
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 2.5a5 5 0 0 0-5 5v3.2L3.5 13.5h13L15 10.7V7.5a5 5 0 0 0-5-5zM8 15.5a2 2 0 0 0 4 0" />
      </svg>
      <p>{estado === 'apagadas' ? 'Activá las notificaciones para enterarte apenas te escriben.' : TEXTO['ios-sin-anclar']}</p>
      {estado === 'apagadas' ? (
        <button type="button" disabled={ocupado} onClick={async () => {
          setOcupado(true)
          try {
            setEstado(await activarAvisos())
          } finally {
            setOcupado(false)
          }
        }}>
          {ocupado ? 'Activando…' : 'Activar'}
        </button>
      ) : null}
      <button type="button" className="msj-avisos__x" onClick={cerrar} aria-label="Cerrar">×</button>
    </div>
  )
}
