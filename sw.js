// Service Worker for Austin Pétanque
const CACHE_NAME = 'austin-petanque-v25';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/firebase-config.js',
  '/manifest.json',
  '/logo.jpg',
  '/hero.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.log('SW cache addAll error:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Purging old SW cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && (event.data === 'SKIP_WAITING' || event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  // Network-only for Firestore, Firebase Auth, Google & Apple auth endpoints
  if (
    event.request.url.includes('firestore.googleapis.com') ||
    event.request.url.includes('identitytoolkit.googleapis.com') ||
    event.request.url.includes('securetoken.googleapis.com') ||
    event.request.url.includes('google-analytics') ||
    event.request.url.includes('appleid.apple.com') ||
    event.request.url.includes('accounts.google.com')
  ) {
    return;
  }

  // Network-FIRST strategy for code assets (.html, .js, .css, navigation)
  // Ensures updates are immediately seen on mobile and web while maintaining offline fallback
  const isCode = event.request.mode === 'navigate' ||
                 event.request.url.endsWith('.html') ||
                 event.request.url.includes('.js') ||
                 event.request.url.includes('.css');

  if (isCode) {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(event.request).then((cached) => cached || caches.match('/index.html'));
      })
    );
    return;
  }

  // Stale-while-revalidate for static media / fonts / images
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
