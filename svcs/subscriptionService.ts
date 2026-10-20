
// services/subscriptionService.ts

import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/functions';

import type { SubscriptionTier, UserLimits } from '../types';
import { db } from './storageService';
import {
  getPaymentCancelUrl,
  getPaymentSuccessUrl,
  getPortalReturnUrl,
  openExternalUrl,
} from './nativeAppService';

export const STRIPE_PRODUCTS = {
  PRO_ATHLETE: 'prod_TeGEbgvAQJO9pN',
  PREMIUM_ATHLETE: 'prod_TeGEbgvAQJO9pN',
  PRO_COACH: 'prod_TeGEbgvAQJO9pN',
  PREMIUM: 'prod_TeGEbgvAQJO9pN',
} as const;

export const STRIPE_PRICES = {
  PRO_ATHLETE: 'price_1Shp2GRpDniZdTBe8jaP3rKT', // 19.99€
  PREMIUM_ATHLETE: 'price_1Shp77RpDniZdTBeN9KYx4oM', // 49.99€
  PRO_COACH: 'price_1Shp77RpDniZdTBeN9KYx4oM',   // 49.99€
  PREMIUM: 'price_1Sj8emRpDniZdTBeCxkGvGnO',     // 79.99€
} as const;

// Live Billing Portal configuration owned by CoachAI. It is configured in
// Stripe to cancel at the end of the paid period without creating prorations.
const STRIPE_PORTAL_CONFIGURATION_ID = 'bpc_1Sh7NhRpDniZdTBetDbgkClP';

type SubscriptionRole = 'athlete' | 'coach' | 'admin';
export type MarketingTrialSource = 'onboarding' | 'existing_user_offer';

export type MarketingTrialOfferState = {
  show: boolean;
  eligible: boolean;
  reason?: string | null;
  role?: 'athlete' | 'coach';
  planName?: string;
  monthlyAmountCents?: number;
  monthlyPriceLabel?: string;
  freeMonths?: number;
};

const toMillis = (value: any): number => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value < 1_000_000_000_000 ? value * 1000 : value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const tierMatchesRole = (tier: SubscriptionTier, role: SubscriptionRole) => {
  const isCoach = role === 'coach' || role === 'admin';
  return isCoach
    ? tier === 'PRO_COACH' || tier === 'PREMIUM'
    : tier === 'PRO_ATHLETE' || tier === 'PREMIUM_ATHLETE';
};

const resolveTierForPrice = (priceId: string | undefined, role: SubscriptionRole = 'athlete'): SubscriptionTier => {
  if (priceId === STRIPE_PRICES.PRO_ATHLETE && role !== 'coach' && role !== 'admin') return 'PRO_ATHLETE';
  if (priceId === STRIPE_PRICES.PRO_COACH) {
    return role === 'coach' || role === 'admin' ? 'PRO_COACH' : 'PREMIUM_ATHLETE';
  }
  if (priceId === STRIPE_PRICES.PREMIUM && (role === 'coach' || role === 'admin')) return 'PREMIUM';
  return 'FREE';
};

const extractSubscriptionPriceId = (subscriptionData: any): string | undefined => {
  if (subscriptionData?.items?.data?.[0]?.price?.id) return subscriptionData.items.data[0].price.id;
  if (subscriptionData?.items?.[0]?.price?.id) return subscriptionData.items[0].price.id;
  if (subscriptionData?.price?.id) return subscriptionData.price.id;
  return undefined;
};

const TIER_PRIORITY: Record<SubscriptionTier, number> = {
  FREE: 0,
  PRO_ATHLETE: 1,
  PRO_COACH: 1,
  PREMIUM_ATHLETE: 2,
  PREMIUM: 2,
};

const resolveBestSubscriptionTier = (subscriptionDocs: Array<{ data: () => any }>, role: SubscriptionRole) => (
  subscriptionDocs.reduce<SubscriptionTier>((bestTier, subscriptionDoc) => {
    const tier = resolveTierForPrice(extractSubscriptionPriceId(subscriptionDoc.data()), role);
    return TIER_PRIORITY[tier] > TIER_PRIORITY[bestTier] ? tier : bestTier;
  }, 'FREE')
);

const waitForCheckoutRedirect = async (docRef: firebase.firestore.DocumentReference): Promise<void> => (
  new Promise<void>((resolve, reject) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe?.();
      reject(new Error('Stripe está tardando demasiado en preparar el pago. Inténtalo de nuevo.'));
    }, 60_000);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      unsubscribe?.();
    };

    unsubscribe = docRef.onSnapshot(
      (snap) => {
        if (settled) return;
        const data = snap.data() as { url?: string; error?: { message?: string }; } | undefined;
        if (data?.url) {
          settled = true;
          cleanup();
          void openExternalUrl(data.url).then(resolve, reject);
          return;
        }
        if (data?.error) {
          settled = true;
          cleanup();
          const message = data.error.message ?? 'Error desconocido.';
          if (message.includes('No such customer')) {
            reject(new Error('La cuenta de facturación necesita sincronizarse. Cierra sesión, vuelve a entrar e inténtalo de nuevo.'));
            return;
          }
          reject(new Error(message));
        }
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
  })
);

export const createCheckoutSession = async (uid: string, priceId: string): Promise<void> => {
  if (!db) throw new Error('Base de datos no disponible. Refresca la página.');
  if (!priceId) throw new Error("ID de precio no proporcionado.");
  if (!Object.values(STRIPE_PRICES).includes(priceId as any)) {
    throw new Error('El plan seleccionado no es válido.');
  }

  try {
    const docRef = await db.collection('customers').doc(uid).collection('checkout_sessions').add({
      price: priceId,
      mode: 'subscription',
      success_url: getPaymentSuccessUrl(),
      cancel_url: getPaymentCancelUrl(),
      created: new Date().toISOString(),
    });

    return await waitForCheckoutRedirect(docRef);
  } catch (error) {
    throw error;
  }
};

export const getMarketingTrialOffer = async (): Promise<MarketingTrialOfferState> => {
  const functionRef = firebase.app().functions('europe-west1').httpsCallable('getMarketingTrialOffer');
  const result = await functionRef();
  return (result.data || { show: false, eligible: false }) as MarketingTrialOfferState;
};

export const dismissMarketingTrialOffer = async (source: MarketingTrialSource): Promise<void> => {
  const functionRef = firebase.app().functions('europe-west1').httpsCallable('dismissMarketingTrialOffer');
  await functionRef({ source });
};

export const createMarketingTrialCheckout = async (
  uid: string,
  source: MarketingTrialSource,
  language: 'es' | 'ing' | 'eus',
): Promise<void> => {
  if (!db) throw new Error('Base de datos no disponible. Refresca la página.');

  const functionRef = firebase.app().functions('europe-west1').httpsCallable('createMarketingTrialCheckout');
  const result = await functionRef({
    acceptedMarketing: true,
    source,
    language,
    successUrl: getPaymentSuccessUrl(),
    cancelUrl: getPaymentCancelUrl(),
  });
  const checkoutSessionId = (result.data as { checkoutSessionId?: string } | undefined)?.checkoutSessionId;
  if (!checkoutSessionId) {
    throw new Error('No se pudo crear la sesión segura de Stripe.');
  }

  const docRef = db.collection('customers').doc(uid)
    .collection('checkout_sessions').doc(checkoutSessionId);
  await waitForCheckoutRedirect(docRef);
};

export const createPortalSession = async (_uid: string): Promise<void> => {
  try {
    const functionName = 'ext-firestore-stripe-payments-95em-createPortalLink';
    const functionRef = firebase.functions().httpsCallable(functionName);
    const result = await functionRef({
      returnUrl: getPortalReturnUrl(),
      locale: 'auto',
      configuration: STRIPE_PORTAL_CONFIGURATION_ID,
    });
    const data = (result.data ?? {}) as { url?: string };
    if (data?.url) {
      await openExternalUrl(data.url);
      return;
    }
    throw new Error('Stripe no devolvió una URL válida.');
  } catch (error: any) {
    throw error;
  }
};

const isKnownTier = (value: unknown): value is SubscriptionTier =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(TIER_PRIORITY, value);

// Owner account. The full premium allow-list stays server-side (PREMIUM_EMAILS
// in the functions' subscription policy) on purpose — shipping the other
// members' addresses in a public bundle would expose their personal data. This
// one is the site owner's own address and is already present in the bundle for
// the admin menu, so mirroring it here leaks nothing new and keeps the plan UI
// correct even when the subscription callable is stale or unreachable.
const PREMIUM_ALLOW_LIST_EMAILS = ['fernandezeuken@gmail.com'];

// Prefers the Firebase Auth email; falls back to the account email the caller
// already resolved, because a session restored from the local cache can leave
// auth().currentUser momentarily null. Display only: the server re-derives the
// tier from the Auth record alone and owns every quota decision, so a client
// that lies here changes nothing but its own UI.
const hasAllowListedPremiumEmail = (fallbackEmail?: string): boolean => {
  let email: string | undefined | null;
  try {
    email = firebase.auth().currentUser?.email;
  } catch {
    email = undefined;
  }
  const candidate = (email || fallbackEmail || '').toLowerCase();
  return Boolean(candidate && PREMIUM_ALLOW_LIST_EMAILS.includes(candidate));
};

// Same top plan the backend grants allow-listed accounts for their role.
const allowListedTierForRole = (role: SubscriptionRole): SubscriptionTier =>
  role === 'coach' || role === 'admin' ? 'PREMIUM' : 'PREMIUM_ATHLETE';

const fetchAuthoritativeSubscriptionTier = async (): Promise<SubscriptionTier> => {
  const functionRef = firebase.app().functions('europe-west1').httpsCallable('getSubscriptionState');
  const result = await functionRef();
  const tier = (result.data as any)?.tier;
  return isKnownTier(tier) ? tier : 'FREE';
};

// Last tier the server confirmed, per account. Sessions start from it so the
// app never waits on the callable (and its cold start) to render; the backend
// still enforces every limit, so a stale value can only affect what the UI shows.
const SUBSCRIPTION_TIER_CACHE_PREFIX = 'coachai:subscriptionTier:';

export const readCachedSubscriptionTier = (uid: string): SubscriptionTier | null => {
  try {
    const cached = localStorage.getItem(`${SUBSCRIPTION_TIER_CACHE_PREFIX}${uid}`);
    return isKnownTier(cached) ? cached : null;
  } catch {
    return null;
  }
};

const writeCachedSubscriptionTier = (uid: string, tier: SubscriptionTier) => {
  try {
    localStorage.setItem(`${SUBSCRIPTION_TIER_CACHE_PREFIX}${uid}`, tier);
  } catch {
    // Storage unavailable (private mode): the next session asks the server again.
  }
};

export const getSubscriptionTier = async (
  uid: string,
  userEmail?: string,
  role: SubscriptionRole = 'athlete',
): Promise<SubscriptionTier> => {
  if (!db) return 'FREE';
  let tier: SubscriptionTier = 'FREE';
  try {
    tier = await fetchAuthoritativeSubscriptionTier();
    writeCachedSubscriptionTier(uid, tier);
  } catch (error) {
    tier = readCachedSubscriptionTier(uid) || 'FREE';
  }
  // The server already grants allow-listed accounts their top plan; this only
  // covers a stale or unreachable callable so the owner's plan UI stays right.
  if (tier === 'FREE') {
    if (uid === 'MASTER_GOD_EUKEN') return 'PREMIUM';
    if (hasAllowListedPremiumEmail(userEmail)) return allowListedTierForRole(role);
  }
  return tier;
};

// Stripe's webhook normally lands within seconds, but it can lag. Give it a
// generous window instead of silently downgrading to FREE after 20 s.
export const PAYMENT_CONFIRMATION_TIMEOUT_MS = 90000;

export const waitForSubscriptionActive = async (
  uid: string,
  userEmail?: string,
  role: SubscriptionRole = 'athlete',
  timeoutMs: number = PAYMENT_CONFIRMATION_TIMEOUT_MS,
): Promise<SubscriptionTier> => {
  if (!db) return 'FREE';
  if (uid === 'MASTER_GOD_EUKEN') return 'PREMIUM';
  if (hasAllowListedPremiumEmail(userEmail)) return allowListedTierForRole(role);
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      const tier = await fetchAuthoritativeSubscriptionTier();
      if (tier !== 'FREE') return tier;
    } catch {
      // Stripe can take a few seconds to synchronize after checkout.
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1_000));
  } while (Date.now() < deadline);
  return getSubscriptionTier(uid, userEmail, role);
};

export const getUserLimits = (tier: SubscriptionTier): UserLimits => {
  switch (tier) {
    case 'PREMIUM': // Entrenador Premium (79.99€)
      return {
        tier: 'PREMIUM',
        maxAnalysisPerMonth: 300,
        maxVideoUploadsPerMonth: 300,
        maxPdfUploads: 150,
        maxPdfUploadsPerMonth: 150,
        maxVideoDurationSeconds: 600, // 10 minutos
        maxStoredVideos: 300,
        maxStoredPdfs: 150,
        maxChatMessagesPerMonth: 500,
        maxManagedAthletes: 50,
        canCompareVideos: true,
        canUseDeepAnalysis: true,
        aiModel: 'gemini-3.5-flash',
        aiQualityLabel: 'Élite',
      };
    case 'PREMIUM_ATHLETE':
      return {
        tier: 'PREMIUM_ATHLETE',
        maxAnalysisPerMonth: 100,
        maxVideoUploadsPerMonth: 100,
        maxPdfUploads: 30,
        maxPdfUploadsPerMonth: 30,
        maxVideoDurationSeconds: 300,
        maxStoredVideos: 100,
        maxStoredPdfs: 30,
        maxChatMessagesPerMonth: 200,
        maxManagedAthletes: 0,
        canCompareVideos: true,
        canUseDeepAnalysis: true,
        aiModel: 'gemini-3.5-flash',
        aiQualityLabel: 'Élite',
      };
    case 'PRO_COACH': // Entrenador Pro (49.99€)
      return {
        tier: 'PRO_COACH',
        maxAnalysisPerMonth: 100,
        maxVideoUploadsPerMonth: 100,
        maxPdfUploads: 50,
        maxPdfUploadsPerMonth: 50,
        maxVideoDurationSeconds: 300, // 5 mins
        maxStoredVideos: 100,
        maxStoredPdfs: 50,
        maxChatMessagesPerMonth: 200,
        maxManagedAthletes: 20,
        canCompareVideos: true,
        canUseDeepAnalysis: false,
        aiModel: 'gemini-3.6-flash',
        aiQualityLabel: 'Avanzada',
      };
    case 'PRO_ATHLETE': // Atleta Pro (19.99€)
      return {
        tier: 'PRO_ATHLETE',
        maxAnalysisPerMonth: 15,
        maxVideoUploadsPerMonth: 15,
        maxPdfUploads: 10,
        maxPdfUploadsPerMonth: 10,
        maxVideoDurationSeconds: 120, // 2 mins
        maxStoredVideos: 15,
        maxStoredPdfs: 10,
        maxChatMessagesPerMonth: 100,
        maxManagedAthletes: 0,
        canCompareVideos: true,
        canUseDeepAnalysis: false,
        aiModel: 'gemini-3.6-flash',
        aiQualityLabel: 'Avanzada',
      };
    default: // FREE
      return {
        tier: 'FREE',
        maxAnalysisPerMonth: 3,
        maxVideoUploadsPerMonth: 3,
        maxPdfUploads: 2,
        maxPdfUploadsPerMonth: 2,
        maxVideoDurationSeconds: 15,
        maxStoredVideos: 3,
        maxStoredPdfs: 2,
        maxChatMessagesPerMonth: 10,
        maxManagedAthletes: 0,
        canCompareVideos: false, // No comparisons
        canUseDeepAnalysis: false,
        aiModel: 'gemini-3.5-flash-lite',
        aiQualityLabel: 'Esencial',
      };
  }
};
