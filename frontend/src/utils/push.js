import { request } from '../api/client'

// Notificaciones (Web Push). En el iPhone solo andan con la app anclada al inicio (iOS 16.4+);
// en Android y en la compu, desde el navegador.

export const esIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const anclada = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
const soporta = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch(() => null)
  // Al tocar un aviso con la app abierta, el service worker pide ir al chat.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.tipo === 'ir' && e.data.url) window.location.assign(e.data.url)
  })
}

async function suscripcionActual() {
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

// 'no-soporta' | 'ios-sin-anclar' | 'bloqueadas' | 'activas' | 'apagadas'
export async function estadoAvisos() {
  if (esIOS && !anclada()) return 'ios-sin-anclar'
  if (!soporta()) return 'no-soporta'
  if (Notification.permission === 'denied') return 'bloqueadas'
  if (Notification.permission === 'granted' && (await suscripcionActual())) return 'activas'
  return 'apagadas'
}

function aBytes(base64) {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4)
  const crudo = atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(crudo, (c) => c.charCodeAt(0))
}

function dispositivo() {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  return 'Navegador'
}

async function guardar(sub) {
  const datos = sub.toJSON()
  await request('/api/push/suscripcion', { method: 'POST', body: JSON.stringify({ endpoint: datos.endpoint, keys: datos.keys, dispositivo: dispositivo() }) })
}

// Hay que llamarla directo desde el toque del botón: el iPhone solo pide permiso así.
export async function activarAvisos() {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return estadoAvisos()
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const { clave } = await request('/api/push/clave')
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(clave) })
  await guardar(sub)
  return 'activas'
}

export async function apagarAvisos() {
  const sub = await suscripcionActual()
  if (sub) {
    await request('/api/push/baja', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => null)
    await sub.unsubscribe().catch(() => null)
  }
  return estadoAvisos()
}

export const probarAvisos = () => request('/api/push/prueba', { method: 'POST' })

// Al entrar: si este dispositivo ya tenía avisos, se vuelve a asociar a quien entró (cambio de cuenta).
export async function resincronizarAvisos() {
  if (!soporta() || Notification.permission !== 'granted') return
  const sub = await suscripcionActual().catch(() => null)
  if (sub) await guardar(sub).catch(() => null)
}
