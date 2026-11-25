// Modo Miembro: un admin ve la app como la ve un miembro (barra, rutas y pantallas de cliente) sin cambiar
// de cuenta. Es solo del frontend: el backend sigue viendo al admin (no hay forma de "entrar como" otro
// usuario), así que los datos que llegan son los de su cuenta.
//
// Para que nadie mande algo real "probando", mientras está prendido no sale nada que escriba: request()
// corta todo lo que no sea una lectura (ver api/client.js) y el chat no avisa "escribiendo".
//
// Vive en sessionStorage: sobrevive a recargar, pero una pestaña nueva arranca normal.

const CLAVE = 'atv_modo_miembro'
export const EVENTO_CAMBIO = 'atv:modo-miembro'
export const EVENTO_BLOQUEO = 'atv:modo-miembro-bloqueo'

// Lo único que sí puede salir: cerrar la sesión.
const PERMITIDAS = ['/api/auth/logout']
// Pedidos que la app hace sola (no la persona): se cortan igual, pero sin el aviso de "No se guardó".
const DE_FONDO = ['/leido', '/push/']

export function modoMiembroActivo() {
  try {
    return sessionStorage.getItem(CLAVE) === '1'
  } catch {
    return false
  }
}

export function cambiarModoMiembro(activo) {
  try {
    if (activo) sessionStorage.setItem(CLAVE, '1')
    else sessionStorage.removeItem(CLAVE)
  } catch {
    // sin sessionStorage (modo privado viejo): el modo no se guarda
  }
  window.dispatchEvent(new Event(EVENTO_CAMBIO))
}

/** true si este pedido no puede salir porque el Modo Miembro está prendido. */
export function bloqueadoPorModoMiembro(url, metodo) {
  if (!modoMiembroActivo()) return false
  if (!metodo || metodo.toUpperCase() === 'GET') return false
  if (PERMITIDAS.some((ruta) => url.includes(ruta))) return false
  if (!DE_FONDO.some((ruta) => url.includes(ruta))) window.dispatchEvent(new Event(EVENTO_BLOQUEO))
  return true
}

export const MENSAJE_BLOQUEO = 'En Modo Miembro no se guarda nada (volvé a admin para hacer cambios)'
