// Empuja los clics en elementos [data-cta-event] a window.dataLayer.
// Fichero externo (no inline) para que la CSP no necesite 'unsafe-inline';
// la ruta y el idioma de la página llegan por data-* en la etiqueta <script>
// que emite scripts/generate-seo-pages.tsx.
(function () {
  var script = document.currentScript;
  var pagePath = (script && script.getAttribute('data-page-path')) || window.location.pathname;
  var pageLocale = (script && script.getAttribute('data-page-locale')) || document.documentElement.lang || '';

  window.dataLayer = window.dataLayer || [];
  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target.closest('[data-cta-event]') : null;
    if (!target) return;
    window.dataLayer.push({
      event: 'coachai_cta_click',
      cta_name: target.getAttribute('data-cta-event'),
      page_path: pagePath,
      page_locale: pageLocale
    });
  });
})();
