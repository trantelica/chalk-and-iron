// Chalk and Iron service worker (design Sections 6 and 7).
// 1. Shows notifications sent by the server, such as "Rest over". Tapping one
//    opens the app where the notification points (the workout, at the
//    current exercise, which the phone keeps in its own storage).
// 2. Keeps a copy of the phone app, so it opens with no connection: the
//    app's pages are fetched fresh whenever there is a connection, and the
//    last good copy is used when there is none. The app's code files never
//    change once published (their names change instead), so a kept copy is
//    always the right one.
const CACHE = 'ci-app-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The app's code, styles and fonts: kept copy first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // The phone app's pages: fresh when there is a connection, the kept copy when there is none.
  if (req.mode === 'navigate' && (url.pathname === '/app' || url.pathname.startsWith('/app/'))) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok && !res.redirected && res.type === 'basic') cache.put(url.pathname, res.clone());
        return res;
      } catch (e) {
        const kept = await cache.match(url.pathname);
        if (kept) return kept;
        throw e;
      }
    })());
  }
});

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Chalk and Iron', {
    body: d.body || '',
    tag: d.tag || undefined,
    data: { url: d.url || '/app' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/app';
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of open) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) await c.navigate(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
