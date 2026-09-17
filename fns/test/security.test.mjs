import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import {
  registerVideoInGallery,
  registerPdfInGallery,
  onVideoCreatedFallback,
  onPdfCreatedFallback,
  onVideoDeletion,
  enforcementCronJob,
  onSubscriptionChange,
} from "../lib/index.js";

// All persistence/Auth operations are replaced in memory; no emulator or credentials needed.
const db = getFirestore();
const auth = getAuth();
const originals = {
  collection: db.collection,
  collectionGroup: db.collectionGroup,
  runTransaction: db.runTransaction,
  batch: db.batch,
  getUser: auth.getUser,
  deleteUser: auth.deleteUser,
};
afterEach(() => {
  for (const key of ["collection", "collectionGroup", "runTransaction", "batch"]) db[key] = originals[key];
  auth.getUser = originals.getUser;
  auth.deleteUser = originals.deleteUser;
});
function fixture(initial = {}) {
  const data = new Map(Object.entries(initial));
  const deleted = [];
  const writes = [];
  const snap = (path) => ({
    id: path.split("/").at(-1),
    ref: ref(path),
    exists: data.has(path),
    data: () => data.get(path),
  });
  const ref = (path) => ({
    path,
    id: path.split("/").at(-1),
    get: async () => snap(path),
    collection: (name) => collection(`${path}/${name}`),
    set: async (value, options) => {
      writes.push({ path, value });
      data.set(path, options?.merge ? { ...data.get(path), ...value } : value);
    },
    update: async (value) => {
      writes.push({ path, value });
      data.set(path, { ...data.get(path), ...value });
    },
    delete: async () => data.delete(path),
  });
  const query = (matches, filters = []) => ({
    where: (key, op, value) => query(matches, [...filters, [key, op, value]]),
    limit: () => query(matches, filters),
    get: async () => {
      const docs = [...data.keys()]
        .filter(matches)
        .filter((path) =>
          filters.every(([key, op, value]) => {
            const actual = data.get(path)[key];
            return op === "==" ? actual === value : op === "in" ? value.includes(actual) : actual < value;
          }),
        )
        .map(snap);
      return { docs, size: docs.length };
    },
  });
  const collection = (path) => ({
    ...query((key) => key.startsWith(`${path}/`) && key.split("/").length === path.split("/").length + 1),
    doc: (id) => ref(`${path}/${id}`),
    add: async (value) => ref(`${path}/notification`).set(value),
  });
  db.collection = collection;
  db.collectionGroup = (name) => query((path) => path.split("/").at(-2) === name);
  db.runTransaction = async (fn) =>
    fn({ get: async (r) => r.get(), set: (r, v, o) => r.set(v, o), update: (r, v) => r.update(v) });
  db.batch = () => ({ update: (r, v) => r.update(v), commit: async () => {} });
  auth.getUser = async (uid) => ({ uid, email: "ordinary@example.com" });
  auth.deleteUser = async (uid) => {
    deleted.push(uid);
  };
  return { data, deleted, writes, snap };
}
const accepted = { coachId: "coach", athleteId: "athlete", status: "accepted" };

for (const [kind, fn, field, collection] of [
  ["video", registerVideoInGallery, "videoData", "videos"],
  ["PDF", registerPdfInGallery, "pdfData", "plans"],
]) {
  test(`${kind} callable overwrites forged payer with authenticated UID`, async () => {
    const f = fixture({ "requests/coach_athlete": accepted });
    await fn.run({
      auth: { uid: "coach", token: {} },
      data: {
        targetUserId: "athlete",
        [field]: {
          id: "asset",
          uploadedByCoachId: "victim",
          quotaPayerId: "victim",
          quotaCounted: false,
        },
      },
    });
    assert.equal(f.data.get(`userdata/athlete/${collection}/asset`).quotaPayerId, "coach");
    assert.equal(f.data.get(`userdata/athlete/${collection}/asset`).uploadedByCoachId, "coach");
    assert.equal(f.data.has("quota_counters/victim"), false);
  });
}
for (const [fn, collection] of [
  [onVideoCreatedFallback, "videos"],
  [onPdfCreatedFallback, "plans"],
]) {
  test(`${collection} fallback uses auth context, and retries do not count twice`, async () => {
    const path = `userdata/athlete/${collection}/asset`;
    const f = fixture({ "requests/coach_athlete": accepted, [path]: { uploadedByCoachId: "victim" } });
    const event = {
      authType: "unknown",
      authId: "coach",
      params: { uid: "athlete" },
      data: { before: { exists: false }, after: f.snap(path) },
    };
    await fn.run(event);
    await fn.run(event);
    assert.equal(f.data.get(path).quotaPayerId, "coach");
    assert.equal(f.writes.filter((w) => w.path.startsWith("quota_counters/")).length, 1);
    assert.equal(f.data.has("quota_counters/victim"), false);
  });
  test(`${collection} fallback without a user auth context cannot charge anyone`, async () => {
    const path = `userdata/athlete/${collection}/asset`;
    const f = fixture({ [path]: { uploadedByCoachId: "victim" } });
    await fn.run({
      authType: "unauthenticated",
      params: { uid: "athlete" },
      data: { before: { exists: false }, after: f.snap(path) },
    });
    assert.equal(f.writes.length, 0);
  });
}
test("pending relationship cannot register videos for an athlete", async () => {
  fixture({ "requests/coach_athlete": { ...accepted, status: "pending" } });
  await assert.rejects(
    registerVideoInGallery.run({
      auth: { uid: "coach", token: {} },
      data: { targetUserId: "athlete", videoData: { id: "asset" } },
    }),
    { code: "permission-denied" },
  );
});
test("legacy editable uploader is not trusted on deletion", async () => {
  const f = fixture({ "userdata/athlete/videos/asset": { uploadedByCoachId: "victim", quotaCounted: true } });
  await onVideoDeletion.run({
    params: { uid: "athlete" },
    data: {
      before: f.snap("userdata/athlete/videos/asset"),
      after: { exists: false },
    },
  });
  assert.equal(f.writes.length, 0);
});
for (const [label, userId, videoCount, deadline, expected] of [
  ["forged target", "victim", 4, 0, []],
  ["inflated old counter", "owner", 0, 0, []],
  ["unexpired deadline", "owner", 4, Date.now() + 86400000, []],
  ["verified overdue excess", "owner", 4, 0, ["owner"]],
]) {
  test(`account deletion: ${label}`, async () => {
    const initial = {
      "account_enforcement/owner": {
        userId,
        status: "PENDING_ACCOUNT_DELETION",
        gracePeriodEndsAt: Timestamp.fromMillis(deadline),
      },
      "quota_counters/owner": { videosGlobal: 100 },
    };
    for (let i = 0; i < videoCount; i++)
      initial[`userdata/athlete/videos/v${i}`] = { quotaPayerId: "owner", quotaCounted: true };
    const f = fixture(initial);
    await enforcementCronJob.run({});
    assert.deepEqual(f.deleted, expected);
  });
}
test("Stripe subscription change writes canonical plan on backend", async () => {
  const f = fixture({
    "customers/owner/subscriptions/sub": {
      status: "active",
      price: { id: "price_1Sj8emRpDniZdTBeCxkGvGnO" },
    },
  });
  await onSubscriptionChange.run({ params: { uid: "owner" } });
  assert.equal(f.data.get("users/owner").currentPlanId, "PREMIUM");
  f.data.get("customers/owner/subscriptions/sub").status = "canceled";
  await onSubscriptionChange.run({ params: { uid: "owner" } });
  assert.equal(f.data.get("users/owner").currentPlanId, "FREE");
});
