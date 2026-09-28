/**
 * Shared tier/quota logic for all Cloud Functions.
 *
 * Single source of truth: index.ts and videoContext.ts previously carried
 * diverging copies of this logic, which is how the `analyses` limit ended up
 * unenforced. Every tier resolution and quota consumption goes through here.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
if (!getApps().length) {
    initializeApp();
}
const db = getFirestore();
// Central source of truth for plan limits (mirrored by subscriptionService.ts on the frontend)
export const PLAN_LIMITS = {
    FREE: { videos: 3, pdfs: 5, analyses: 3, chats: 10, athletes: 0 },
    PRO_ATHLETE: { videos: 15, pdfs: 15, analyses: 15, chats: 100, athletes: 0 },
    PRO_COACH: { videos: 50, pdfs: 100, analyses: 100, chats: 200, athletes: 20 },
    PREMIUM: { videos: 300, pdfs: 300, analyses: 300, chats: 500, athletes: 50 },
};
// Premium bypass emails. Only matched against the Firebase Auth record, and
// only once that record marks the address as verified — never against profile
// documents, which are client-writable. Email/password sign-up does not prove
// ownership of the address, so an unverified match would let anyone register
// an unclaimed listed address and get PREMIUM for free.
// After adding an address, run scripts/verify-premium-accounts.mjs.
export const PREMIUM_EMAILS = ['alejandrosanchez@gmail.com', 'peioetxabe@hotmail.com', 'fernandezeuken@gmail.com', 'julianweber@gmail.com'];
export const STRIPE_PRICE_TO_TIER = {
    price_1Shp2GRpDniZdTBe8jaP3rKT: 'PRO_ATHLETE',
    price_1Shp77RpDniZdTBeN9KYx4oM: 'PRO_COACH',
    price_1Sj8emRpDniZdTBeCxkGvGnO: 'PREMIUM',
};
export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'];
const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
export const resolveAllowedModelForTier = (tier) => {
    switch (tier) {
        case 'PREMIUM':
        case 'ATLETA_PREMIUM':
        case 'PRO_COACH':
            return 'gemini-2.5-pro';
        case 'PRO_ATHLETE':
        case 'ATLETA_PRO':
        case 'FREE':
        default:
            return 'gemini-2.5-flash';
    }
};
export const getServerMonthKey = (date = new Date()) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
export const toMillis = (value) => {
    if (!value)
        return 0;
    if (typeof value.toMillis === 'function')
        return value.toMillis();
    if (typeof value.toDate === 'function')
        return value.toDate().getTime();
    if (value instanceof Date)
        return value.getTime();
    if (typeof value === 'number')
        return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
};
export const getMonthKeyFromValue = (value) => {
    if (!value)
        return null;
    const millis = toMillis(value);
    if (!millis)
        return null;
    return getServerMonthKey(new Date(millis));
};
export const isLegacyUsageInPeriod = (legacyUsage, period) => {
    const explicitPeriod = legacyUsage?.period || legacyUsage?.monthKey || legacyUsage?.monthlyPeriod;
    if (explicitPeriod)
        return String(explicitPeriod) === period;
    const resetPeriod = getMonthKeyFromValue(legacyUsage?.lastAnalysisReset || legacyUsage?.lastChatReset);
    return resetPeriod === period;
};
export const extractSubscriptionPriceId = (subscriptionData) => {
    if (subscriptionData?.items?.data?.[0]?.price?.id)
        return subscriptionData.items.data[0].price.id;
    if (subscriptionData?.items?.[0]?.price?.id)
        return subscriptionData.items[0].price.id;
    if (subscriptionData?.price?.id)
        return subscriptionData.price.id;
    return undefined;
};
export const getAuthBypassTier = (uid, authEmail) => {
    if (authEmail && PREMIUM_EMAILS.includes(authEmail.toLowerCase()))
        return 'PREMIUM';
    // Synthetic test UIDs can never exist in production Firebase Auth; keep the
    // shortcut for the emulator only so a crafted custom token can't use it.
    if (IS_EMULATOR && uid.startsWith('test-')) {
        if (uid.includes('premium'))
            return 'PREMIUM';
        if (uid.includes('coach'))
            return 'PRO_COACH';
        if (uid.includes('pro'))
            return 'PRO_ATHLETE';
        return 'FREE';
    }
    if (uid === 'MASTER_GOD_EUKEN')
        return 'PREMIUM';
    return null;
};
// The Auth-record email, only when that record marks it verified. It feeds
// nothing but the PREMIUM_EMAILS bypass, so callers whose token email is not
// on the list skip the Auth lookup. Never fall back to `users/{uid}` fields:
// those are client-writable and were previously usable to spoof a premium email.
const resolveVerifiedAuthEmail = async (uid, tokenEmail) => {
    if (tokenEmail && !PREMIUM_EMAILS.includes(tokenEmail.toLowerCase()))
        return undefined;
    try {
        const authUser = await getAuth().getUser(uid);
        return authUser.emailVerified ? authUser.email || undefined : undefined;
    }
    catch {
        return undefined;
    }
};
const TIER_RANK = { FREE: 0, PRO_ATHLETE: 1, PRO_COACH: 2, PREMIUM: 3 };
// A customer can briefly hold two active subscriptions (e.g. an upgrade checked
// out next to the old plan); grant the highest one, not whichever doc comes first.
export const pickHighestTier = (tiers) => tiers.reduce((best, tier) => (tier && (TIER_RANK[tier] ?? -1) > (TIER_RANK[best] ?? -1) ? tier : best), 'FREE');
export const resolveUserTier = async (uid, tokenEmail, transaction) => {
    const verifiedEmail = await resolveVerifiedAuthEmail(uid, tokenEmail);
    const bypassTier = getAuthBypassTier(uid, verifiedEmail);
    if (bypassTier)
        return bypassTier;
    const subscriptionQuery = db.collection('customers').doc(uid).collection('subscriptions')
        .where('status', 'in', ACTIVE_SUBSCRIPTION_STATUSES);
    const subscriptionSnap = transaction ? await transaction.get(subscriptionQuery) : await subscriptionQuery.get();
    return pickHighestTier(subscriptionSnap.docs.map((doc) => {
        const priceId = extractSubscriptionPriceId(doc.data());
        return priceId ? STRIPE_PRICE_TO_TIER[priceId] : undefined;
    }));
};
export const normalizeMonthlyCounters = (rawCounters, period, legacyUsage) => {
    const legacyOrCurrent = !rawCounters?.period || rawCounters.period === period;
    if (!legacyOrCurrent) {
        return { videos: 0, pdfs: 0, chats: 0, analyses: 0 };
    }
    // First deployment after the old client counters may find quota_counters
    // without a period. Seed the new monthly cloud counter from legacy cloud
    // usage once, then future months are governed by the server period.
    const shouldMergeLegacy = isLegacyUsageInPeriod(legacyUsage, period) || !rawCounters?.period;
    const legacyVideos = shouldMergeLegacy ? Number(legacyUsage?.analysisCount ?? 0) || 0 : 0;
    const legacyPdfs = shouldMergeLegacy ? Number(legacyUsage?.plansCount ?? 0) || 0 : 0;
    const legacyChats = shouldMergeLegacy ? Number(legacyUsage?.chatCount ?? 0) || 0 : 0;
    return {
        videos: Math.max(Number(rawCounters?.videosMonthly ?? rawCounters?.videosGlobal ?? 0) || 0, legacyVideos),
        pdfs: Math.max(Number(rawCounters?.pdfsMonthly ?? rawCounters?.pdfsGlobal ?? 0) || 0, legacyPdfs),
        chats: Math.max(Number(rawCounters?.chatsMonthly ?? rawCounters?.chatCount ?? 0) || 0, legacyChats),
        analyses: Number(rawCounters?.analysesMonthly ?? 0) || 0,
    };
};
export const buildCounterUpdate = (period, counters) => ({
    period,
    videosMonthly: counters.videos,
    pdfsMonthly: counters.pdfs,
    chatsMonthly: counters.chats,
    analysesMonthly: counters.analyses,
    // Backwards-compatible aliases for existing client reads and migrations.
    videosGlobal: counters.videos,
    pdfsGlobal: counters.pdfs,
    chatCount: counters.chats,
    lastUpdated: FieldValue.serverTimestamp(),
});
const QUOTA_LABELS = {
    videos: 'vídeos',
    pdfs: 'PDFs',
    chats: 'mensajes de IA',
    analyses: 'análisis de IA',
};
export const consumeMonthlyQuota = async (uid, tokenEmail, kind) => {
    const period = getServerMonthKey();
    return db.runTransaction(async (transaction) => {
        const tier = await resolveUserTier(uid, tokenEmail, transaction);
        const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.FREE;
        const limit = limits[kind];
        const counterRef = db.collection("quota_counters").doc(uid);
        const userDataRef = db.collection("userdata").doc(uid);
        const [counterSnap, userDataSnap] = await Promise.all([
            transaction.get(counterRef),
            transaction.get(userDataRef),
        ]);
        const counters = normalizeMonthlyCounters(counterSnap.exists ? counterSnap.data() : {}, period, userDataSnap.exists ? userDataSnap.data()?.usage : undefined);
        const current = counters[kind];
        if (limit !== 'unlimited' && current >= limit) {
            throw new HttpsError("resource-exhausted", `Has alcanzado el límite mensual de ${QUOTA_LABELS[kind]} de tu suscripción.`);
        }
        const nextCounters = {
            ...counters,
            [kind]: current + 1,
        };
        transaction.set(counterRef, buildCounterUpdate(period, nextCounters), { merge: true });
        return { count: current + 1, limit, tier, period };
    });
};
