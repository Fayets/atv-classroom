import { PUNTO } from '../utils/contador'

// El contador de Mensajes (barra lateral, menú de arriba y barra de abajo del celular).
// Lleva número cuando te mencionaron (@nombre o @everyone) y todavía no lo viste: en cuántos chats. Si
// solo hay mensajes sin leer, sin ninguna mención, es un punto. El valor sale de valorContador (utils/contador.js).

export default function Contador({ valor, className }) {
  if (!valor) return null
  if (valor === PUNTO) return <i className={`${className} is-punto`} role="img" aria-label="Mensajes sin leer" />
  return (
    <span className={`${className} num`} aria-label={`Te mencionaron en ${valor} ${valor === 1 ? 'chat' : 'chats'}`}>
      {valor > 99 ? '99+' : valor}
    </span>
  )
}
