import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMAIL_TRUST_CUTOFF_MS,
  FREE_CYCLE_FALLBACK_ANCHOR_MS,
  PLAN_LIMITS,
  STRIPE_PRICE_IDS,
  createAuthUserLoader,
  getAnchoredMonthlyPeriod,
  isAuthEmailTrusted,
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

const failingLoader = async () => {
  throw new Error('loadAuthUser must not be called on this path');
};

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
    emailVerified: true,
    loadAuthUser: failingLoader,
  });

  assert.equal(context.tier, 'PREMIUM_ATHLETE');
});

test('users-doc email or username never grants the allow-list bypass', async () => {
  let loaderCalls = 0;
  const context = await resolveSubscriptionContext({
    db: makeSubscriptionContextDb({
      userData: {
        createdAt: '2026-01-10T10:00:00.000Z',
        email: 'alejandrosanchez@gmail.com',
        username: 'alejandrosanchez@gmail.com',
        profile: { role: 'athlete' },
      },
    }),
    uid: 'normal-user',
    userEmail: 'someone-else@example.com',
    loadAuthUser: async () => {
      loaderCalls += 1;
      return null;
    },
  });

  assert.equal(context.tier, 'FREE');
  assert.equal(loaderCalls, 0);
});

test('unverified allow-listed email on a post-cutoff account is not premium', async () => {
  const context = await resolveSubscriptionContext({
    db: makeSubscriptionContextDb({
      userData: { createdAt: '2026-10-20T10:00:00.000Z', profile: { role: 'athlete' } },
    }),
    uid: 'squatter',
    userEmail: 'alejandrosanchez@gmail.com',
    emailVerified: false,
    loadAuthUser: async () => ({
      uid: 'squatter',
      email: 'alejandrosanchez@gmail.com',
      emailVerified: false,
      metadata: { creationTime: 'Tue, 20 Oct 2026 10:00:00 GMT' },
    }),
  });

  assert.equal(context.tier, 'FREE');
});

test('unverified allow-listed email on a pre-cutoff account stays premium', async () => {
  const context = await resolveSubscriptionContext({
    db: makeSubscriptionContextDb({
      userData: { createdAt: '2025-03-01T10:00:00.000Z', profile: { role: 'coach' } },
    }),
    uid: 'legacy-owner',
    userEmail: 'alejandrosanchez@gmail.com',
    emailVerified: false,
    loadAuthUser: async () => ({
      uid: 'legacy-owner',
      email: 'AlejandroSanchez@gmail.com',
      emailVerified: false,
      metadata: { creationTime: 'Sat, 01 Mar 2025 10:00:00 GMT' },
    }),
  });

  assert.equal(context.tier, 'PREMIUM');
});

test('allow-listed token email must match the Auth record email', async () => {
  const context = await resolveSubscriptionContext({
    db: makeSubscriptionContextDb({
      userData: { createdAt: '2025-03-01T10:00:00.000Z', profile: { role: 'athlete' } },
    }),
    uid: 'legacy-owner',
    userEmail: 'alejandrosanchez@gmail.com',
    emailVerified: false,
    loadAuthUser: async () => ({
      email: 'other@example.com',
      emailVerified: true,
      metadata: { creationTime: 'Sat, 01 Mar 2025 10:00:00 GMT' },
    }),
  });

  assert.equal(context.tier, 'FREE');
});

test('background resolution reads the trusted Auth record email', async () => {
  const db = makeSubscriptionContextDb({
    userData: {
      createdAt: '2026-01-10T10:00:00.000Z',
      email: 'not-listed@example.com',
      profile: { role: 'athlete' },
    },
  });
  const verified = await resolveSubscriptionContext({
    db,
    uid: 'owner',
    emailSource: 'authRecord',
    loadAuthUser: async () => ({
      email: 'peioetxabe@hotmail.com',
      emailVerified: true,
      metadata: { creationTime: 'Tue, 20 Oct 2026 10:00:00 GMT' },
    }),
  });
  const unverified = await resolveSubscriptionContext({
    db,
    uid: 'owner',
    emailSource: 'authRecord',
    loadAuthUser: async () => ({
      email: 'peioetxabe@hotmail.com',
      emailVerified: false,
      metadata: { creationTime: 'Tue, 20 Oct 2026 10:00:00 GMT' },
    }),
  });

  assert.equal(verified.tier, 'PREMIUM_ATHLETE');
  assert.equal(unverified.tier, 'FREE');
});

test('transient Auth loader errors propagate instead of resolving Free', async () => {
  const transient = Object.assign(new Error('backend unavailable'), { code: 'auth/internal-error' });
  await assert.rejects(
    resolveSubscriptionContext({
      db: makeSubscriptionContextDb({
        userData: { createdAt: '2026-01-10T10:00:00.000Z', profile: { role: 'athlete' } },
      }),
      uid: 'owner',
      userEmail: 'alejandrosanchez@gmail.com',
      emailVerified: false,
      loadAuthUser: async () => {
        throw transient;
      },
    }),
    (error) => error === transient,
  );

  const loader = createAuthUserLoader(async () => {
    throw transient;
  });
  await assert.rejects(loader('owner'), (error) => error === transient);
});

test('Auth loader resolves null only for a missing account', async () => {
  const loader = createAuthUserLoader(async () => {
    throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' });
  });
  assert.equal(await loader('missing-user'), null);
});

test('email trust requires verification after the cutoff', () => {
  assert.equal(isAuthEmailTrusted({ emailVerified: true }), true);
  assert.equal(isAuthEmailTrusted({
    emailVerified: false,
    metadata: { creationTime: new Date(EMAIL_TRUST_CUTOFF_MS - 1).toUTCString() },
  }), true);
  assert.equal(isAuthEmailTrusted({
    emailVerified: false,
    metadata: { creationTime: new Date(EMAIL_TRUST_CUTOFF_MS).toUTCString() },
  }), false);
  assert.equal(isAuthEmailTrusted({ emailVerified: false }), false);
  assert.equal(isAuthEmailTrusted(null), false);
});

test('test- uids are not bypassed outside the Functions emulator', async () => {
  const previous = process.env.FUNCTIONS_EMULATOR;
  const db = makeSubscriptionContextDb({
    userData: { createdAt: '2026-01-10T10:00:00.000Z', profile: { role: 'athlete' } },
  });
  try {
    delete process.env.FUNCTIONS_EMULATOR;
    const production = await resolveSubscriptionContext({ db, uid: 'test-premium-user' });
    assert.equal(production.tier, 'FREE');

    process.env.FUNCTIONS_EMULATOR = 'true';
    const emulator = await resolveSubscriptionContext({ db, uid: 'test-premium-user' });
    assert.equal(emulator.tier, 'PREMIUM_ATHLETE');
  } finally {
    if (previous === undefined) delete process.env.FUNCTIONS_EMULATOR;
    else process.env.FUNCTIONS_EMULATOR = previous;
  }
});

test('free cycle without createdAt uses the fixed anchor instead of now', async () => {
  const first = getAnchoredMonthlyPeriod(undefined, '2026-10-14T12:00:00.000Z');
  const later = getAnchoredMonthlyPeriod('not-a-date', '2026-10-20T08:00:00.000Z');

  assert.equal(new Date(first.periodStartMs).toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(new Date(first.periodEndMs).toISOString(), '2026-11-01T00:00:00.000Z');
  assert.equal(first.period, later.period);
  assert.equal(new Date(FREE_CYCLE_FALLBACK_ANCHOR_MS).toISOString(), '2026-01-01T00:00:00.000Z');
});

test('free cycle ignores the client-writable profile.createdAt', async () => {
  const resolveWith = (profileCreatedAt) => resolveSubscriptionContext({
    db: makeSubscriptionContextDb({
      userData: { profile: { role: 'athlete', createdAt: profileCreatedAt } },
    }),
    uid: 'normal-user',
  });
  const first = await resolveWith('2026-01-05T10:00:00.000Z');
  const second = await resolveWith('2026-01-20T18:30:00.000Z');

  assert.equal(first.tier, 'FREE');
  assert.equal(first.period, second.period);
  assert.equal(new Date(first.periodStartMs).getUTCDate(), 1);
});
