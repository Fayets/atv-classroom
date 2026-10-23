// Notificaciones de ATV Classroom. Solo muestra avisos y abre el chat al tocarlos: no guarda nada en caché.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

const IOS = /iPhone|iPad|iPod/.test(self.navigator.userAgent)

self.addEventListener('push', (e) => {
  let aviso = {}
  try {
    aviso = e.data ? e.data.json() : {}
  } catch {
    aviso = { cuerpo: e.data ? e.data.text() : '' }
  }
  const url = aviso.url || '/mensajes'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      // Si ya tenés ese chat abierto y a la vista, no hace falta avisar (en el iPhone siempre se muestra:
      // Apple da de baja a las apps que reciben avisos sin mostrarlos).
      const mirando = ventanas.some((v) => v.focused && v.visibilityState === 'visible' && new URL(v.url).search === new URL(url, self.location.origin).search)
      if (mirando && !IOS) return undefined
      return self.registration.showNotification(aviso.titulo || 'ATV Classroom', {
        body: aviso.cuerpo || '',
        icon: '/icono-192.png',
        badge: '/badge-96.png',
        tag: aviso.etiqueta,
        renotify: Boolean(aviso.etiqueta),
        data: { url },
      })
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || '/mensajes', self.location.origin).href
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (ventanas) => {
      const abierta = ventanas.find((v) => v.url.startsWith(self.location.origin))
      if (abierta) {
        await abierta.focus()
        return abierta.navigate ? abierta.navigate(url).catch(() => abierta.postMessage({ tipo: 'ir', url })) : abierta.postMessage({ tipo: 'ir', url })
      }
      return self.clients.openWindow(url)
    }),
  )
})
