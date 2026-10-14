import { STRIPE_PRICE_IDS } from './subscriptionPolicy.js';
export const MARKETING_FREE_MONTHS = 1;
export const MARKETING_TRIAL_OFFER_ID = 'coachai_pro_marketing_trial_30d';
export const MARKETING_TRIAL_OFFER_VERSION = '2026-08-04-v2';
export const MARKETING_CONSENT_VERSION = '2026-08-04-v1';
export const MARKETING_FREE_MONTH_PROMOTION_CODE_ID = 'promo_1U0mypRpDniZdTBe3mmbMW2q';
export const isTestModeStripeCustomerLink = (value) => (typeof value === 'string'
    && /^https:\/\/dashboard\.stripe\.com\/test\/customers\/cus_[A-Za-z0-9]+$/.test(value));
export const hasCurrentMarketingTrialDismissal = (userData) => (Boolean(userData?.marketingTrialOfferDismissedAt)
    && userData?.marketingTrialOfferDismissedVersion === MARKETING_TRIAL_OFFER_VERSION);
const MARKETING_TRIAL_PLANS = {
    athlete: {
        role: 'athlete',
        priceId: STRIPE_PRICE_IDS.PRO_ATHLETE,
        monthlyAmountCents: 1_999,
        monthlyPriceLabel: '19,99 €',
        planName: 'Athlete Pro',
    },
    coach: {
        role: 'coach',
        priceId: STRIPE_PRICE_IDS.PREMIUM_ATHLETE_OR_PRO_COACH,
        monthlyAmountCents: 4_999,
        monthlyPriceLabel: '49,99 €',
        planName: 'Coach Pro',
    },
};
export const normalizeMarketingTrialRole = (value) => value === 'coach' || value === 'admin' ? 'coach' : 'athlete';
export const getMarketingTrialPlan = (role) => MARKETING_TRIAL_PLANS[normalizeMarketingTrialRole(role)];
export const isAdultProfile = (profile) => {
    const age = Number(profile?.age);
    return Number.isFinite(age) && age >= 18;
};
export const isAllowedCheckoutReturnUrl = (value) => {
    if (typeof value !== 'string' || value.length > 2_000)
        return false;
    try {
        const url = new URL(value);
        const isProductionHost = url.protocol === 'https:' && (url.hostname === 'coachai.es'
            || url.hostname === 'www.coachai.es'
            || url.hostname === 'entrenamientos-bfac2.web.app');
        const isLocalHost = url.protocol === 'http:' && (url.hostname === 'localhost'
            || url.hostname === '127.0.0.1');
        return isProductionHost || isLocalHost;
    }
    catch {
        return false;
    }
};
export const hasMarketingTrialMetadata = (metadata) => {
    if (!metadata || typeof metadata !== 'object')
        return false;
    return metadata.coachai_offer === MARKETING_TRIAL_OFFER_ID;
};
