// MT5 Scalp Command Center - service worker
//
// IMPORTANT SAFETY NOTE (see product spec section 4 / 44):
// This service worker NEVER queues or replays trading commands. Its only job
// is to make the shell of the app installable and to show a clear read-only
// offline state. Trading actions (start/stop/emergency-stop/close-all) are
// always same-origin fetches; if the network is unavailable those requests
// simply fail and the UI shows an error - they are never queued in the
// background for later delivery, which would be unsafe for a trading app.

const CACHE_VERSION = 'mt5-scalp-v1';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;

const APP_SHELL = ['/offline', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never intercept API calls, EA webhooks, or auth flows - those must
  // always hit the network live. Data must never be served stale here.
  if (
    request.method !== 'GET' ||
    request.url.includes('/api/') ||
    request.url.includes('/auth/')
  ) {
    return;
  }

  // Navigation requests: network-first, fall back to the offline read-only
  // page when there's no connectivity.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline').then((res) => res || Response.error())),
    );
    return;
  }

  // Static assets (icons, manifest): cache-first.
  if (request.url.includes('/icons/') || request.url.endsWith('/manifest.json')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request)),
    );
  }
});
