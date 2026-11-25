// Las notificaciones de la app (todo menos los chats: eso queda en Mensajes) para la campanita de Mensajes.
// Cada fuente publica su lista por separado (el cierre de mes desde CierreMes.jsx, el roadmap, el acceso y las
// notificaciones del celular desde components/AlertasSync.jsx) y la campanita las muestra juntas, la más nueva
// arriba. Tocar una lleva a su pantalla (`ruta`) o dispara un evento (`evento`, p. ej. abrir el formulario del
// cierre). "Vistas" se guarda en este dispositivo: el punto rojo marca lo nuevo y se apaga al abrir el panel;
// las `persistente` (algo que falta hacer) lo mantienen prendido hasta que se resuelven.
import { useSyncExternalStore } from 'react'

const CAMBIO = 'atv:alertas-app'
const VISTAS = 'atv_alertas_vistas'
export const ABRIR_CIERRE = 'atv:abrir-cierre'

const porFuente = {}
let todas = []
let vistas = new Set()
try {
  vistas = new Set(JSON.parse(localStorage.getItem(VISTAS) || '[]'))
} catch {
  /* sin almacenamiento: todo cuenta como nuevo */
}
let estado = { alertas: todas, nuevas: 0 }

function recalcular() {
  todas = Object.values(porFuente)
    .flat()
    .sort((a, b) => Number(Boolean(b.persistente)) - Number(Boolean(a.persistente)) || String(b.fecha || '').localeCompare(String(a.fecha || '')))
  const nuevas = todas.filter((a) => a.persistente || !vistas.has(a.id)).length
  estado = { alertas: todas, nuevas }
  window.dispatchEvent(new Event(CAMBIO))
}

/** Reemplaza las alertas de una fuente: [{ id, tipo, titulo, texto, fecha, urgente, persistente, accion, ruta | evento }]. */
export function publicarAlertas(fuente, lista) {
  porFuente[fuente] = lista
  recalcular()
}

/** Al abrir el panel: lo que hay ya no es nuevo. */
export function marcarVistas() {
  todas.forEach((a) => vistas.add(a.id))
  try {
    localStorage.setItem(VISTAS, JSON.stringify([...vistas].slice(-200)))
  } catch {
    /* nada */
  }
  recalcular()
}

function suscribir(avisar) {
  window.addEventListener(CAMBIO, avisar)
  return () => window.removeEventListener(CAMBIO, avisar)
}

/** { alertas, nuevas }: la lista ordenada y cuántas tienen el punto de "nuevo". */
export function useAlertasApp() {
  return useSyncExternalStore(suscribir, () => estado)
}

export const esNueva = (alerta) => alerta.persistente || !vistas.has(alerta.id)

export function dispararAlerta(alerta) {
  if (alerta.evento) window.dispatchEvent(new Event(alerta.evento))
}
