
// services/subscriptionService.ts

import firebase from 'firebase/compat/app';
import 'firebase/compat/functions';

import type { SubscriptionTier, UserLimits } from '../types';
import { db } from './storageService';

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
      success_url: `${window.location.origin}/?payment=success`,
      cancel_url: `${window.location.origin}/?payment=cancel`,
      created: new Date().toISOString(),
    });

    return await new Promise<void>((resolve, reject) => {
      const unsubscribe = docRef.onSnapshot(
        (snap) => {
          const data = snap.data() as { url?: string; error?: { message?: string }; } | undefined;
          if (data?.url) {
            unsubscribe();
            window.location.assign(data.url);
            resolve();
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
    const result = await functionRef({ returnUrl: window.location.origin, locale: 'auto' });
    const data = (result.data ?? {}) as { url?: string };
    if (data?.url) {
      window.location.assign(data.url);
      return;
    }
    throw new Error('Stripe no devolvió una URL válida.');
  } catch (error: any) {
    throw error;
  }
};

// Lista de emails con suscripción Premium predeterminada
const PREMIUM_EMAILS = ['alejandrosanchez@gmail.com'];

export const getSubscriptionTier = async (uid: string, userEmail?: string): Promise<SubscriptionTier> => {
  // Premium Email Bypass
  if (userEmail && PREMIUM_EMAILS.includes(userEmail.toLowerCase())) {
    return 'PREMIUM';
  }

  // Test Account Bypass
  if (uid.startsWith('test-')) {
     if (uid === 'test-pro') return 'PRO_ATHLETE';
     if (uid === 'test-coach-pro') return 'PRO_COACH';
     if (uid === 'test-coach-premium') return 'PREMIUM';
     return 'FREE';
  }

  if (!db || uid === 'MASTER_GOD_EUKEN') return 'PREMIUM';
  try {
    const querySnapshot = await db.collection('customers').doc(uid).collection('subscriptions')
        .where('status', 'in', ['active', 'trialing'])
        .get();
    
    if (querySnapshot.empty) return 'FREE';
    
    const subscriptionData = querySnapshot.docs[0].data() as any;
    const priceId: string | undefined = subscriptionData?.items?.[0]?.price?.id ?? subscriptionData?.items?.data?.[0]?.price?.id ?? subscriptionData?.price?.id;
    
    if (!priceId) return 'FREE';
    if (priceId === STRIPE_PRICES.PREMIUM) return 'PREMIUM';
    if (priceId === STRIPE_PRICES.PRO_COACH) return 'PRO_COACH';
    if (priceId === STRIPE_PRICES.PRO_ATHLETE) return 'PRO_ATHLETE';
    return 'FREE';
  } catch (error) {
    return 'FREE';
  }
};

export const waitForSubscriptionActive = async (uid: string, userEmail?: string): Promise<SubscriptionTier> => {
  // Premium Email Bypass
  if (userEmail && PREMIUM_EMAILS.includes(userEmail.toLowerCase())) {
    return 'PREMIUM';
  }

  // Test Account Bypass
  if (uid.startsWith('test-')) {
     if (uid === 'test-pro') return 'PRO_ATHLETE';
     if (uid === 'test-coach-pro') return 'PRO_COACH';
     if (uid === 'test-coach-premium') return 'PREMIUM';
     return 'FREE';
  }

  if (!db) return 'FREE';
  return new Promise<SubscriptionTier>((resolve) => {
    let resolved = false;
    
    const timeoutId = window.setTimeout(() => { if (!resolved) resolve('FREE'); }, 20000);
    
    const unsubscribe = db.collection('customers').doc(uid).collection('subscriptions')
      .where('status', 'in', ['active', 'trialing'])
      .onSnapshot((snapshot) => {
        if (snapshot.empty) return;
        const docData = snapshot.docs[0].data() as any;
        const priceId: string | undefined = docData?.items?.[0]?.price?.id ?? docData?.items?.data?.[0]?.price?.id ?? docData?.price?.id;
        let tier: SubscriptionTier = 'FREE';
        if (priceId === STRIPE_PRICES.PREMIUM) tier = 'PREMIUM';
        else if (priceId === STRIPE_PRICES.PRO_COACH) tier = 'PRO_COACH';
        else if (priceId === STRIPE_PRICES.PRO_ATHLETE) tier = 'PRO_ATHLETE';
        
        if (tier !== 'FREE') {
          resolved = true;
          window.clearTimeout(timeoutId);
          unsubscribe();
          resolve(tier);
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
        maxChatMessagesPerMonth: 100,
        maxManagedAthletes: 0,
        canCompareVideos: true,
        canUseDeepAnalysis: false, // Standard model
      };
    default: // FREE
      return {
        tier: 'FREE',
        maxAnalysisPerMonth: 3,
        maxPdfUploads: 3,
        maxVideoDurationSeconds: 15,
        maxChatMessagesPerMonth: 10,
        maxManagedAthletes: 0,
        canCompareVideos: false, // No comparisons
        canUseDeepAnalysis: false, // Basic model
      };
  }
};
