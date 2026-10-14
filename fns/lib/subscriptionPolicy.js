export const STRIPE_PRICE_IDS = {
    PRO_ATHLETE: 'price_1Shp2GRpDniZdTBe8jaP3rKT',
    PREMIUM_ATHLETE_OR_PRO_COACH: 'price_1Shp77RpDniZdTBeN9KYx4oM',
    PREMIUM_COACH: 'price_1Sj8emRpDniZdTBeCxkGvGnO',
};
export const PLAN_LIMITS = {
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
const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'];
const TIER_PRIORITY = {
    FREE: 0,
    PRO_ATHLETE: 1,
    PRO_COACH: 1,
    PREMIUM_ATHLETE: 2,
    PREMIUM: 2,
};
const normalizeRole = (value) => value === 'coach' || value === 'admin' ? 'coach' : 'athlete';
export const resolveTierForPrice = (priceId, role) => {
    if (!priceId)
        return null;
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
export const extractSubscriptionPriceId = (subscriptionData) => {
    if (subscriptionData?.items?.data?.[0]?.price?.id)
        return subscriptionData.items.data[0].price.id;
    if (subscriptionData?.items?.[0]?.price?.id)
        return subscriptionData.items[0].price.id;
    if (subscriptionData?.price?.id)
        return subscriptionData.price.id;
    return undefined;
};
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
        return value < 1_000_000_000_000 ? value * 1000 : value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
};
const daysInUtcMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
const buildAnchoredDate = (anchor, year, month) => {
    const day = Math.min(anchor.getUTCDate(), daysInUtcMonth(year, month));
    return Date.UTC(year, month, day, anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds());
};
export const getAnchoredMonthlyPeriod = (anchorValue, nowValue = Date.now()) => {
    const nowMs = toMillis(nowValue) || Date.now();
    const anchorMs = toMillis(anchorValue) || nowMs;
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
const getSubscriptionPeriod = (subscriptionData, fallbackAnchor) => {
    const firstItem = subscriptionData?.items?.data?.[0] || subscriptionData?.items?.[0] || {};
    const periodStartMs = toMillis(subscriptionData?.current_period_start || subscriptionData?.currentPeriodStart || firstItem?.current_period_start);
    const periodEndMs = toMillis(subscriptionData?.current_period_end || subscriptionData?.currentPeriodEnd || firstItem?.current_period_end);
    if (periodStartMs > 0 && periodEndMs > periodStartMs) {
        return {
            period: `billing:${periodStartMs}:${periodEndMs}`,
            periodStartMs,
            periodEndMs,
        };
    }
    return getAnchoredMonthlyPeriod(subscriptionData?.billing_cycle_anchor || subscriptionData?.billingCycleAnchor || fallbackAnchor);
};
const resolveBypassTier = (uid, email, role) => {
    if (uid === 'MASTER_GOD_EUKEN')
        return 'PREMIUM';
    if (email && PREMIUM_EMAILS.includes(email.toLowerCase())) {
        return role === 'coach' ? 'PREMIUM' : 'PREMIUM_ATHLETE';
    }
    if (!uid.startsWith('test-'))
        return null;
    if (uid.includes('premium'))
        return role === 'coach' ? 'PREMIUM' : 'PREMIUM_ATHLETE';
    if (uid.includes('coach'))
        return 'PRO_COACH';
    if (uid.includes('pro'))
        return 'PRO_ATHLETE';
    return 'FREE';
};
const isTierCompatibleWithRole = (tier, role) => {
    if (role === 'coach')
        return tier === 'PRO_COACH' || tier === 'PREMIUM';
    return tier === 'PRO_ATHLETE' || tier === 'PREMIUM_ATHLETE';
};
export const resolveSubscriptionContext = async ({ db, uid, userEmail, emailVerified, transaction, }) => {
    const userRef = db.collection('users').doc(uid);
    const userSnap = transaction ? await transaction.get(userRef) : await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const role = normalizeRole(userData?.profile?.role);
    const resolvedEmail = userEmail || userData?.email || userData?.username;
    const freePeriod = getAnchoredMonthlyPeriod(userData?.createdAt || userData?.profile?.createdAt);
    const bypassTier = resolveBypassTier(uid, resolvedEmail, role);
    if (bypassTier) {
        return { tier: bypassTier, role, ...freePeriod };
    }
    const subscriptionQuery = db.collection('customers').doc(uid).collection('subscriptions')
        .where('status', 'in', ACTIVE_SUBSCRIPTION_STATUSES);
    const subscriptionSnap = transaction
        ? await transaction.get(subscriptionQuery)
        : await subscriptionQuery.get();
    const candidates = subscriptionSnap.docs
        .map((doc) => {
        const data = doc.data();
        const tier = resolveTierForPrice(extractSubscriptionPriceId(data), role);
        return tier ? { doc, data, tier } : null;
    })
        .filter(Boolean)
        .sort((a, b) => TIER_PRIORITY[b.tier] - TIER_PRIORITY[a.tier]);
    const active = candidates[0];
    if (!active) {
        const paidAccessTier = String(userData?.subscriptionAccessTier || '');
        const paidAccessUntilMs = toMillis(userData?.subscriptionAccessUntil);
        if (paidAccessUntilMs > Date.now()
            && paidAccessTier in PLAN_LIMITS
            && isTierCompatibleWithRole(paidAccessTier, role)) {
            const periodStartMs = toMillis(userData?.subscriptionAccessPeriodStart)
                || getAnchoredMonthlyPeriod(userData?.createdAt).periodStartMs;
            return {
                tier: paidAccessTier,
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
export const getPlanLimits = (tier) => PLAN_LIMITS[tier] || PLAN_LIMITS.FREE;
export const resolveAllowedModelForTier = (tier) => getPlanLimits(tier).aiModel;
export const getExpiredGraceDeletionCount = (storedCount, allowedCount) => storedCount > allowedCount ? storedCount : 0;
