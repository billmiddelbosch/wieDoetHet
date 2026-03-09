/* global clients */
/**
 * wieDoetHet Service Worker
 *
 * Handles incoming Web Push notifications and notification click events.
 *
 * Push payload shape (JSON):
 *   { title: string, body: string, url: string, tag: string }
 */

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const title = data.title ?? 'wieDoetHet'
  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    data: { url: data.url ?? '/' },
    tag: data.tag ?? 'wdh-reminder',
    renotify: true,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const existing = clientList.find((c) => c.url === url && 'focus' in c)
        if (existing) return existing.focus()
        return clients.openWindow(url)
      })
  )
})
