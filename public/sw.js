/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching';

const CACHE_NAME = 'offline-pwa-cache-v1';

// Assets avec chemins relatifs seulement
const STATIC_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './favicon.ico'
  // Ne pas inclure les chemins comme /css/main.css qui sont générés dynamiquement
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
        
        // Mettre en cache les assets essentiels avec retry
        console.log('[Service Worker] Début de la mise en cache des assets');
        
        for (const asset of STATIC_ASSETS) {
          await cacheAssetWithRetry(cache, asset, 3); // 3 tentatives
        }
        
        console.log('[Service Worker] ✅ Installation terminée');
        
      } catch (error) {
        console.error('[Service Worker] Erreur critique lors de l\'installation:', error);
      }
    })()
  );
});

// Fonction utilitaire pour mettre en cache avec retry
async function cacheAssetWithRetry(cache, assetPath, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Convertir le chemin relatif en URL absolue
      const assetUrl = new URL(assetPath, self.location.origin).href;
      
      console.log(`[Service Worker] Tentative ${attempt}/${maxRetries} pour: ${assetUrl}`);
      
      // Vérifier si déjà en cache
      const cached = await cache.match(assetUrl);
      if (cached) {
        console.log(`[Service Worker] ⏭️ ${assetPath} déjà en cache`);
        return true;
      }
      
      // Tenter de récupérer l'asset
      const response = await fetch(assetUrl, {
        cache: 'no-cache', // Toujours récupérer la dernière version
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (response.ok) {
        await cache.put(assetUrl, response);
        console.log(`[Service Worker] ✅ ${assetPath} mis en cache (tentative ${attempt})`);
        return true;
      } else {
        console.warn(`[Service Worker] ⚠️ ${assetPath} - Status: ${response.status}`);
      }
      
    } catch (error) {
      console.warn(`[Service Worker] ⚠️ Tentative ${attempt} échouée pour ${assetPath}:`, error.message);
      
      // Attendre avant de réessayer (backoff exponentiel)
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 100; // 200ms, 400ms, 800ms...
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`[Service Worker] ❌ Échec après ${maxRetries} tentatives pour ${assetPath}`);
  return false;
}

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activation');
  
  event.waitUntil(
    (async () => {
      try {
        // NE PAS supprimer tous les caches automatiquement
        // Garder le cache existant pour le mode offline
        
        // Vérifier les caches existants
        const cacheNames = await caches.keys();
        console.log('[Service Worker] Caches existants:', cacheNames);
        
        // Supprimer seulement les caches très anciens (optionnel)
        const cacheDeletions = cacheNames.map((cacheName) => {
          if (cacheName.startsWith('offline-pwa-cache-') && cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Suppression de l\'ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        });
        
        await Promise.all(cacheDeletions);
        
        // Prendre le contrôle immédiat de toutes les pages
        await self.clients.claim();
        
        console.log('[Service Worker] ✅ Activation terminée');
        
        // Vérifier l'état du cache après activation
        await checkCacheState();
        
      } catch (error) {
        console.error('[Service Worker] Erreur lors de l\'activation:', error);
      }
    })()
  );
});

async function checkCacheState() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    console.log(`[Service Worker] 📦 Cache contient ${keys.length} éléments:`);
    keys.forEach(request => {
      console.log(`  - ${request.url}`);
    });
  } catch (error) {
    console.error('[Service Worker] Erreur vérification cache:', error);
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Ignorer les requêtes non-GET
  if (event.request.method !== 'GET') return;
  
  // Ignorer certaines requêtes
  if (url.protocol === 'chrome-extension:' || 
      url.hostname.includes('google-analytics') ||
      url.hostname.includes('googletagmanager')) {
    return;
  }
  
  // Stratégie différente selon le type de ressource
  event.respondWith(
    handleFetch(event)
  );
});

async function handleFetch(event) {
  const request = event.request;
  const url = new URL(request.url);
  
  // Pour les assets statiques: Cache First
  if (isStaticAsset(url)) {
    return cacheFirstStrategy(request);
  }
  
  // Pour les pages HTML: Network First avec fallback cache
  if (request.mode === 'navigate') {
    return networkFirstStrategy(request);
  }
  
  // Pour les API: Network Only (pas de cache)
  if (url.pathname.startsWith('/api/')) {
    return networkOnlyStrategy(request);
  }
  
  // Par défaut: Cache First
  return cacheFirstStrategy(request);
}

function isStaticAsset(url) {
  return url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/) ||
         url.pathname.includes('/assets/') ||
         url.pathname.includes('/static/');
}

async function cacheFirstStrategy(request) {
  try {
    // 1. Chercher dans le cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log(`[Service Worker] 📦 Cache hit: ${request.url}`);
      return cachedResponse;
    }
    
    // 2. Si pas en cache, fetch depuis le réseau
    console.log(`[Service Worker] 🌐 Fetch depuis réseau: ${request.url}`);
    const networkResponse = await fetch(request);
    
    // 3. Mettre en cache pour plus tard (sauf erreurs)
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      // Vérifier que c'est une ressource de notre origine
      if (request.url.startsWith(self.location.origin)) {
        cache.put(request, networkResponse.clone());
        console.log(`[Service Worker] ✅ Mis en cache: ${request.url}`);
      }
    }
    
    return networkResponse;
    
  } catch (error) {
    console.log(`[Service Worker] ❌ Fetch échoué: ${request.url}`, error);
    
    // Fallback selon le type de ressource
    if (request.destination === 'image') {
      return getImagePlaceholder();
    }
    
    if (request.headers.get('Accept')?.includes('text/html')) {
      return getOfflinePage();
    }
    
    return new Response('Ressource non disponible hors ligne', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

async function networkFirstStrategy(request) {
  try {
    // 1. Essayer d'abord le réseau
    console.log(`[Service Worker] 🌐 Network first pour: ${request.url}`);
    const networkResponse = await fetch(request);
    
    // Mettre à jour le cache
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
    
  } catch (error) {
    console.log(`[Service Worker] 📦 Fallback au cache pour: ${request.url}`);
    
    // 2. Si échec réseau, chercher dans le cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // 3. Sinon, page offline
    return getOfflinePage();
  }
}

async function networkOnlyStrategy(request) {
  try {
    return await fetch(request);
  } catch (error) {
    console.log(`[Service Worker] ❌ API hors ligne: ${request.url}`);
    return new Response(
      JSON.stringify({ 
        error: 'offline', 
        message: 'Service indisponible en mode hors ligne',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

function getImagePlaceholder() {
  return new Response(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f5f5f5"/><text x="50" y="50" text-anchor="middle" dy=".3em" font-family="Arial" font-size="10" fill="#ccc">Offline</text></svg>',
    { 
      headers: { 'Content-Type': 'image/svg+xml' }
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
    console.log('[Service Worker] Page offline non trouvée dans le cache');
  }
  
  // Page offline par défaut
  return new Response(
    `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Hors ligne</title>
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
      <h1>Vous êtes hors ligne</h1>
      <p>Cette application nécessite une connexion internet.</p>
      <button onclick="location.reload()">Réessayer la connexion</button>
    </body>
    </html>`,
    { 
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    }
  );
}

// Les autres événements (sync, push, etc.) restent inchangés
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Événement sync:', event.tag);
  // ...
});

// Vérification initiale du statut réseau
self.addEventListener('activate', () => {
  setTimeout(() => {
    checkNetworkStatus();
  }, 1000);
});

async function checkNetworkStatus() {
  try {
    const response = await fetch('/api/health', { 
      method: 'HEAD',
      cache: 'no-store'
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

// Sauvegarde périodique de l'état du cache
setInterval(() => {
  console.log('[Service Worker] Vérification du cache...');
  checkCacheState();
}, 30 * 60 * 1000); // Toutes les 30 minutes