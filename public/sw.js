/// <reference lib="webworker" />

const CACHE_NAME = 'offline-pwa-cache-v3';
const SYNC_QUEUE_KEY = 'sync-queue';

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installation');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activation');
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  if (url.protocol === 'chrome-extension:' || url.hostname.includes('google-analytics')) {
    return;
  }

  event.respondWith(handleFetch(event));
});

async function handleFetch(event) {
  const request = event.request;
  const url = new URL(request.url);

  if (isStaticAsset(url)) {
    return cacheFirstStrategy(request);
  }

  if (request.mode === 'navigate') {
    return networkFirstStrategy(request);
  }

  if (url.pathname.startsWith('/api/')) {
    return apiStrategy(request);
  }

  return cacheFirstStrategy(request);
}

function isStaticAsset(url) {
  return (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/) ||
    url.pathname.includes('/assets/') ||
    url.pathname.includes('/static/')
  );
}

async function cacheFirstStrategy(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log(`[Service Worker] Cache hit: ${request.url}`);
      return cachedResponse;
    }

    console.log(`[Service Worker] Fetch from network: ${request.url}`);
    const networkResponse = await fetch(request);

    if (networkResponse.ok && request.url.startsWith(self.location.origin)) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log(`[Service Worker] Fetch failed: ${request.url}`, error);

    if (request.destination === 'image') {
      return getImagePlaceholder();
    }

    if (request.headers.get('Accept')?.includes('text/html')) {
      return getOfflinePage();
    }

    return new Response('Resource unavailable offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    return getOfflinePage();
  }
}

async function apiStrategy(request) {
  if (request.method === 'POST') {
    return handleApiPost(request);
  }

  try {
    return await fetch(request);
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'offline',
        message: 'Service unavailable offline',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

async function handleApiPost(request) {
  try {
    return await fetch(request);
  } catch (error) {
    console.log('[Service Worker] API offline, storing for sync');

    const requestClone = request.clone();
    const requestData = await requestClone.json();
    const requestUrl = request.url;

    storePendingSync(requestUrl, requestData);

    return new Response(
      JSON.stringify({
        success: true,
        offline: true,
        message: 'Data stored locally for synchronization',
        data: requestData,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

function storePendingSync(url, data) {
  const pendingSyncs = getPendingSyncs();
  const syncItem = {
    id: Date.now().toString(),
    url: url,
    data: data,
    timestamp: new Date().toISOString(),
    attempts: 0,
  };

  pendingSyncs.push(syncItem);
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(pendingSyncs));

  if ('sync' in self.registration) {
    self.registration.sync
      .register('sync-pending-data')
      .then(() => console.log('[Service Worker] Background sync registered'))
      .catch((err) => console.error('[Service Worker] Sync registration failed:', err));
  }

  showNotification('Data stored offline', 'Will sync when back online');
}

function getPendingSyncs() {
  return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
}

function removePendingSync(id) {
  const pendingSyncs = getPendingSyncs();
  const filtered = pendingSyncs.filter((item) => item.id !== id);
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(filtered));
}

self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Sync event:', event.tag);

  if (event.tag === 'sync-pending-data') {
    event.waitUntil(syncPendingData());
  }
});

async function syncPendingData() {
  console.log('[Service Worker] Starting background sync');

  const pendingSyncs = getPendingSyncs();
  if (pendingSyncs.length === 0) {
    console.log('[Service Worker] No data to sync');
    return;
  }

  let syncedCount = 0;

  for (const syncItem of pendingSyncs) {
    try {
      const response = await fetch(syncItem.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(syncItem.data),
      });

      if (response.ok) {
        removePendingSync(syncItem.id);
        syncedCount++;
        console.log(`[Service Worker] Synced: ${syncItem.url}`);
      } else {
        syncItem.attempts++;
        if (syncItem.attempts >= 3) {
          removePendingSync(syncItem.id);
        }
      }
    } catch (error) {
      console.error(`[Service Worker] Sync error: ${syncItem.url}`, error);
      syncItem.attempts++;
    }
  }

  if (syncedCount > 0) {
    showNotification('Sync complete', `${syncedCount} items synchronized`);

    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'SYNC_COMPLETE',
          count: syncedCount,
          timestamp: new Date().toISOString(),
        });
      });
    });
  }
}

self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);

  if (event.data.type === 'GET_PENDING_SYNC_COUNT') {
    const pendingSyncs = getPendingSyncs();
    event.ports[0].postMessage({ count: pendingSyncs.length });
  }

  if (event.data.type === 'TRIGGER_SYNC') {
    if ('sync' in self.registration) {
      self.registration.sync
        .register('sync-pending-data')
        .then(() => console.log('[Service Worker] Manual sync triggered'))
        .catch(console.error);
    }
  }
});

function showNotification(title, body) {
  self.registration.showNotification(title, {
    body: body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'sync-notification',
    data: {
      url: self.location.origin,
    },
    actions: [
      {
        action: 'open',
        title: 'Open',
      },
    ],
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url === event.notification.data.url && 'focus' in client) {
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url);
        }
      })
    );
  }
});

function getImagePlaceholder() {
  return new Response(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f5f5f5"/><text x="50" y="50" text-anchor="middle" dy=".3em" font-family="Arial" font-size="10" fill="#ccc">Offline</text></svg>',
    {
      headers: { 'Content-Type': 'image/svg+xml' },
    }
  );
}

async function getOfflinePage() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const offlinePage = await cache.match('./offline.html');
    if (offlinePage) {
      return offlinePage;
    }
  } catch (error) {
    console.log('[Service Worker] Offline page not found in cache');
  }

  return new Response(
    `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Offline</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          text-align: center; 
          padding: 50px; 
          background: #f5f5f5;
          color: #333;
        }
        h1 { color: #666; margin-bottom: 20px; }
        button {
          background: #007bff;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
        }
        button:hover { background: #0056b3; }
      </style>
    </head>
    <body>
      <h1>You are offline</h1>
      <p>This application requires an internet connection.</p>
      <button onclick="location.reload()">Retry connection</button>
    </body>
    </html>`,
    {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
}
