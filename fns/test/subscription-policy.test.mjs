import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PLAN_LIMITS,
  STRIPE_PRICE_IDS,
  getAnchoredMonthlyPeriod,
  getExpiredGraceDeletionCount,
  resolveAllowedModelForTier,
  resolveSubscriptionContext,
  resolveTierForPrice,
} from '../lib/subscriptionPolicy.js';

const makeSubscriptionContextDb = ({ userData, subscriptions = [] }) => ({
  collection(collectionName) {
    if (collectionName === 'users') {
      return {
        doc() {
          return {
            async get() {
              return { exists: true, data: () => userData };
            },
          };
        },
      };
    }

    if (collectionName === 'customers') {
      return {
        doc() {
          return {
            collection() {
              return {
                where() {
                  return {
                    async get() {
                      return {
                        docs: subscriptions.map((data, index) => ({
                          id: `subscription-${index}`,
                          data: () => data,
                        })),
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    }

    throw new Error(`Unexpected collection: ${collectionName}`);
  },
});

test('shared 49.99 price resolves by account role', () => {
  assert.equal(
    resolveTierForPrice(STRIPE_PRICE_IDS.PREMIUM_ATHLETE_OR_PRO_COACH, 'athlete'),
    'PREMIUM_ATHLETE',
  );
  assert.equal(
    resolveTierForPrice(STRIPE_PRICE_IDS.PREMIUM_ATHLETE_OR_PRO_COACH, 'coach'),
    'PRO_COACH',
  );
});

test('role-specific prices cannot grant the wrong role plan', () => {
  assert.equal(resolveTierForPrice(STRIPE_PRICE_IDS.PRO_ATHLETE, 'coach'), null);
  assert.equal(resolveTierForPrice(STRIPE_PRICE_IDS.PREMIUM_COACH, 'athlete'), null);
});

test('PDF marketing limits match the authoritative policy', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(PLAN_LIMITS).map(([tier, limits]) => [
      tier,
      [limits.monthlyPdfUploads, limits.storedPdfs],
    ])),
    {
      FREE: [2, 2],
      PRO_ATHLETE: [10, 10],
      PREMIUM_ATHLETE: [30, 30],
      PRO_COACH: [50, 50],
      PREMIUM: [150, 150],
    },
  );
});

test('AI quality increases from Free to Pro to Premium', () => {
  assert.equal(resolveAllowedModelForTier('FREE'), 'gemini-3.5-flash-lite');
  assert.equal(resolveAllowedModelForTier('PRO_ATHLETE'), 'gemini-3.6-flash');
  assert.equal(resolveAllowedModelForTier('PRO_COACH'), 'gemini-3.6-flash');
  assert.equal(resolveAllowedModelForTier('PREMIUM_ATHLETE'), 'gemini-3.5-flash');
  assert.equal(resolveAllowedModelForTier('PREMIUM'), 'gemini-3.5-flash');
});

test('free monthly cycle follows the account anniversary, including short months', () => {
  const cycle = getAnchoredMonthlyPeriod(
    '2026-01-31T10:00:00.000Z',
    '2026-02-28T12:00:00.000Z',
  );

  assert.equal(new Date(cycle.periodStartMs).toISOString(), '2026-02-28T10:00:00.000Z');
  assert.equal(new Date(cycle.periodEndMs).toISOString(), '2026-03-31T10:00:00.000Z');
});

test('expired grace deletes the whole exceeded category, not only the excess', () => {
  assert.equal(getExpiredGraceDeletionCount(10, 3), 10);
  assert.equal(getExpiredGraceDeletionCount(3, 3), 0);
  assert.equal(getExpiredGraceDeletionCount(2, 3), 0);
});

test('cancelled paid access is retained until its stored billing-period end', async () => {
  const accessUntil = Date.parse('2099-05-20T10:00:00.000Z');
  const context = await resolveSubscriptionContext({
    db: makeSubscriptionContextDb({
      userData: {
        createdAt: '2026-01-10T10:00:00.000Z',
        profile: { role: 'athlete' },
        subscriptionAccessTier: 'PRO_ATHLETE',
        subscriptionAccessPeriodStart: new Date('2099-04-20T10:00:00.000Z'),
        subscriptionAccessUntil: new Date(accessUntil),
      },
    }),
    uid: 'normal-user',
  });

  assert.equal(context.tier, 'PRO_ATHLETE');
  assert.equal(context.periodEndMs, accessUntil);
  assert.equal(context.cancelAtPeriodEnd, true);
});

test('expired paid-access fallback resolves to Free', async () => {
  const context = await resolveSubscriptionContext({
    db: makeSubscriptionContextDb({
      userData: {
        createdAt: '2026-01-10T10:00:00.000Z',
        profile: { role: 'athlete' },
        subscriptionAccessTier: 'PRO_ATHLETE',
        subscriptionAccessUntil: new Date('2000-01-01T00:00:00.000Z'),
      },
    }),
    uid: 'normal-user',
  });

  assert.equal(context.tier, 'FREE');
});

test('allowlisted premium email is resolved only by the backend policy', async () => {
  const db = makeSubscriptionContextDb({
    userData: {
      createdAt: '2026-01-10T10:00:00.000Z',
      email: 'alejandrosanchez@gmail.com',
      profile: { role: 'athlete' },
    },
  });
  const context = await resolveSubscriptionContext({
    db,
    uid: 'normal-user',
    userEmail: 'alejandrosanchez@gmail.com',
  });

  assert.equal(context.tier, 'PREMIUM_ATHLETE');
});
