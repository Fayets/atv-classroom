// El valor del contador de Mensajes: en cuántos chats te mencionaron (@nombre o @everyone) sin que lo hayas
// visto o, si solo hay mensajes sin leer, PUNTO. Lo dibuja components/Contador.jsx.
export const PUNTO = 'punto'

export function valorContador(menciones, noLeidos) {
  if (menciones > 0) return menciones
  return noLeidos > 0 ? PUNTO : 0
}
