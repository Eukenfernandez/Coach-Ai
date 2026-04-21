import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

export type ExternalReturnPayload =
  | { action: 'payment'; status: 'success' | 'cancel' }
  | { action: 'portal' };

export const EXTERNAL_RETURN_EVENT = 'coachai:external-return';

const DEFAULT_PUBLIC_APP_URL = 'https://entrenamientos-bfac2.web.app';
const NATIVE_APP_SCHEME = 'coachai';
const RETURN_PAGE_PATH = '/checkout_redirect/index.html';

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const PUBLIC_APP_URL = stripTrailingSlash(
  import.meta.env.VITE_PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL
);

const dispatchExternalReturn = (payload: ExternalReturnPayload) => {
  window.dispatchEvent(
    new CustomEvent<ExternalReturnPayload>(EXTERNAL_RETURN_EVENT, { detail: payload })
  );
};

const parseExternalReturn = (rawUrl: string): ExternalReturnPayload | null => {
  if (!rawUrl) return null;

  try {
    const parsedUrl = new URL(rawUrl);
    const action = parsedUrl.searchParams.get('action');
    const status = parsedUrl.searchParams.get('status');
    const payment = parsedUrl.searchParams.get('payment');

    if (action === 'portal') return { action: 'portal' };
    if (action === 'payment' && (status === 'success' || status === 'cancel')) {
      return { action: 'payment', status };
    }
    if (payment === 'success' || payment === 'cancel') {
      return { action: 'payment', status: payment };
    }
  } catch {
    return null;
  }

  return null;
};

export const isNativeApp = () => Capacitor.isNativePlatform();

export const getPublicAppUrl = () => PUBLIC_APP_URL;

export const getNativeCallbackUrl = (payload: ExternalReturnPayload) => {
  const params = new URLSearchParams({ action: payload.action });
  if (payload.action === 'payment') {
    params.set('status', payload.status);
  }

  return `${NATIVE_APP_SCHEME}://app-return?${params.toString()}`;
};

const getHostedReturnUrl = (payload: ExternalReturnPayload) => {
  const params = new URLSearchParams({ action: payload.action });
  if (payload.action === 'payment') {
    params.set('status', payload.status);
  }
  params.set('target', getNativeCallbackUrl(payload));

  return `${PUBLIC_APP_URL}${RETURN_PAGE_PATH}?${params.toString()}`;
};

export const getPaymentSuccessUrl = () =>
  isNativeApp()
    ? getHostedReturnUrl({ action: 'payment', status: 'success' })
    : `${window.location.origin}/?payment=success`;

export const getPaymentCancelUrl = () =>
  isNativeApp()
    ? getHostedReturnUrl({ action: 'payment', status: 'cancel' })
    : `${window.location.origin}/?payment=cancel`;

export const getPortalReturnUrl = () =>
  isNativeApp() ? getHostedReturnUrl({ action: 'portal' }) : window.location.origin;

export const openExternalUrl = async (url: string) => {
  if (isNativeApp()) {
    await Browser.open({ url });
    return;
  }

  window.location.assign(url);
};

export const closeExternalUrl = async () => {
  if (!isNativeApp()) return;

  try {
    await Browser.close();
  } catch {
    // Browser.close is best effort on native platforms.
  }
};

export const initializeNativeAppShell = () => {
  if (!isNativeApp() || typeof window === 'undefined') return () => {};

  const platform = Capacitor.getPlatform();
  document.documentElement.classList.add('native-app', `native-${platform}`);

  void CapacitorApp.getLaunchUrl().then((launchUrl) => {
    const payload = parseExternalReturn(launchUrl?.url || '');
    if (!payload) return;
    void closeExternalUrl();
    dispatchExternalReturn(payload);
  });

  const listenerPromise = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
    const payload = parseExternalReturn(url);
    if (!payload) return;
    void closeExternalUrl();
    dispatchExternalReturn(payload);
  });

  return () => {
    void listenerPromise.then((listener) => listener.remove());
  };
};
