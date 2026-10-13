// Registra el service worker en producción y lo limpia en localhost.
// Fichero externo (no inline) para que la CSP no necesite 'unsafe-inline'.
// Lo cargan index.html y las páginas de scripts/generate-seo-pages.tsx.
if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
  var isLocalHost = ['localhost', '127.0.0.1', '::1'].indexOf(window.location.hostname) !== -1;
  window.addEventListener('load', function () {
    if (isLocalHost) {
      navigator.serviceWorker.getRegistrations().then(function (registrations) {
        registrations.forEach(function (registration) { registration.unregister(); });
      }).catch(function () {});
      if ('caches' in window) {
        caches.keys().then(function (keys) {
          keys.filter(function (key) { return key.indexOf('coach-ai') === 0; }).forEach(function (key) { caches.delete(key); });
        }).catch(function () {});
      }
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}
