/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching';

const CACHE_NAME = 'offline-pwa-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/favicon.ico',
  '/css/main.css',
  '/js/main.js'
];

// Utilisation du manifeste de Workbox pour le precaching
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installation');
  
  event.waitUntil(
    (async () => {
      try {
        // Skip waiting pour activation immédiate
        await self.skipWaiting();
        console.log('[Service Worker] skipWaiting effectué');
        
        // Ouvrir le cache
        const cache = await caches.open(CACHE_NAME);
        console.log('[Service Worker] Cache ouvert:', CACHE_NAME);
        
        // Mettre en cache les assets un par un avec gestion d'erreur
        console.log('[Service Worker] Début de la mise en cache des assets');
        
        const cachePromises = STATIC_ASSETS.map(async (asset) => {
          try {
            // Vérifier si l'asset est déjà dans le cache
            const cached = await cache.match(asset);
            if (!cached) {
              console.log(`[Service Worker] Mise en cache: ${asset}`);
              await cache.add(asset);
              console.log(`[Service Worker] ✓ ${asset} mis en cache`);
            } else {
              console.log(`[Service Worker] ⏭️ ${asset} déjà en cache`);
            }
          } catch (error) {
            console.warn(`[Service Worker] ⚠️ Échec de mise en cache pour ${asset}:`, error.message);
            // Ne pas arrêter le processus si un asset échoue
            return Promise.resolve();
          }
        });
        // Attendre que tous les assets soient tentés
        await Promise.all(cachePromises);
        console.log('[Service Worker] Tous les assets traités');
      } catch (error) {
        console.error('[Service Worker] Erreur critique lors de l\'installation:', error);
        // Même en cas d'erreur, on continue
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activation');
  
  // Nettoyage des anciens caches
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        const cacheDeletions = cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Suppression de l\'ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        });
        
        await Promise.all(cacheDeletions);
        
        // Prendre le contrôle immédiat de toutes les pages
        await self.clients.claim();
        
        console.log('[Service Worker] Activation terminée');
      } catch (error) {
        console.error('[Service Worker] Erreur lors de l\'activation:', error);
      }
    })()
  );
});

self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes non-GET
  if (event.request.method !== 'GET') return;
  
  // Ignorer certaines requêtes (ex: analytics, chrome-extension, etc.)
  const url = new URL(event.request.url);
  if (url.protocol === 'chrome-extension:' || 
      url.hostname.includes('google-analytics') ||
      url.hostname.includes('googletagmanager')) {
    return;
  }
  
  // Stratégie Cache First avec fallback réseau
  event.respondWith(
    (async () => {
      try {
        // 1. Essayer d'abord le cache
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          console.log('[Service Worker] Ressource servie depuis le cache:', event.request.url);
          return cachedResponse;
        }

        // 2. Si pas en cache, fetch depuis le réseau
        const networkResponse = await fetch(event.request);
        
        // 3. Mettre en cache la réponse pour plus tard
        // (uniquement les requêtes réussies de la même origine)
        if (networkResponse.ok && networkResponse.status === 200 && 
            event.request.url.startsWith(self.location.origin) &&
            !event.request.url.includes('/api/') &&
            !event.request.url.includes('/socket.io/')) {
          
          const cache = await caches.open(CACHE_NAME);
          // Cloner la réponse car elle ne peut être utilisée qu'une fois
          cache.put(event.request, networkResponse.clone());
          console.log('[Service Worker] Ressource mise en cache:', event.request.url);
        }
        
        return networkResponse;
        
      } catch (error) {
        console.log('[Service Worker] Fetch échoué, fallback offline:', event.request.url);
        
        // Fallback pour la navigation
        if (event.request.mode === 'navigate') {
          const fallback = await caches.match('/offline.html');
          if (fallback) {
            return fallback;
          }
          // Fallback générique si offline.html n'est pas en cache
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Hors ligne</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:50px;}h1{color:#333;}</style></head><body><h1>Vous êtes hors ligne</h1><p>Cette application nécessite une connexion internet.</p></body></html>',
            { 
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
              status: 503
            }
          );
        }
        
        // Pour les images
        if (event.request.destination === 'image' || 
            /\.(png|jpg|jpeg|gif|svg|ico)$/i.test(event.request.url)) {
          // Retourner une image placeholder
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f0f0f0"/><text x="50" y="50" text-anchor="middle" dy=".3em" font-family="Arial" font-size="10" fill="#999">Offline</text></svg>',
            { 
              headers: { 'Content-Type': 'image/svg+xml' }
            }
          );
        }
        
        // Pour les API/JSON
        if (event.request.headers.get('Accept')?.includes('application/json') ||
            event.request.url.includes('/api/')) {
          return new Response(
            JSON.stringify({ 
              error: 'hors_ligne', 
              message: 'Service indisponible en mode hors ligne',
              timestamp: new Date().toISOString()
            }),
            { 
              headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
              },
              status: 503
            }
          );
        }
        
        // Essayer de trouver une version générique dans le cache
        const genericFallback = await caches.match(event.request.url.split('?')[0]);
        if (genericFallback) {
          return genericFallback;
        }
        
        // Erreur générique
        return new Response('Service indisponible en mode hors ligne', { 
          status: 503
        });
      }
    })()
  );
});

// Gestion des événements de synchronisation en arrière-plan
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Événement sync:', event.tag);
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessagesToServer());
  } else if (event.tag === 'sync-data') {
    event.waitUntil(syncDataToServer());
  }
});

// Gestion des événements push
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Notification push reçue');
  
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'Notification', body: event.data.text() || 'Nouvelle notification' };
    }
  }
  
  const options = {
    body: data.body || 'Nouvelle notification',
    icon: data.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      timestamp: new Date().toISOString()
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Notification', options)
  );
});

// Gestion des clics sur les notifications
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Chercher un client ouvert sur l'URL
        for (const client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Si aucun client ouvert, ouvrir une nouvelle fenêtre
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

// Fonctions de synchronisation
async function syncMessagesToServer() {
  console.log('[Service Worker] Synchronisation des messages...');
  
  try {
    const pendingMessages = await getPendingMessages();
    
    for (const message of pendingMessages) {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`
        },
        body: JSON.stringify(message)
      });
      
      if (response.ok) {
        console.log('[Service Worker] Message synchronisé:', message.id);
        await markMessageAsSent(message.id);
      }
    }
  } catch (error) {
    console.error('[Service Worker] Erreur de synchronisation:', error);
  }
}

async function syncDataToServer() {
  console.log('[Service Worker] Synchronisation des données...');
  // Implémentez votre logique de synchronisation ici
}

// Fonctions utilitaires
async function getPendingMessages() {
  // À implémenter selon votre base de données (IndexedDB, localStorage, etc.)
  return [];
}

async function markMessageAsSent(messageId) {
  // À implémenter selon votre base de données
}

async function getAuthToken() {
  // À implémenter selon votre système d'authentification
  return '';
}

// Communication avec les clients
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message reçu:', event.data);
  
  if (event.data && event.data.type === 'CHECK_NETWORK') {
    checkNetworkStatus();
  } else if (event.data && event.data.type === 'CLEAR_CACHE') {
    clearCache();
  } else if (event.data && event.data.type === 'UPDATE_ASSETS') {
    updateAssets(event.data.assets);
  }
});

async function checkNetworkStatus() {
  try {
    const response = await fetch('/api/health', { 
      method: 'HEAD',
      cache: 'no-store',
      timeout: 5000
    });
    
    broadcastToClients({
      type: 'NETWORK_STATUS',
      status: response.ok ? 'online' : 'offline',
      timestamp: new Date().toISOString()
    });
  } catch {
    broadcastToClients({
      type: 'NETWORK_STATUS',
      status: 'offline',
      timestamp: new Date().toISOString()
    });
  }
}

async function clearCache() {
  try {
    await caches.delete(CACHE_NAME);
    console.log('[Service Worker] Cache vidé');
    
    // Recréer le cache avec les assets statiques
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(STATIC_ASSETS);
    
    broadcastToClients({
      type: 'CACHE_CLEARED',
      success: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Service Worker] Erreur lors du vidage du cache:', error);
    broadcastToClients({
      type: 'CACHE_CLEARED',
      success: false,
      error: error.message
    });
  }
}

async function updateAssets(newAssets) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(newAssets);
    
    broadcastToClients({
      type: 'ASSETS_UPDATED',
      success: true,
      assets: newAssets
    });
  } catch (error) {
    console.error('[Service Worker] Erreur lors de la mise à jour des assets:', error);
    broadcastToClients({
      type: 'ASSETS_UPDATED',
      success: false,
      error: error.message
    });
  }
}

function broadcastToClients(message) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      try {
        client.postMessage(message);
      } catch (error) {
        console.error('[Service Worker] Erreur lors de l\'envoi du message:', error);
      }
    });
  });
}

// Vérification initiale du statut réseau
checkNetworkStatus();

// Nettoyage périodique du cache (optionnel)
setInterval(() => {
  console.log('[Service Worker] Nettoyage périodique du cache');
  checkNetworkStatus();
}, 5 * 60 * 1000); // Toutes les 5 minutes
