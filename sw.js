const CACHE = 'donde-aparque-v1.3.5';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=135',
  './app.js?v=135',
  './manifest.webmanifest?v=135',
  './admin.html',
  './admin.css?v=135',
  './admin.js?v=135',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation and core application files: prefer network so updates appear promptly.
  const core = event.request.mode === 'navigate'
    || /\/(?:index\.html|app\.js|styles\.css|manifest\.webmanifest|admin\.html|admin\.js|admin\.css)$/.test(url.pathname);

  if (core) {
    event.respondWith(
      fetch(event.request, {cache:'no-store'}).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request.mode === 'navigate' ? './index.html' : event.request, copy));
        }
        return response;
      }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});
