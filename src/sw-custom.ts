/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching';

const CACHE_NAME = 'offline-pwa-cache-v1';
// const ASSETS = [
//   '/',
//   '/index.html',
//   '/offline.html',
//   '/src/main.tsx',
//   '/src/App.tsx',
//   '/public/pwa-192x192.png',
//   '/public/pwa-512x512.png',
// ];
const swSelf: ServiceWorkerGlobalScope = self as unknown as ServiceWorkerGlobalScope;

precacheAndRoute(swSelf.__WB_MANIFEST);

swSelf.addEventListener('install', () => { // event: ExtendableEvent
  console.log('[Service Worker] Install');
  // event.waitUntil(
  //   caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  // );
  swSelf.skipWaiting();
});

swSelf.addEventListener('activate', () => { // event: ExtendableEvent
  console.log('[Service Worker] Activate');
  // event.waitUntil(
  //   caches.keys().then((keys) =>
  //     Promise.all(
  //       keys.map((key) => {
  //         if (key !== CACHE_NAME) return caches.delete(key);
  //       })
  //     )
  //   )
  // );
  swSelf.clients.claim();
});

swSelf.addEventListener('fetch', (event: FetchEvent) => {
  event.respondWith(
    (async () => {
      try {
        // On regarde si la requête est en cache
        const cachedRes = await caches.match(event.request);
        if (cachedRes) return cachedRes;
        // Sinon on fetch le réseau
        const networkRes = await fetch(event.request);
        if (event.request.method === 'GET' && networkRes.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkRes.clone());
        }
        return networkRes;
      } catch (err) {
        // Fallback offline pour navigation HTML
        if (event.request.mode === 'navigate') {
          const fallback = await caches.match('/offline.html');
          return fallback || new Response('Vous êtes hors ligne', { status: 503, statusText: 'Offline' });
        }
        // Pour les requêtes API ou autres, on peut renvoyer une erreur générique
        return new Response('Service indisponible', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});

self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessagesToServer());
  }
});

async function syncMessagesToServer() {
  console.log('[Service Worker] Syncing messages...');
  // Ici tu pourrais envoyer les messages stockés localStorage/indexedDB vers ton serveur
}

swSelf.clients.matchAll().then(clients =>
  clients.forEach(client =>
    client.postMessage({ type: 'NETWORK_STATUS', status: 'offline' })
  )
);
