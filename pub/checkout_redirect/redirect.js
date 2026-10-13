// Página puente tras Stripe (checkout / portal) para volver a la app nativa.
//
// Nunca se navega a una URL leída de la query string: el destino nativo se
// reconstruye a partir de valores de una lista cerrada. Las versiones antiguas
// de la app siguen mandando ?target=coachai://app-return?..., que es justo lo
// que se genera aquí, así que se ignora sin romper el retorno.
(function () {
  'use strict';

  var NATIVE_RETURN_URL = 'coachai://app-return';

  var params = new URLSearchParams(window.location.search);
  var action = (params.get('action') || 'payment') === 'payment' ? 'payment' : 'portal';
  var status = params.get('status') === 'cancel' ? 'cancel' : 'success';

  var nativeParams = new URLSearchParams({ action: action });
  if (action === 'payment') {
    nativeParams.set('status', status);
  }
  var target = NATIVE_RETURN_URL + '?' + nativeParams.toString();
  var webFallback = action === 'payment' ? '/?payment=' + status : '/';

  var title = document.getElementById('title');
  var description = document.getElementById('description');
  var openApp = document.getElementById('open-app');
  var continueWeb = document.getElementById('continue-web');

  if (action === 'payment' && status === 'cancel') {
    title.textContent = 'Pago cancelado';
    description.textContent = 'Puedes volver a la app para revisar tu suscripción o continuar desde la web.';
  } else if (action === 'payment') {
    title.textContent = 'Pago confirmado';
    description.textContent = 'Redirigiéndote de nuevo a Coach AI para actualizar tu cuenta.';
  } else {
    title.textContent = 'Suscripción actualizada';
    description.textContent = 'Volviendo a la app para refrescar tu estado de suscripción.';
  }

  openApp.setAttribute('href', target);
  continueWeb.setAttribute('href', webFallback);

  window.setTimeout(function () {
    window.location.replace(target);
  }, 350);
})();
