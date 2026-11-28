// Unread counter for Messages (sidebar, top menu and mobile header). The value comes from
// valorContador (utils/contador.js).
export default function Contador({ valor, className }) {
  if (!valor) return null
  return (
    <span className={`${className} num`} aria-label={`${valor} ${valor === 1 ? 'mensaje sin leer' : 'mensajes sin leer'}`}>
      {valor > 99 ? '99+' : valor}
    </span>
  )
}
