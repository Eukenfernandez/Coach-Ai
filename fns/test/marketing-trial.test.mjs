import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MARKETING_FREE_MONTHS,
  MARKETING_TRIAL_OFFER_ID,
  MARKETING_TRIAL_OFFER_VERSION,
  getMarketingTrialPlan,
  hasCurrentMarketingTrialDismissal,
  hasMarketingTrialMetadata,
  isAdultProfile,
  isAllowedCheckoutReturnUrl,
  isTestModeStripeCustomerLink,
} from '../lib/marketingTrial.js';

test('assigns the role-specific Pro plan and one free billing month', () => {
  assert.equal(MARKETING_FREE_MONTHS, 1);
  assert.equal(getMarketingTrialPlan('athlete').monthlyAmountCents, 1_999);
  assert.equal(getMarketingTrialPlan('coach').monthlyAmountCents, 4_999);
  assert.notEqual(getMarketingTrialPlan('athlete').priceId, getMarketingTrialPlan('coach').priceId);
});

test('accepts only CoachAI production URLs and local development URLs', () => {
  assert.equal(isAllowedCheckoutReturnUrl('https://coachai.es/?payment=success'), true);
  assert.equal(isAllowedCheckoutReturnUrl('https://www.coachai.es/path'), true);
  assert.equal(isAllowedCheckoutReturnUrl('https://entrenamientos-bfac2.web.app/checkout_redirect/index.html'), true);
  assert.equal(isAllowedCheckoutReturnUrl('http://127.0.0.1:5173/?payment=cancel'), true);
  assert.equal(isAllowedCheckoutReturnUrl('https://coachai.es.attacker.example/'), false);
  assert.equal(isAllowedCheckoutReturnUrl('javascript:alert(1)'), false);
});

test('limits automatic-renewal trials to adult profiles', () => {
  assert.equal(isAdultProfile({ age: 18 }), true);
  assert.equal(isAdultProfile({ age: '27' }), true);
  assert.equal(isAdultProfile({ age: 17 }), false);
  assert.equal(isAdultProfile({}), false);
});

test('recognizes only Stripe Dashboard test-customer mappings', () => {
  assert.equal(isTestModeStripeCustomerLink('https://dashboard.stripe.com/test/customers/cus_TexByJayz1ECJ5'), true);
  assert.equal(isTestModeStripeCustomerLink('https://dashboard.stripe.com/customers/cus_live123'), false);
  assert.equal(isTestModeStripeCustomerLink('https://attacker.example/test/customers/cus_fake'), false);
});

test('only a dismissal from the current offer version hides the modal', () => {
  assert.equal(hasCurrentMarketingTrialDismissal({
    marketingTrialOfferDismissedAt: '2026-08-04T12:00:00Z',
    marketingTrialOfferDismissedVersion: MARKETING_TRIAL_OFFER_VERSION,
  }), true);
  assert.equal(hasCurrentMarketingTrialDismissal({
    marketingTrialOfferDismissedAt: '2026-08-04T12:00:00Z',
  }), false);
});

test('recognizes only the server-defined marketing trial metadata', () => {
  assert.equal(hasMarketingTrialMetadata({ coachai_offer: MARKETING_TRIAL_OFFER_ID }), true);
  assert.equal(hasMarketingTrialMetadata({ coachai_offer: 'another_offer' }), false);
  assert.equal(hasMarketingTrialMetadata(null), false);
});
