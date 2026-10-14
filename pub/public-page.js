window.dataLayer = window.dataLayer || [];
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element
    ? event.target.closest('[data-cta-event]')
    : null;
  if (!target) return;
  window.dataLayer.push({
    event: 'coachai_cta_click',
    cta_name: target.getAttribute('data-cta-event'),
    page_path: window.location.pathname,
    page_locale: document.documentElement.lang || 'es',
  });
});
