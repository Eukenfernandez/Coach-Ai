// Coach AI - Service Worker for PWA installability
const CACHE_NAME = 'coach-ai-v3';
const MEDIA_EXTENSIONS = /\.(mp4|mov|webm|m4v|avi|mp3|wav|ogg)$/i;
const LOCAL_DEV_HOSTS = ['localhost', '127.0.0.1', '::1'];
const IS_LOCAL_DEV = LOCAL_DEV_HOSTS.includes(self.location.hostname);

if (IS_LOCAL_DEV) {
    self.addEventListener('install', (event) => {
        self.skipWaiting();
    });

    self.addEventListener('activate', (event) => {
        event.waitUntil(
            caches.keys()
                .then((cacheNames) => Promise.all(
                    cacheNames
                        .filter((name) => name.startsWith('coach-ai'))
                        .map((name) => caches.delete(name))
                ))
                .then(() => self.registration.unregister())
                .then(() => self.clients.claim())
        );
    });
} else {

// Install event - take over as soon as the new worker is ready
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Activate event - clean old caches, then claim clients. claim() belongs inside
// waitUntil: outside it the worker can be terminated before it takes control.
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            ))
            .then(() => self.clients.claim())
    );
});

const isCacheableResponse = (response) => {
    const cacheControl = response.headers.get('cache-control') || '';
    const vary = response.headers.get('vary') || '';
    return (
        response.ok &&
        response.status === 200 &&
        response.type === 'basic' &&
        !cacheControl.includes('no-store') &&
        vary !== '*'
    );
};

const putInCache = (request, response) => {
    const responseClone = response.clone();
    caches.open(CACHE_NAME).then((cache) => {
        cache.put(request, responseClone).catch(() => {});
    });
};

// Build assets are content-hashed, so a given URL never changes contents:
// serving them from cache first is both faster and immune to a transient
// network failure breaking a dynamic import mid-boot.
const cacheFirst = async (request) => {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (isCacheableResponse(response)) putInCache(request, response);
    return response;
};

const networkFirst = async (request) => {
    try {
        const response = await fetch(request);
        if (isCacheableResponse(response)) putInCache(request, response);
        return response;
    } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Never resolve without a Response. caches.match() yields undefined on a
        // miss, and respondWith(undefined) fails the request with "Failed to
        // convert value to 'Response'" — which turned any network blip into a
        // permanently broken page load. Rethrowing lets the browser treat it as
        // the ordinary network error it is.
        throw error;
    }
};

// Fetch event - immutable assets from cache, everything else network-first
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
        url.pathname.startsWith('/assets/')
            ? cacheFirst(event.request)
            : networkFirst(event.request)
    );
});
}
