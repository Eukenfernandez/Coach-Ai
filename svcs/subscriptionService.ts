
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
  PRO_COACH: 'prod_TeGEbgvAQJO9pN',
  PREMIUM: 'prod_TeGEbgvAQJO9pN',
} as const;

export const STRIPE_PRICES = {
  PRO_ATHLETE: 'price_1Shp2GRpDniZdTBe8jaP3rKT', // 19.99€
  PRO_COACH: 'price_1Shp77RpDniZdTBeN9KYx4oM',   // 49.99€
  PREMIUM: 'price_1Sj8emRpDniZdTBeCxkGvGnO',     // 79.99€
} as const;

export const createCheckoutSession = async (uid: string, priceId: string): Promise<void> => {
  if (!db) throw new Error('Base de datos no disponible. Refresca la página.');
  if (!priceId) throw new Error("ID de precio no proporcionado.");

  try {
    const docRef = await db.collection('customers').doc(uid).collection('checkout_sessions').add({
      price: priceId,
      mode: 'subscription',
      success_url: getPaymentSuccessUrl(),
      cancel_url: getPaymentCancelUrl(),
      created: new Date().toISOString(),
    });

    return await new Promise<void>((resolve, reject) => {
      const unsubscribe = docRef.onSnapshot(
        (snap) => {
          const data = snap.data() as { url?: string; error?: { message?: string }; } | undefined;
          if (data?.url) {
            unsubscribe();
            void openExternalUrl(data.url).then(() => resolve(), reject);
            return;
          }
          if (data?.error) {
            unsubscribe();
            const message = data.error.message ?? 'Error desconocido.';
            if (message.includes('No such customer')) {
              db.collection('customers').doc(uid).delete().then(() => reject(new Error('Resincronizado. Inténtalo de nuevo.')));
              return;
            }
            reject(new Error(message));
          }
        },
        (err) => reject(err)
      );
    });
  } catch (error) {
    throw error;
  }
};

export const createPortalSession = async (_uid: string): Promise<void> => {
  try {
    const functionName = 'ext-firestore-stripe-payments-95em-createPortalLink';
    const functionRef = firebase.functions().httpsCallable(functionName);
    const result = await functionRef({ returnUrl: getPortalReturnUrl(), locale: 'auto' });
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
  value === 'FREE' || value === 'PRO_ATHLETE' || value === 'PRO_COACH' || value === 'PREMIUM';

const TIER_RANK: Record<SubscriptionTier, number> = { FREE: 0, PRO_ATHLETE: 1, PRO_COACH: 2, PREMIUM: 3 };

const tierForPriceId = (priceId: string | undefined): SubscriptionTier => {
  if (priceId === STRIPE_PRICES.PREMIUM) return 'PREMIUM';
  if (priceId === STRIPE_PRICES.PRO_COACH) return 'PRO_COACH';
  if (priceId === STRIPE_PRICES.PRO_ATHLETE) return 'PRO_ATHLETE';
  return 'FREE';
};

const extractPriceId = (subscriptionData: any): string | undefined =>
  subscriptionData?.items?.data?.[0]?.price?.id
  ?? subscriptionData?.items?.[0]?.price?.id
  ?? subscriptionData?.price?.id;

// Mirrors pickHighestTier() in fns/src/quota.ts: with two active subscriptions
// (an upgrade checked out next to the old plan) the highest one wins, not
// whichever document Firestore returns first.
const highestTierFromSubscriptions = (docs: Array<{ data: () => unknown }>): SubscriptionTier =>
  docs.reduce<SubscriptionTier>((best, doc) => {
    const tier = tierForPriceId(extractPriceId(doc.data()));
    return TIER_RANK[tier] > TIER_RANK[best] ? tier : best;
  }, 'FREE');

// Owner account. The full premium allow-list stays server-side in
// fns/src/quota.ts (PREMIUM_EMAILS) on purpose — shipping the other members'
// addresses in a public bundle would expose their personal data. This one is
// the site owner's own address and is already present in the bundle for the
// admin menu, so mirroring it here leaks nothing new and keeps the plan UI
// correct even when the quota callable is stale or unreachable.
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

export const getSubscriptionTier = async (uid: string, userEmail?: string): Promise<SubscriptionTier> => {
  // Test Account Bypass (local demo accounts only)
  if (uid.startsWith('test-')) {
    if (uid === 'test-pro') return 'PRO_ATHLETE';
    if (uid === 'test-coach-pro') return 'PRO_COACH';
    if (uid === 'test-coach-premium') return 'PREMIUM';
    return 'FREE';
  }

  if (!db || uid === 'MASTER_GOD_EUKEN' || hasAllowListedPremiumEmail(userEmail)) return 'PREMIUM';

  // The server is the authority on tier (it also owns any premium
  // allow-listing). The subscription query below is only a fallback.
  try {
    const callable = firebase.app().functions('europe-west1').httpsCallable('getCoachQuotaUsage');
    const result = await callable();
    const serverTier = (result.data as any)?.tier;
    if (isKnownTier(serverTier)) return serverTier;
  } catch {
    // Offline or callable unavailable: fall through to the direct read.
  }

  try {
    const querySnapshot = await db.collection('customers').doc(uid).collection('subscriptions')
      .where('status', 'in', ['active', 'trialing'])
      .get();

    return highestTierFromSubscriptions(querySnapshot.docs);
  } catch (error) {
    return 'FREE';
  }
};

export const PAYMENT_CONFIRMATION_TIMEOUT_MS = 90000;

export const waitForSubscriptionActive = async (
  uid: string,
  userEmail?: string,
  timeoutMs: number = PAYMENT_CONFIRMATION_TIMEOUT_MS,
): Promise<SubscriptionTier> => {
  // Test Account Bypass
  if (uid.startsWith('test-')) {
    if (uid === 'test-pro') return 'PRO_ATHLETE';
    if (uid === 'test-coach-pro') return 'PRO_COACH';
    if (uid === 'test-coach-premium') return 'PREMIUM';
    return 'FREE';
  }

  if (hasAllowListedPremiumEmail(userEmail)) return 'PREMIUM';
  if (!db) return 'FREE';
  return new Promise<SubscriptionTier>((resolve) => {
    let resolved = false;
    let unsubscribe: (() => void) | null = null;

    const finalize = (tier: SubscriptionTier) => {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timeoutId);
      unsubscribe?.();
      resolve(tier);
    };

    // Stripe's webhook normally lands within seconds, but it can lag. Give it
    // a generous window instead of silently downgrading to FREE after 20 s.
    const timeoutId = window.setTimeout(() => {
      finalize('FREE');
    }, timeoutMs);

    unsubscribe = db.collection('customers').doc(uid).collection('subscriptions')
      .where('status', 'in', ['active', 'trialing'])
      .onSnapshot((snapshot) => {
        if (snapshot.empty) return;
        const tier = highestTierFromSubscriptions(snapshot.docs);

        if (tier !== 'FREE') {
          finalize(tier);
        }
      });
  });
};

export const getUserLimits = (tier: SubscriptionTier): UserLimits => {
  switch (tier) {
    case 'PREMIUM': // Entrenador Premium (79.99€)
      return {
        tier: 'PREMIUM',
        maxAnalysisPerMonth: 300,
        maxPdfUploads: 300,
        maxVideoDurationSeconds: 600, // 10 minutos
        maxStoredVideos: 300,
        maxChatMessagesPerMonth: 500,
        maxManagedAthletes: 50,
        canCompareVideos: true,
        canUseDeepAnalysis: true, // Deep Analysis (Gemini 3 Pro)
      };
    case 'PRO_COACH': // Entrenador Pro (49.99€)
      return {
        tier: 'PRO_COACH',
        maxAnalysisPerMonth: 100,
        maxPdfUploads: 100,
        maxVideoDurationSeconds: 300, // 5 mins
        maxStoredVideos: 50,
        maxChatMessagesPerMonth: 200,
        maxManagedAthletes: 20,
        canCompareVideos: true,
        canUseDeepAnalysis: false, // Standard model (Gemini 2.5 Flash)
      };
    case 'PRO_ATHLETE': // Atleta Pro (19.99€)
      return {
        tier: 'PRO_ATHLETE',
        maxAnalysisPerMonth: 15,
        maxPdfUploads: 15,
        maxVideoDurationSeconds: 120, // 2 mins
        maxStoredVideos: 15,
        maxChatMessagesPerMonth: 100,
        maxManagedAthletes: 0,
        canCompareVideos: true,
        canUseDeepAnalysis: false, // Standard model
      };
    default: // FREE
      return {
        tier: 'FREE',
        maxAnalysisPerMonth: 3,
        maxPdfUploads: 5,
        maxVideoDurationSeconds: 15,
        maxStoredVideos: 3,
        maxChatMessagesPerMonth: 10,
        maxManagedAthletes: 0,
        canCompareVideos: false, // No comparisons
        canUseDeepAnalysis: false, // Basic model
      };
  }
};
