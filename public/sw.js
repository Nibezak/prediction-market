const OFFLINE_CACHE = 'slimefish-offline-v3'
const OFFLINE_URL = '/en/offline'

globalThis.addEventListener('install', (event) => {
  // Wait for the app shell to ask before replacing an active PWA session.
  event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.addAll([
    OFFLINE_URL,
    '/images/brand/octopus-slimefish.svg',
  ])))
})

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    globalThis.clients.claim(),
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith('slimefish-offline-') && key !== OFFLINE_CACHE)
      .map(key => caches.delete(key)))),
  ]))
})

globalThis.addEventListener('message', (event) => {
  if (event.data?.type === 'SLIMEFISH_SKIP_WAITING') {
    globalThis.skipWaiting()
  }
})

function resolveSafeNotificationUrl(rawUrl) {
  const fallbackUrl = `${globalThis.location.origin}/`

  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return fallbackUrl
  }

  try {
    const parsedUrl = new URL(rawUrl, globalThis.location.origin)

    if (parsedUrl.origin !== globalThis.location.origin) {
      return fallbackUrl
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return fallbackUrl
    }

    return parsedUrl.toString()
  }
  catch {
    return fallbackUrl
  }
}

globalThis.addEventListener('push', (event) => {
  if (!event.data) {
    return
  }

  let data = {}

  try {
    data = event.data.json()
  }
  catch {
    data = { body: event.data.text() }
  }

  const title = typeof data.title === 'string' && data.title.trim()
    ? data.title
    : 'New notification'
  const body = typeof data.body === 'string' ? data.body : ''
  const icon = typeof data.icon === 'string' && data.icon.trim()
    ? data.icon
    : '/images/pwa/default-icon-192.png'
  const badge = typeof data.badge === 'string' && data.badge.trim()
    ? data.badge
    : '/images/pwa/default-icon-192.png'
  const url = resolveSafeNotificationUrl(data.url)
  const tag = typeof data.tag === 'string' ? data.tag.slice(0, 120) : undefined
  const notificationId = typeof data.data?.notificationId === 'string' ? data.data.notificationId : undefined
  const category = typeof data.data?.category === 'string' ? data.data.category : undefined

  event.waitUntil(
    globalThis.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      data: { url, notificationId, category },
    }),
  )
})

globalThis.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = resolveSafeNotificationUrl(event.notification.data?.url)
  const notificationId = event.notification.data?.notificationId

  event.waitUntil((async () => {
    if (typeof notificationId === 'string') {
      try {
        await fetch('/api/push/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notificationId, action: 'opened' }),
          credentials: 'include',
        })
      }
      catch {
        // Opening the app must not depend on analytics delivery.
      }
    }
    const windowClients = await globalThis.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })

    for (const client of windowClients) {
      if ('focus' in client && 'navigate' in client) {
        try {
          if (client.url !== targetUrl) {
            await client.navigate(targetUrl)
          }

          await client.focus()
          return
        }
        catch {
          //
        }
      }
    }

    if ('openWindow' in globalThis.clients) {
      await globalThis.clients.openWindow(targetUrl)
    }
  })())
})

globalThis.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).catch(async () => {
    return await caches.match(OFFLINE_URL) || Response.error()
  }))
})
