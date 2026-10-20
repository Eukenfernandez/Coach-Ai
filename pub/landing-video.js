// Vídeo de la portada (sección [data-landing-video] de comps/public/PublicPageTemplate.tsx).
// Fichero externo (no inline) para que la CSP no necesite 'unsafe-inline'. Las páginas públicas son
// HTML estático sin React, así que aquí vive todo el comportamiento:
// - Se reproduce en silencio solo mientras está a la vista (ahorra batería y datos).
// - El botón activa el sonido y vuelve al principio para oír la música desde el arranque.
// - Con «reducir movimiento» no arranca solo: el botón lo reproduce con sonido.
(function () {
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setSound(box, on) {
    var video = box.querySelector('video');
    var button = box.querySelector('[data-landing-video-sound]');
    if (!video || !button) return;
    video.muted = !on;
    if (on) {
      video.currentTime = 0;
      var playing = video.play();
      if (playing && playing.catch) playing.catch(function () {});
    }
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    var off = button.querySelector('[data-sound-off]');
    var onLabel = button.querySelector('[data-sound-on]');
    if (off) off.hidden = on;
    if (onLabel) onLabel.hidden = !on;
  }

  function init() {
    var boxes = document.querySelectorAll('[data-landing-video]');
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      var video = box.querySelector('video');
      if (!video || box.getAttribute('data-ready') === video.currentSrc + video.getAttribute('src')) continue;
      box.setAttribute('data-ready', video.currentSrc + video.getAttribute('src'));
      video.muted = true;
      setSound(box, false);
      if (reduceMotion) {
        video.removeAttribute('autoplay');
        video.pause();
        continue;
      }
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            var v = entry.target;
            if (entry.isIntersecting) {
              var p = v.play();
              if (p && p.catch) p.catch(function () {});
            } else {
              v.pause();
            }
          });
        }, {threshold: 0.25}).observe(video);
      }
    }
  }

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest ? event.target.closest('[data-landing-video-sound]') : null;
    if (!button) return;
    var box = button.closest('[data-landing-video]');
    if (box) setSound(box, button.getAttribute('aria-pressed') !== 'true');
  });

  window.coachaiInitLandingVideo = init;
  init();
})();
