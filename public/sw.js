/* Minimal app-shell cache. Same-origin GETs only — no API/offline logging. */

// Replaced with a unique build id by the sw-version plugin in vite.config.js
// on every `vite build`, so each deploy gets a fresh cache and the browser
// sees a changed sw.js. (Unreplaced in dev, where the SW isn't registered.)
const VERSION = '__SW_VERSION__'
const CACHE_PREFIX = 'workout-shell-'
const CACHE = `${CACHE_PREFIX}${VERSION}`

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  // No skipWaiting here: a new version waits until the page asks for it
  // (the "Update available — Reload" toast in src/pwa.js), so an open
  // workout isn't swapped out from under the user mid-session.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  const isDocument =
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    (request.headers.get('accept') || '').includes('text/html')

  if (isDocument) {
    event.respondWith(networkFirstDocument(request, url))
    return
  }

  event.respondWith(staleWhileRevalidate(request))
})

/**
 * Navigations: network first, falling back to the cached shell. Only the
 * plain shell is cached (under /index.html) — never URLs with query strings
 * such as auth callbacks (?code=…), which are one-time and user-specific.
 */
async function networkFirstDocument(request, url) {
  try {
    const response = await fetch(request)
    if (
      response.ok &&
      !response.redirected &&
      url.search === '' &&
      (url.pathname === '/' || url.pathname === '/index.html')
    ) {
      const cache = await caches.open(CACHE)
      cache.put('/index.html', response.clone())
    }
    return response
  } catch {
    return (
      (await caches.match('/index.html', { cacheName: CACHE })) ||
      (await caches.match('/index.html')) ||
      Response.error()
    )
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => cached || Response.error())

  return cached || network
}
