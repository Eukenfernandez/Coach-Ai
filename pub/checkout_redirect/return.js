(() => {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action') === 'portal' ? 'portal' : 'payment';
  const status = params.get('status') === 'cancel' ? 'cancel' : 'success';
  const expectedTarget = action === 'payment'
    ? `coachai://app-return?action=payment&status=${status}`
    : 'coachai://app-return?action=portal';
  const suppliedTarget = params.get('target');
  const target = suppliedTarget === expectedTarget ? suppliedTarget : expectedTarget;
  const title = document.getElementById('title');
  const description = document.getElementById('description');
  const openApp = document.getElementById('open-app');
  const continueWeb = document.getElementById('continue-web');

  if (!title || !description || !openApp || !continueWeb) return;
  const webFallback = action === 'payment' ? `/?payment=${status}` : '/';

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
  window.setTimeout(() => window.location.replace(target), 350);
})();
