if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  window.addEventListener('load', () => {
    if (isLocalHost) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      }).catch(() => undefined);
      if ('caches' in window) {
        caches.keys().then((keys) => {
          keys.filter((key) => key.startsWith('coach-ai')).forEach((key) => caches.delete(key));
        }).catch(() => undefined);
      }
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
