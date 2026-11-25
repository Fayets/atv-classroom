import { useState } from 'react'
import { useMensajeria } from '../context/MensajeriaContext'
import { activarAvisos, apagarAvisos } from '../utils/push'
import BellToggle from './efectos/BellToggle'
import '../styles/avisos.css'

// La campanita de las notificaciones (BellToggle de React Bits, con los colores de ATV): apagada es un botón
// rojo "Activar notificaciones"; al tocarla pide el permiso, la campana suena y queda "Notificaciones activas".
// Tocarla de nuevo las apaga en este dispositivo. Si te mencionaron y no lo viste, muestra en cuántos chats.
// La usan Mi cuenta y el cartel de arriba de Mensajes (components/Notificaciones.jsx).
// Los colores son variables CSS (styles/avisos.css), así sigue al modo claro u oscuro.
export default function BotonAvisos({ estado, alCambiarEstado, alFallar, tamano = 'md' }) {
  const { menciones } = useMensajeria()
  const [ocupado, setOcupado] = useState(false)
  const prendida = estado === 'activas'
  // Solo se puede tocar si el navegador lo permite (bloqueadas, sin soporte o iPhone sin anclar, no).
  const sePuede = estado === 'apagadas' || estado === 'activas'

  async function cambiar(quiere) {
    setOcupado(true)
    alFallar?.('')
    try {
      const nuevo = await (quiere ? activarAvisos() : apagarAvisos())
      if (typeof nuevo === 'string') alCambiarEstado(nuevo)
      else alCambiarEstado(quiere ? 'activas' : 'apagadas')
    } catch (err) {
      alFallar?.(err.message || (quiere ? 'No se pudieron activar. Probá de nuevo.' : 'No se pudieron desactivar.'))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <BellToggle
      className="avisos-campana"
      size={tamano}
      pressed={prendida}
      onChange={cambiar}
      disabled={!sePuede || ocupado}
      offLabel={ocupado ? 'Activando…' : 'Activar notificaciones'}
      onLabel={ocupado ? 'Desactivando…' : 'Notificaciones activas'}
      label={prendida ? 'Desactivar notificaciones' : 'Activar notificaciones'}
      color="var(--ac-tinta)"
      background="var(--ac-fondo)"
      onColor="var(--ac-tinta-on)"
      onBackground="var(--ac-fondo-on)"
      badgeColor="var(--ac-globo)"
      radius={999}
      count={menciones}
      badge
      waves
      ringAmplitude={17}
      ringPasses={5}
      ringDuration={820}
    />
  )
}
