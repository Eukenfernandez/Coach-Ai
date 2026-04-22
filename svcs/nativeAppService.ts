import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

export type ExternalReturnPayload =
  | { action: 'payment'; status: 'success' | 'cancel' }
  | { action: 'portal' };

type NativeShellDescriptor = {
  platform?: string;
  embedded?: boolean;
  userAgentToken?: string;
  allowedHosts?: string[];
};

declare global {
  interface Window {
    __IS_IOS_APP__?: boolean;
    __COACHAI_NATIVE_SHELL__?: NativeShellDescriptor;
    __COACHAI_HISTORY_PATCHED__?: boolean;
    __COACHAI_WINDOW_OPEN_PATCHED__?: boolean;
  }
}

export const EXTERNAL_RETURN_EVENT = 'coachai:external-return';
export const LOCATION_CHANGE_EVENT = 'coachai:location-change';

const DEFAULT_PUBLIC_APP_URL = 'https://entrenamientos-bfac2.web.app';
const NATIVE_APP_SCHEME = 'coachai';
const RETURN_PAGE_PATH = '/checkout_redirect/index.html';
const IOS_NATIVE_SHELL_TOKEN = 'CoachAI-iOSApp';
const INTERNAL_PROTOCOLS = new Set(['capacitor:', 'http:', 'https:']);

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const PUBLIC_APP_URL = stripTrailingSlash(
  import.meta.env.VITE_PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL
);

const emitLocationChange = () => {
  window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
};

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

const getInjectedShell = () => {
  if (typeof window === 'undefined') return null;
  return window.__COACHAI_NATIVE_SHELL__ || null;
};

const hasInjectedNativeShell = () => {
  if (typeof window === 'undefined') return false;

  if (window.__IS_IOS_APP__ === true) return true;

  const injectedShell = getInjectedShell();
  if (injectedShell?.embedded) return true;

  const datasetShell = document.documentElement.dataset.coachaiNativeShell;
  if (datasetShell === 'ios' || datasetShell === 'native') return true;

  if (document.documentElement.classList.contains('ios-app')) return true;

  const userAgent = navigator.userAgent || '';
  return userAgent.includes(injectedShell?.userAgentToken || IOS_NATIVE_SHELL_TOKEN);
};

const getAllowedInternalHosts = () => {
  const hosts = new Set<string>();
  const injectedShell = getInjectedShell();

  injectedShell?.allowedHosts?.forEach((host) => {
    if (host) hosts.add(host.toLowerCase());
  });

  const currentHost = window.location.host;
  if (currentHost) hosts.add(currentHost.toLowerCase());

  return hosts;
};

const isInternalNavigationUrl = (url: URL) => {
  if (!INTERNAL_PROTOCOLS.has(url.protocol)) return false;

  if (url.origin === window.location.origin) {
    return true;
  }

  if (!url.host) {
    return true;
  }

  return getAllowedInternalHosts().has(url.host.toLowerCase());
};

const navigateInsideShell = (url: URL, replace = false) => {
  const nextLocation = `${url.pathname}${url.search}${url.hash}`;

  if (replace) {
    window.history.replaceState({}, '', nextLocation);
  } else {
    window.history.pushState({}, '', nextLocation);
  }
};

const installHistoryLocationEvents = () => {
  if (typeof window === 'undefined' || window.__COACHAI_HISTORY_PATCHED__) return;

  window.__COACHAI_HISTORY_PATCHED__ = true;

  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = ((data: any, unused: string, url?: string | URL | null) => {
    originalPushState(data, unused, url);
    emitLocationChange();
  }) as typeof window.history.pushState;

  window.history.replaceState = ((data: any, unused: string, url?: string | URL | null) => {
    originalReplaceState(data, unused, url);
    emitLocationChange();
  }) as typeof window.history.replaceState;
};

const installEmbeddedNavigationCompatibility = () => {
  if (typeof document === 'undefined') return () => {};

  const handleDocumentClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;

    const target = event.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    if (anchor.hasAttribute('download')) return;

    const rawHref = anchor.getAttribute('href');
    if (!rawHref || rawHref === '#' || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) return;

    try {
      const resolvedUrl = new URL(rawHref, window.location.href);
      if (!isInternalNavigationUrl(resolvedUrl)) return;

      event.preventDefault();
      navigateInsideShell(resolvedUrl, anchor.dataset.replaceState === 'true');
    } catch {
      // Ignore invalid href values and let the browser handle them.
    }
  };

  const handleDocumentSubmit = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLFormElement)) return;

    const method = (target.getAttribute('method') || 'get').toLowerCase();
    if (method !== 'get') return;

    const action = target.getAttribute('action');
    if (!action || action === '#') return;

    try {
      const resolvedUrl = new URL(action, window.location.href);
      if (!isInternalNavigationUrl(resolvedUrl)) return;

      event.preventDefault();

      const formData = new FormData(target);
      const params = new URLSearchParams();

      formData.forEach((value, key) => {
        if (typeof value === 'string') {
          params.append(key, value);
        }
      });

      resolvedUrl.search = params.toString() ? `?${params.toString()}` : '';
      navigateInsideShell(resolvedUrl);
    } catch {
      // Ignore invalid action values and let the browser handle them.
    }
  };

  document.addEventListener('click', handleDocumentClick, true);
  document.addEventListener('submit', handleDocumentSubmit, true);

  const cleanupTasks = [
    () => document.removeEventListener('click', handleDocumentClick, true),
    () => document.removeEventListener('submit', handleDocumentSubmit, true),
  ];

  if (!window.__COACHAI_WINDOW_OPEN_PATCHED__) {
    window.__COACHAI_WINDOW_OPEN_PATCHED__ = true;
    const originalWindowOpen = window.open.bind(window);

    window.open = ((url?: string | URL, target?: string, features?: string) => {
      if (url) {
        try {
          const resolvedUrl = new URL(String(url), window.location.href);
          if (isInternalNavigationUrl(resolvedUrl)) {
            navigateInsideShell(resolvedUrl);
            return null;
          }
        } catch {
          // Fall through to the original implementation.
        }
      }

      return originalWindowOpen(url, target, features);
    }) as typeof window.open;
  }

  return () => {
    cleanupTasks.forEach((cleanup) => cleanup());
  };
};

export const isNativeApp = () => {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const origin = window.location.origin;
    const capacitorBridge = (
      window as typeof window & {
        Capacitor?: { isNativePlatform?: () => boolean };
      }
    ).Capacitor;

    if (protocol === 'capacitor:' || origin === 'capacitor://localhost') {
      return true;
    }

    if (capacitorBridge?.isNativePlatform?.()) {
      return true;
    }

    if (hasInjectedNativeShell()) {
      return true;
    }
  }

  return Capacitor.isNativePlatform();
};

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
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
    return;
  }

  if (isNativeApp()) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  window.location.assign(url);
};

export const closeExternalUrl = async () => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await Browser.close();
  } catch {
    // Browser.close is best effort on native platforms.
  }
};

export const initializeNativeAppShell = () => {
  if (typeof window === 'undefined' || !isNativeApp()) return () => {};

  installHistoryLocationEvents();

  const injectedShell = getInjectedShell();
  const nativePlatform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : injectedShell?.platform || 'ios';

  document.documentElement.classList.add('ios-app', 'native-app', `native-${nativePlatform}`);
  document.documentElement.dataset.coachaiNativeShell = nativePlatform;
  document.documentElement.dataset.iosApp = 'true';
  window.__IS_IOS_APP__ = true;

  const cleanupCompatibilityLayer = installEmbeddedNavigationCompatibility();

  if (!Capacitor.isNativePlatform()) {
    return () => {
      cleanupCompatibilityLayer();
    };
  }

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
    cleanupCompatibilityLayer();
    void listenerPromise.then((listener) => listener.remove());
  };
};
