import { getAuth } from 'firebase-admin/auth';

export type SubscriptionTier = 'FREE' | 'PRO_ATHLETE' | 'PREMIUM_ATHLETE' | 'PRO_COACH' | 'PREMIUM';
export type SubscriptionRole = 'athlete' | 'coach';

export type PlanLimits = {
  monthlyVideoUploads: number;
  storedVideos: number;
  monthlyPdfUploads: number;
  storedPdfs: number;
  monthlyAiMessages: number | 'unlimited';
  managedAthletes: number | 'unlimited';
  canCompareVideos: boolean;
  aiModel: string;
};

export const STRIPE_PRICE_IDS = {
  PRO_ATHLETE: 'price_1Shp2GRpDniZdTBe8jaP3rKT',
  PREMIUM_ATHLETE_OR_PRO_COACH: 'price_1Shp77RpDniZdTBeN9KYx4oM',
  PREMIUM_COACH: 'price_1Sj8emRpDniZdTBeCxkGvGnO',
} as const;

export const PLAN_LIMITS: Record<SubscriptionTier, PlanLimits> = {
  FREE: {
    monthlyVideoUploads: 3,
    storedVideos: 3,
    monthlyPdfUploads: 2,
    storedPdfs: 2,
    monthlyAiMessages: 10,
    managedAthletes: 0,
    canCompareVideos: false,
    aiModel: 'gemini-3.5-flash-lite',
  },
  PRO_ATHLETE: {
    monthlyVideoUploads: 15,
    storedVideos: 15,
    monthlyPdfUploads: 10,
    storedPdfs: 10,
    monthlyAiMessages: 100,
    managedAthletes: 0,
    canCompareVideos: true,
    aiModel: 'gemini-3.6-flash',
  },
  PREMIUM_ATHLETE: {
    monthlyVideoUploads: 100,
    storedVideos: 100,
    monthlyPdfUploads: 30,
    storedPdfs: 30,
    monthlyAiMessages: 200,
    managedAthletes: 0,
    canCompareVideos: true,
    aiModel: 'gemini-3.5-flash',
  },
  PRO_COACH: {
    monthlyVideoUploads: 100,
    storedVideos: 100,
    monthlyPdfUploads: 50,
    storedPdfs: 50,
    monthlyAiMessages: 200,
    managedAthletes: 20,
    canCompareVideos: true,
    aiModel: 'gemini-3.6-flash',
  },
  PREMIUM: {
    monthlyVideoUploads: 300,
    storedVideos: 300,
    monthlyPdfUploads: 150,
    storedPdfs: 150,
    monthlyAiMessages: 500,
    managedAthletes: 50,
    canCompareVideos: true,
    aiModel: 'gemini-3.5-flash',
  },
};

const PREMIUM_EMAILS = [
  'alejandrosanchez@gmail.com',
  'peioetxabe@hotmail.com',
  'fernandezeuken@gmail.com',
  'julianweber@gmail.com',
];

// Free cycles are anchored on users/{uid}.createdAt, which Firestore rules make
// immutable after creation. Accounts without a usable value share this fixed
// anchor; falling back to "now" would open a fresh period on every call.
export const FREE_CYCLE_FALLBACK_ANCHOR_MS = Date.UTC(2026, 0, 1);

// Accounts created before email verification was enforced keep their email
// trusted; newer accounts must verify it before it grants anything.
export const EMAIL_TRUST_CUTOFF_MS = Date.parse('2026-10-14T00:00:00Z');

export type AuthUserLike = {
  uid?: string;
  email?: string | null;
  emailVerified?: boolean;
  metadata?: { creationTime?: string | null } | null;
};

export type AuthUserLoader = (uid: string) => Promise<AuthUserLike | null>;

export const isAuthEmailTrusted = (u: AuthUserLike | null | undefined): boolean =>
  u?.emailVerified === true
  || Date.parse(String(u?.metadata?.creationTime ?? '')) < EMAIL_TRUST_CUTOFF_MS;

// Returns null only when the account does not exist. Every other failure is
// rethrown: resolving FREE on a transient Auth error could trigger the
// gallery-deletion enforcement for an account that is actually premium.
export const createAuthUserLoader = (
  getUser: (uid: string) => Promise<AuthUserLike>,
): AuthUserLoader => async (uid: string) => {
  try {
    return await getUser(uid);
  } catch (error: any) {
    if (error?.code === 'auth/user-not-found') return null;
    throw error;
  }
};

const defaultLoadAuthUser: AuthUserLoader = createAuthUserLoader((uid) => getAuth().getUser(uid));

const normalizeEmail = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'];

const TIER_PRIORITY: Record<SubscriptionTier, number> = {
  FREE: 0,
  PRO_ATHLETE: 1,
  PRO_COACH: 1,
  PREMIUM_ATHLETE: 2,
  PREMIUM: 2,
};

export type SubscriptionContext = {
  tier: SubscriptionTier;
  role: SubscriptionRole;
  period: string;
  periodStartMs: number;
  periodEndMs: number;
  subscriptionId?: string;
  cancelAtPeriodEnd?: boolean;
};

const normalizeRole = (value: unknown): SubscriptionRole =>
  value === 'coach' || value === 'admin' ? 'coach' : 'athlete';

export const resolveTierForPrice = (
  priceId: string | undefined,
  role: SubscriptionRole,
): SubscriptionTier | null => {
  if (!priceId) return null;
  if (priceId === STRIPE_PRICE_IDS.PRO_ATHLETE) {
    return role === 'coach' ? null : 'PRO_ATHLETE';
  }
  if (priceId === STRIPE_PRICE_IDS.PREMIUM_ATHLETE_OR_PRO_COACH) {
    return role === 'coach' ? 'PRO_COACH' : 'PREMIUM_ATHLETE';
  }
  if (priceId === STRIPE_PRICE_IDS.PREMIUM_COACH) {
    return role === 'coach' ? 'PREMIUM' : null;
  }
  return null;
};

export const extractSubscriptionPriceId = (subscriptionData: any): string | undefined => {
  if (subscriptionData?.items?.data?.[0]?.price?.id) return subscriptionData.items.data[0].price.id;
  if (subscriptionData?.items?.[0]?.price?.id) return subscriptionData.items[0].price.id;
  if (subscriptionData?.price?.id) return subscriptionData.price.id;
  return undefined;
};

export const toMillis = (value: any): number => {
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

const daysInUtcMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

const buildAnchoredDate = (anchor: Date, year: number, month: number) => {
  const day = Math.min(anchor.getUTCDate(), daysInUtcMonth(year, month));
  return Date.UTC(
    year,
    month,
    day,
    anchor.getUTCHours(),
    anchor.getUTCMinutes(),
    anchor.getUTCSeconds(),
    anchor.getUTCMilliseconds(),
  );
};

export const getAnchoredMonthlyPeriod = (
  anchorValue: unknown,
  nowValue: unknown = Date.now(),
): { period: string; periodStartMs: number; periodEndMs: number } => {
  const nowMs = toMillis(nowValue) || Date.now();
  const parsedAnchorMs = toMillis(anchorValue);
  // Also reject finite values outside the Date range (e.g. 1e20), which would
  // produce a "cycle:NaN" period and break every quota write for the user.
  const anchorMs = Number.isFinite(parsedAnchorMs) && parsedAnchorMs > 0
    && !Number.isNaN(new Date(parsedAnchorMs).getTime())
    ? parsedAnchorMs
    : FREE_CYCLE_FALLBACK_ANCHOR_MS;
  const now = new Date(nowMs);
  const anchor = new Date(anchorMs);

  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  let periodStartMs = buildAnchoredDate(anchor, year, month);

  if (periodStartMs > nowMs) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
    periodStartMs = buildAnchoredDate(anchor, year, month);
  }

  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear += 1;
  }
  const periodEndMs = buildAnchoredDate(anchor, nextYear, nextMonth);

  return {
    period: `cycle:${periodStartMs}:${periodEndMs}`,
    periodStartMs,
    periodEndMs,
  };
};

const getSubscriptionPeriod = (subscriptionData: any, fallbackAnchor: unknown) => {
  const firstItem = subscriptionData?.items?.data?.[0] || subscriptionData?.items?.[0] || {};
  const periodStartMs = toMillis(
    subscriptionData?.current_period_start || subscriptionData?.currentPeriodStart || firstItem?.current_period_start,
  );
  const periodEndMs = toMillis(
    subscriptionData?.current_period_end || subscriptionData?.currentPeriodEnd || firstItem?.current_period_end,
  );

  if (periodStartMs > 0 && periodEndMs > periodStartMs) {
    return {
      period: `billing:${periodStartMs}:${periodEndMs}`,
      periodStartMs,
      periodEndMs,
    };
  }

  return getAnchoredMonthlyPeriod(
    subscriptionData?.billing_cycle_anchor || subscriptionData?.billingCycleAnchor || fallbackAnchor,
  );
};

// The allow-list is only honoured for the Firebase Auth record's own email,
// and only once that email is trusted (verified, or a pre-cutoff account).
// Users-doc email/username fields are never consulted.
//  - 'token': callers with an ID token pass its email + email_verified claim.
//    A token email outside the list short-circuits without any Auth call.
//  - 'authRecord': background callers without a token (triggers, crons,
//    another user's context) resolve the email from the Auth record itself.
export type PremiumEmailSource = 'token' | 'authRecord';

const hasTrustedPremiumEmail = async ({
  uid,
  userEmail,
  emailVerified,
  emailSource,
  loadAuthUser,
}: {
  uid: string;
  userEmail?: string;
  emailVerified?: boolean;
  emailSource: PremiumEmailSource;
  loadAuthUser: AuthUserLoader;
}): Promise<boolean> => {
  if (emailSource === 'authRecord') {
    const authUser = await loadAuthUser(uid);
    const authEmail = normalizeEmail(authUser?.email);
    return Boolean(authEmail) && PREMIUM_EMAILS.includes(authEmail) && isAuthEmailTrusted(authUser);
  }

  const tokenEmail = normalizeEmail(userEmail);
  if (!tokenEmail || !PREMIUM_EMAILS.includes(tokenEmail)) return false;
  if (emailVerified === true) return true;

  const authUser = await loadAuthUser(uid);
  if (!authUser) return false;
  return normalizeEmail(authUser.email) === tokenEmail && isAuthEmailTrusted(authUser);
};

const resolveBypassTier = async ({
  uid,
  role,
  ...emailOptions
}: {
  uid: string;
  role: SubscriptionRole;
  userEmail?: string;
  emailVerified?: boolean;
  emailSource: PremiumEmailSource;
  loadAuthUser: AuthUserLoader;
}): Promise<SubscriptionTier | null> => {
  if (uid === 'MASTER_GOD_EUKEN') return 'PREMIUM';
  if (await hasTrustedPremiumEmail({ uid, ...emailOptions })) {
    return role === 'coach' ? 'PREMIUM' : 'PREMIUM_ATHLETE';
  }
  if (process.env.FUNCTIONS_EMULATOR !== 'true' || !uid.startsWith('test-')) return null;
  if (uid.includes('premium')) return role === 'coach' ? 'PREMIUM' : 'PREMIUM_ATHLETE';
  if (uid.includes('coach')) return 'PRO_COACH';
  if (uid.includes('pro')) return 'PRO_ATHLETE';
  return 'FREE';
};

const isTierCompatibleWithRole = (tier: string, role: SubscriptionRole) => {
  if (role === 'coach') return tier === 'PRO_COACH' || tier === 'PREMIUM';
  return tier === 'PRO_ATHLETE' || tier === 'PREMIUM_ATHLETE';
};

export const resolveSubscriptionContext = async ({
  db,
  uid,
  userEmail,
  emailVerified,
  emailSource = 'token',
  loadAuthUser = defaultLoadAuthUser,
  transaction,
}: {
  db: any;
  uid: string;
  userEmail?: string;
  emailVerified?: boolean;
  emailSource?: PremiumEmailSource;
  loadAuthUser?: AuthUserLoader;
  transaction?: any;
}): Promise<SubscriptionContext> => {
  const userRef = db.collection('users').doc(uid);
  const userSnap = transaction ? await transaction.get(userRef) : await userRef.get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const role = normalizeRole(userData?.profile?.role);
  // Only the top-level users/{uid}.createdAt (immutable per Firestore rules);
  // profile.createdAt is client-writable and must never move the cycle.
  const freePeriod = getAnchoredMonthlyPeriod(userData?.createdAt);
  const bypassTier = await resolveBypassTier({
    uid,
    role,
    userEmail,
    emailVerified,
    emailSource,
    loadAuthUser,
  });

  if (bypassTier) {
    return { tier: bypassTier, role, ...freePeriod };
  }

  const subscriptionQuery = db.collection('customers').doc(uid).collection('subscriptions')
    .where('status', 'in', ACTIVE_SUBSCRIPTION_STATUSES);
  const subscriptionSnap = transaction
    ? await transaction.get(subscriptionQuery)
    : await subscriptionQuery.get();

  const candidates = subscriptionSnap.docs
    .map((doc: any) => {
      const data = doc.data();
      const tier = resolveTierForPrice(extractSubscriptionPriceId(data), role);
      return tier ? { doc, data, tier } : null;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => TIER_PRIORITY[b.tier as SubscriptionTier] - TIER_PRIORITY[a.tier as SubscriptionTier]);

  const active = candidates[0] as { doc: any; data: any; tier: SubscriptionTier } | undefined;
  if (!active) {
    const paidAccessTier = String(userData?.subscriptionAccessTier || '');
    const paidAccessUntilMs = toMillis(userData?.subscriptionAccessUntil);
    if (
      paidAccessUntilMs > Date.now()
      && paidAccessTier in PLAN_LIMITS
      && isTierCompatibleWithRole(paidAccessTier, role)
    ) {
      const periodStartMs = toMillis(userData?.subscriptionAccessPeriodStart)
        || getAnchoredMonthlyPeriod(userData?.createdAt).periodStartMs;
      return {
        tier: paidAccessTier as SubscriptionTier,
        role,
        period: `billing:${periodStartMs}:${paidAccessUntilMs}`,
        periodStartMs,
        periodEndMs: paidAccessUntilMs,
        cancelAtPeriodEnd: true,
      };
    }
    return { tier: 'FREE', role, ...freePeriod };
  }

  return {
    tier: active.tier,
    role,
    ...getSubscriptionPeriod(active.data, userData?.createdAt),
    subscriptionId: active.doc.id,
    cancelAtPeriodEnd: Boolean(active.data?.cancel_at_period_end || active.data?.cancelAtPeriodEnd),
  };
};

export const getPlanLimits = (tier: string): PlanLimits =>
  PLAN_LIMITS[tier as SubscriptionTier] || PLAN_LIMITS.FREE;

export const resolveAllowedModelForTier = (tier: string): string =>
  getPlanLimits(tier).aiModel;

export const getExpiredGraceDeletionCount = (storedCount: number, allowedCount: number): number =>
  storedCount > allowedCount ? storedCount : 0;
