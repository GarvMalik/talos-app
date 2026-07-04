/* =========================================
   SERVICE WORKER — TALOS CARE PWA
   
   Handles:
   - App shell caching (offline access)
   - Dynamic caching of API responses
   - Cache versioning
   - Stale-while-revalidate strategy
   - Background sync
   ========================================= */

const CACHE_PREFIX = 'talos-care';
const CACHE_VERSION = 'v5';
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;

const STATIC_ASSETS = [
    '/talos-app/index.html',
    '/talos-app/styles.css',
    '/talos-app/js/global.js',
    '/talos-app/js/i18n.js',
    '/talos-app/js/chat.js',
    '/talos-app/js/review.js',
    '/talos-app/js/settings.js',
    '/talos-app/js/tts.js',
    '/talos-app/js/pdf-generator.js',
    '/talos-app/js/error-handler.js',
    '/talos-app/html/intake.html',
    '/talos-app/html/view-summary.html',
    '/talos-app/html/chat.html',
    '/talos-app/html/review.html',
    '/talos-app/html/settings.html',
    '/talos-app/html/past-summaries.html',
    '/talos-app/html/emergency.html',
    '/talos-app/html/success.html',
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@48,600,1,0',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.5.0/lz-string.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

// =========================================
// INSTALL EVENT — Cache essential assets
// =========================================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log(`[SW] Caching ${STATIC_ASSETS.length} static assets`);
                return cache.addAll(STATIC_ASSETS);
            })
            .catch((err) => {
                console.error('[SW] Cache install failed:', err);
                // Non-fatal: continue without cache
            })
    );
    
    // Activate immediately (skip waiting for other clients)
    self.skipWaiting();
});

// =========================================
// ACTIVATE EVENT — Clean old cache versions
// =========================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Delete old cache versions
                    if (cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME) {
                        console.log(`[SW] Deleting old cache: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    
    // Claim all clients immediately
    self.clients.claim();
});

// =========================================
// FETCH EVENT — Stale-While-Revalidate
// =========================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests and external domains
    if (request.method !== 'GET') return;
    
    // API calls: network-first with cache fallback
    if (url.pathname.includes('/api/') || url.origin.includes('groq') || url.origin.includes('elevenlabs')) {
        event.respondWith(networkFirst(request));
        return;
    }
    
    // Static assets: cache-first with network fallback
    if (isStaticAsset(url)) {
        event.respondWith(cacheFirst(request));
        return;
    }
    
    // HTML pages: stale-while-revalidate
    if (request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }
    
    // Default: network with cache fallback
    event.respondWith(networkWithFallback(request));
});

// =========================================
// CACHE STRATEGIES
// =========================================

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    
    if (cached) {
        console.log(`[SW] Cache hit: ${request.url}`);
        return cached;
    }
    
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        console.error(`[SW] Fetch failed: ${request.url}`, err);
        return createOfflineResponse();
    }
}

async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        console.error(`[SW] Network failed: ${request.url}`, err);
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        return cached || createOfflineResponse();
    }
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    
    const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    }).catch((err) => {
        console.error(`[SW] Background fetch failed: ${request.url}`, err);
        return cached || createOfflineResponse();
    });
    
    return cached || fetchPromise;
}

async function networkWithFallback(request) {
    try {
        return await fetch(request);
    } catch (err) {
        console.error(`[SW] Network failed: ${request.url}`, err);
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        return cached || createOfflineResponse();
    }
}

// =========================================
// HELPER FUNCTIONS
// =========================================

function isStaticAsset(url) {
    return /\.(js|css|png|jpg|svg|woff|woff2)$/i.test(url.pathname) ||
           url.pathname.includes('/fonts/') ||
           url.pathname.includes('/images/');
}

function createOfflineResponse() {
    return new Response(
        `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Offline</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    padding: 20px;
                    text-align: center;
                    background: #F5F5F0;
                    color: #333;
                }
                .container {
                    max-width: 400px;
                    margin: 100px auto;
                }
                h1 { color: #386641; margin-bottom: 10px; }
                p { color: #666; line-height: 1.6; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📡 Offline Mode</h1>
                <p>You're currently offline. Some features may be limited. Check your connection and refresh.</p>
                <p>Your chat history and settings are saved locally.</p>
            </div>
        </body>
        </html>`,
        {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
                'Content-Type': 'text/html; charset=utf-8'
            })
        }
    );
}

// =========================================
// BACKGROUND SYNC (for deferred submissions)
// =========================================
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-submission') {
        event.waitUntil(
            // Retry pending submission when back online
            self.clients.matchAll().then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({
                        type: 'SYNC_SUBMISSION'
                    });
                });
            })
        );
    }
});

// =========================================
// MESSAGE HANDLING (from clients)
// =========================================
self.addEventListener('message', (event) => {
    const { type, payload } = event.data;
    
    if (type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.delete(CACHE_NAME).then(() => {
                event.ports[0].postMessage({ success: true });
            })
        );
    }
    
    if (type === 'CACHE_URLS') {
        // Proactively cache additional URLs
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
                return Promise.all(
                    payload.urls.map((url) => cache.add(url).catch(() => {}))
                ).then(() => {
                    event.ports[0].postMessage({ cached: payload.urls.length });
                });
            })
        );
    }
});

console.log('[SW] Service Worker script loaded');
