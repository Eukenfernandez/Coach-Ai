// Coach AI - Service Worker for PWA installability
const CACHE_NAME = 'coach-ai-v2';
const MEDIA_EXTENSIONS = /\.(mp4|mov|webm|m4v|avi|mp3|wav|ogg)$/i;

// Install event - cache essential assets
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            )
        )
    );
    self.clients.claim();
});

// Fetch event - network-first strategy (always use fresh data from Firebase)
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip range/media requests to avoid browser cache errors with streamed video.
    if (event.request.headers.has('range')) return;

    // Skip cross-origin requests (Firebase, Stripe, CDNs)
    const url = new URL(event.request.url);
    if (url.origin !== location.origin) return;

    // Skip media files and other streaming-like requests.
    if (
        event.request.destination === 'video' ||
        event.request.destination === 'audio' ||
        MEDIA_EXTENSIONS.test(url.pathname)
    ) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Cache only safe, cacheable same-origin responses for offline fallback.
                const cacheControl = response.headers.get('cache-control') || '';
                const vary = response.headers.get('vary') || '';
                const isCacheable =
                    response.ok &&
                    response.status === 200 &&
                    response.type === 'basic' &&
                    !cacheControl.includes('no-store') &&
                    vary !== '*';

                if (isCacheable) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone).catch(() => {});
                    });
                }
                return response;
            })
            .catch(() => {
                // Fallback to cache if network fails
                return caches.match(event.request);
            })
    );
});
