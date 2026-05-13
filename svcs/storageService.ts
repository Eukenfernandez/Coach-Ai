
import { User, UserData, VideoFile, StrengthRecord, ThrowRecord, PlanFile, UserProfile, ExerciseDef, CoachRequest, UserUsage, SupplementItem, Language } from '../types';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import 'firebase/compat/functions'; // Required to call Cloud Functions

export type FirestoreDataSource = 'memory' | 'local' | 'server' | 'cache';

export type UserDataLoadInfo = {
  source: FirestoreDataSource;
  stale: boolean;
  durationMs: number;
  fetchedAt: number;
  error?: string;
};

export type PendingRequestsResult = {
  requests: CoachRequest[];
  source: FirestoreDataSource;
  stale: boolean;
  error?: string;
};

const firebaseConfig = {
  apiKey: "AIzaSyAiSaQ_H7Ja3rLg2IPm_7k6lZL_XmWaPX4",
  authDomain: "entrenamientos-bfac2.firebaseapp.com",
  projectId: "entrenamientos-bfac2",
  storageBucket: "entrenamientos-bfac2.firebasestorage.app",
  messagingSenderId: "708498062460",
  appId: "1:708498062460:web:83cb6635febcd927d75df9"
};

export let auth: firebase.auth.Auth;
export let db: firebase.firestore.Firestore;
export let storage: firebase.storage.Storage;
let isFirebaseConfigured = false;
let firebaseNetworkListenersBound = false;
let firestoreNetworkEnabled = true;

const DEV_FIRESTORE_LOGS = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);
const USERDATA_CACHE_TTL_MS = 30000;
const PENDING_REQUESTS_CACHE_TTL_MS = 15000;

const isBrowserOnline = () => typeof navigator === 'undefined' ? true : navigator.onLine;

const getUtcMonthKeyFromDate = (date = new Date()) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

const getUtcMonthKeyFromValue = (value: unknown): string | null => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return getUtcMonthKeyFromDate(parsed);
};

const isLegacyUsageInPeriod = (legacyUsage: any, period?: string | null) => {
  // Older deployed quota functions did not return a monthly period. In that
  // case, the legacy cloud usage counter is the best available upload counter
  // until the new server-side monthly quota functions are deployed.
  if (!period) return true;
  const explicitPeriod = legacyUsage?.period || legacyUsage?.monthKey || legacyUsage?.monthlyPeriod;
  if (explicitPeriod) return String(explicitPeriod) === period;
  const resetPeriod = getUtcMonthKeyFromValue(legacyUsage?.lastAnalysisReset || legacyUsage?.lastChatReset);
  return resetPeriod === period;
};

const waitForAuthReady = (timeoutMs = 3000): Promise<firebase.User | null> => {
  if (!auth) return Promise.resolve(null);
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe: firebase.Unsubscribe | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const finish = (user: firebase.User | null) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe?.();
      resolve(user);
    };

    unsubscribe = auth.onAuthStateChanged((user) => finish(user));
    timeoutId = setTimeout(() => finish(auth.currentUser), timeoutMs);
  });
};

const firestoreOperationCounts = new Map<string, number>();
const userDataInFlight = new Map<string, Promise<UserData>>();
const pendingRequestsInFlight = new Map<string, Promise<PendingRequestsResult>>();
const lastUserDataLoadInfoByUser = new Map<string, UserDataLoadInfo>();
const pendingRequestsMemoryCache = new Map<string, PendingRequestsResult & { fetchedAt: number }>();
const queuedCloudSectionWrites = new Map<string, { userId: string; section: keyof UserData; value: any }>();
const activeCloudSectionWrites = new Map<string, Promise<boolean>>();

const logFirestoreDebug = (event: string, payload?: Record<string, unknown>) => {
  if (!DEV_FIRESTORE_LOGS) return;
  console.debug(`[Firestore] ${event}`, payload || {});
};

const startFirestoreTrace = (label: string, payload?: Record<string, unknown>) => {
  const count = (firestoreOperationCounts.get(label) || 0) + 1;
  firestoreOperationCounts.set(label, count);
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  logFirestoreDebug(`${label}:start`, { count, ...payload });

  return (extra?: Record<string, unknown>) => {
    const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const durationMs = Math.round((finishedAt - startedAt) * 100) / 100;
    logFirestoreDebug(`${label}:done`, { count, durationMs, ...payload, ...extra });
    return durationMs;
  };
};

const getErrorCode = (error: unknown) =>
  typeof (error as any)?.code === 'string' ? String((error as any).code) : 'unknown';

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  try {
    return typeof error === 'string' ? error : JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const isTransientFirestoreNetworkError = (error: unknown) => {
  const code = getErrorCode(error).toLowerCase();
  const message = getErrorMessage(error).toLowerCase();

  return [
    'unavailable',
    'deadline-exceeded',
    'aborted',
    'cancelled',
    'failed-precondition',
  ].some((fragment) => code.includes(fragment)) || [
    'offline',
    'network',
    'connection reset',
    'err_connection_reset',
    'err_name_not_resolved',
    'dns',
    'transport errored',
    'client is offline',
    'backend didn',
  ].some((fragment) => message.includes(fragment));
};

const readDocumentWithCacheFallback = async (
  ref: firebase.firestore.DocumentReference,
  label: string,
  payload?: Record<string, unknown>,
): Promise<{ snapshot: firebase.firestore.DocumentSnapshot | null; source: FirestoreDataSource; stale: boolean }> => {
  const finish = startFirestoreTrace(label, payload);

  if (!isBrowserOnline()) {
    try {
      const snapshot = await ref.get({ source: 'cache' as any });
      finish({ source: 'cache', stale: true, exists: snapshot.exists });
      return { snapshot, source: 'cache', stale: true };
    } catch (cacheError) {
      finish({ source: 'local', stale: true, error: getErrorMessage(cacheError) });
      return { snapshot: null, source: 'local', stale: true };
    }
  }

  try {
    const snapshot = await ref.get({ source: 'server' as any });
    finish({ source: 'server', stale: false, exists: snapshot.exists });
    return { snapshot, source: 'server', stale: false };
  } catch (serverError) {
    if (!isTransientFirestoreNetworkError(serverError)) {
      finish({ source: 'server', stale: false, error: getErrorMessage(serverError) });
      throw serverError;
    }

    try {
      const snapshot = await ref.get({ source: 'cache' as any });
      finish({
        source: 'cache',
        stale: true,
        exists: snapshot.exists,
        fallbackError: getErrorMessage(serverError),
      });
      return { snapshot, source: 'cache', stale: true };
    } catch (cacheError) {
      finish({
        source: 'local',
        stale: true,
        error: getErrorMessage(serverError),
        cacheError: getErrorMessage(cacheError),
      });
      return { snapshot: null, source: 'local', stale: true };
    }
  }
};

const readQueryWithCacheFallback = async (
  query: firebase.firestore.Query,
  label: string,
  payload?: Record<string, unknown>,
): Promise<{ snapshot: firebase.firestore.QuerySnapshot | null; source: FirestoreDataSource; stale: boolean }> => {
  const finish = startFirestoreTrace(label, payload);

  if (!isBrowserOnline()) {
    try {
      const snapshot = await query.get({ source: 'cache' as any });
      finish({ source: 'cache', stale: true, size: snapshot.size });
      return { snapshot, source: 'cache', stale: true };
    } catch (cacheError) {
      finish({ source: 'local', stale: true, error: getErrorMessage(cacheError) });
      return { snapshot: null, source: 'local', stale: true };
    }
  }

  try {
    const snapshot = await query.get({ source: 'server' as any });
    finish({ source: 'server', stale: false, size: snapshot.size });
    return { snapshot, source: 'server', stale: false };
  } catch (serverError) {
    if (!isTransientFirestoreNetworkError(serverError)) {
      finish({ source: 'server', stale: false, error: getErrorMessage(serverError) });
      throw serverError;
    }

    try {
      const snapshot = await query.get({ source: 'cache' as any });
      finish({
        source: 'cache',
        stale: true,
        size: snapshot.size,
        fallbackError: getErrorMessage(serverError),
      });
      return { snapshot, source: 'cache', stale: true };
    } catch (cacheError) {
      finish({
        source: 'local',
        stale: true,
        error: getErrorMessage(serverError),
        cacheError: getErrorMessage(cacheError),
      });
      return { snapshot: null, source: 'local', stale: true };
    }
  }
};

const queueCloudSectionWrite = async (userId: string, section: keyof UserData, value: any) => {
  const key = `${userId}:${section}`;
  queuedCloudSectionWrites.set(key, { userId, section, value });

  if (activeCloudSectionWrites.has(key)) {
    return activeCloudSectionWrites.get(key)!;
  }

  const runner = (async () => {
    while (queuedCloudSectionWrites.has(key)) {
      const next = queuedCloudSectionWrites.get(key);
      if (!next) break;
      queuedCloudSectionWrites.delete(key);

      const finish = startFirestoreTrace('updateDataSection.cloudWrite', {
        userId: next.userId,
        section: next.section,
      });

      try {
        await db.collection("userdata").doc(next.userId).set({
          [next.section]: sanitizeForFirestore(next.value)
        }, { merge: true });
        finish({
          source: 'server',
          stale: false,
          pendingWrites: queuedCloudSectionWrites.size,
        });
      } catch (error) {
        if (isTransientFirestoreNetworkError(error)) {
          queuedCloudSectionWrites.set(key, next);
          finish({
            source: 'local',
            stale: true,
            error: getErrorMessage(error),
            pendingWrites: queuedCloudSectionWrites.size,
          });
          return false;
        }

        finish({
          source: 'server',
          stale: false,
          error: getErrorMessage(error),
          pendingWrites: queuedCloudSectionWrites.size,
        });
        console.error("Firestore write error:", error);
        return false;
      }
    }
    return true;
  })().finally(() => {
    activeCloudSectionWrites.delete(key);
  });

  activeCloudSectionWrites.set(key, runner);
  return runner;
};

const flushQueuedCloudSectionWrites = async () => {
  if (!isFirebaseConfigured || !isBrowserOnline()) return;
  await Promise.all(
    Array.from(queuedCloudSectionWrites.values()).map((entry) =>
      queueCloudSectionWrite(entry.userId, entry.section, entry.value)
    )
  );
};

try {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const app = firebase.app();
  auth = app.auth();

  // COMPAT FIRESTORE INITIALIZATION
  db = app.firestore();
  try {
    db.settings({
      ignoreUndefinedProperties: true,
      experimentalAutoDetectLongPolling:
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'),
    } as any);
  } catch (settingsError) {
    console.warn("Firestore settings were already locked; reusing existing instance.", settingsError);
  }

  // Enable persistence (equivalent to persistentLocalCache + persistentMultipleTabManager)
  db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    console.warn("Persistence could not be enabled:", err);
  });

  storage = app.storage();
  isFirebaseConfigured = true;

  if (typeof window !== 'undefined' && !firebaseNetworkListenersBound) {
    firebaseNetworkListenersBound = true;

    const syncFirestoreNetwork = async () => {
      try {
        if (!navigator.onLine) {
          if (!firestoreNetworkEnabled) return;
          await db.disableNetwork();
          firestoreNetworkEnabled = false;
        } else {
          if (firestoreNetworkEnabled) return;
          await db.enableNetwork();
          firestoreNetworkEnabled = true;
          queueMicrotask(() => {
            void flushQueuedCloudSectionWrites();
          });
        }
      } catch (error) {
        logFirestoreDebug('network-sync-error', { error: getErrorMessage(error) });
      }
    };

    window.addEventListener('online', () => { void syncFirestoreNetwork(); });
    window.addEventListener('offline', () => { void syncFirestoreNetwork(); });
    void syncFirestoreNetwork();
  }
} catch (e) {
  console.error("Firebase failed to initialize:", e);
}

const USERS_KEY = 'coachai_users';
const CURRENT_USER_KEY = 'coachai_current_user';
const DATA_PREFIX = 'coachai_data_';
const REQUESTS_KEY = 'coachai_local_requests';

// ====== IN-MEMORY CACHE FOR PERFORMANCE ======
// Cache user data to avoid redundant Firestore queries
const userDataCache = new Map<string, { data: UserData, timestamp: number }>();

// Helper to get cached data
const getCachedUserData = (userId: string): UserData | null => {
  const cached = userDataCache.get(userId);
  if (cached && Date.now() - cached.timestamp < USERDATA_CACHE_TTL_MS) {
    return cached.data;
  }
  return null;
};

// Helper to set cached data
const setCachedUserData = (userId: string, data: UserData) => {
  userDataCache.set(userId, { data: { ...data }, timestamp: Date.now() });
};

// Helper to invalidate cache
const invalidateCache = (userId: string) => {
  userDataCache.delete(userId);
};

// Helper to remove blob URLs before saving to DB
const cleanDataForStorage = (data: any): any => {
  if (Array.isArray(data)) return data.map(cleanDataForStorage);
  if (data !== null && typeof data === 'object') {
    const newObj = { ...data };
    if ('url' in newObj && typeof newObj.url === 'string' && newObj.url.startsWith('blob:')) {
      newObj.url = "";
    }
    Object.keys(newObj).forEach(key => {
      newObj[key] = cleanDataForStorage(newObj[key]);
    });
    return newObj;
  }
  return data;
};

const sanitizeForFirestore = (obj: any): any => {
  if (obj === undefined || obj === null) return null;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  if (typeof obj === 'object') {
    const newObj: any = {};
    Object.keys(obj).forEach(key => {
      const val = obj[key];
      if (val !== undefined) newObj[key] = sanitizeForFirestore(val);
    });
    return newObj;
  }
  return obj;
};

const unwrapFromFirestore = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (obj && typeof obj.toDate === 'function') return obj.toDate();
  if (Array.isArray(obj)) return obj.map(unwrapFromFirestore);
  if (typeof obj === 'object') {
    const newObj: any = {};
    Object.keys(obj).forEach(key => {
      newObj[key] = unwrapFromFirestore(obj[key]);
    });
    return newObj;
  }
  return obj;
};

const SPORT_DEFAULTS: Record<string, ExerciseDef[]> = {
  gym: [{ name: 'Sentadilla', unit: 'kg' }, { name: 'Press Banca', unit: 'kg' }, { name: 'Peso Muerto', unit: 'kg' }],
  athletics: [{ name: 'Cargada', unit: 'kg' }, { name: 'Salto Vertical', unit: 'cm' }, { name: 'Lanz. Balón Med.', unit: 'm' }],
  other: [{ name: 'Sentadilla', unit: 'kg' }, { name: 'Flexiones', unit: 'rep' }]
};

const getInitialUsage = (): UserUsage => ({
  analysisCount: 0, chatCount: 0, plansCount: 0,
  lastAnalysisReset: new Date().toISOString(),
  lastChatReset: new Date().toISOString()
});

const buildDefaultUserData = (): UserData => ({
  videos: [],
  plans: [],
  strengthRecords: [],
  competitionRecords: [],
  trainingRecords: [],
  matchRecords: [],
  customExercises: [],
  supplements: [],
  usage: getInitialUsage()
});

const getLocalUserDataSnapshot = (userId: string): UserData => {
  const cached = userDataCache.get(userId)?.data;
  if (cached) {
    return { ...buildDefaultUserData(), ...cleanDataForStorage(cached) };
  }

  try {
    const raw = localStorage.getItem(`${DATA_PREFIX}${userId}`);
    return raw ? { ...buildDefaultUserData(), ...JSON.parse(raw) } : buildDefaultUserData();
  } catch {
    return buildDefaultUserData();
  }
};

const writeUserDataSectionLocally = (userId: string, section: keyof UserData, value: any) => {
  const cleanedValue = cleanDataForStorage(value);
  const data = getLocalUserDataSnapshot(userId);
  (data as any)[section] = cleanedValue;
  localStorage.setItem(`${DATA_PREFIX}${userId}`, JSON.stringify(cleanDataForStorage(data)));
  setCachedUserData(userId, data);
};

const getAssetSortTimestamp = (asset: { id?: string; uploadedAt?: any; date?: string }) => {
  const uploadedAt = unwrapFromFirestore(asset.uploadedAt);
  if (uploadedAt instanceof Date) return uploadedAt.getTime();
  if (typeof uploadedAt === 'string') {
    const parsedUploadedAt = Date.parse(uploadedAt);
    if (!Number.isNaN(parsedUploadedAt)) return parsedUploadedAt;
  }

  if (asset.date) {
    const parsedDate = Date.parse(asset.date);
    if (!Number.isNaN(parsedDate)) return parsedDate;
  }

  if (asset.id && /^\d+$/.test(asset.id)) {
    return Number(asset.id);
  }

  return 0;
};

const sortAssetsNewestFirst = <T extends { id: string; uploadedAt?: any; date?: string }>(assets: T[]): T[] => (
  [...assets].sort((a, b) => getAssetSortTimestamp(b) - getAssetSortTimestamp(a))
);

const mergeAssetsById = <T extends { id: string; uploadedAt?: any; date?: string }>(primary: T[] = [], secondary: T[] = []): T[] => {
  const merged = new Map<string, T>();

  [...secondary, ...primary].forEach((item) => {
    if (!item?.id) return;
    merged.set(item.id, item);
  });

  return sortAssetsNewestFirst(Array.from(merged.values()));
};

const fetchAssetSubcollection = async <T>(path: string): Promise<T[]> => {
  try {
    const ordered = await readQueryWithCacheFallback(
      db.collection(path).orderBy('uploadedAt', 'desc'),
      'fetchAssetSubcollection.ordered',
      { path }
    );
    if (ordered.snapshot) {
      return ordered.snapshot.docs.map((doc) => unwrapFromFirestore(doc.data()) as T);
    }
  } catch (orderedError) {
    logFirestoreDebug('fetchAssetSubcollection-ordered-fallback', {
      path,
      error: getErrorMessage(orderedError),
    });
  }

  const fallback = await readQueryWithCacheFallback(
    db.collection(path),
    'fetchAssetSubcollection.unordered',
    { path }
  );
  if (!fallback.snapshot) {
    return [];
  }
  return fallback.snapshot.docs.map((doc) => unwrapFromFirestore(doc.data()) as T);
};

const DB_NAME = 'CoachAI_StorageV2';
const STORES = { VIDEOS: 'videos', PLANS: 'plans' };

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORES.VIDEOS)) db.createObjectStore(STORES.VIDEOS);
      if (!db.objectStoreNames.contains(STORES.PLANS)) db.createObjectStore(STORES.PLANS);
    };
  });
};

export const VideoStorage = {
  saveVideo: async (id: string, blob: Blob) => {
    const db = await openDB();
    const tx = db.transaction(STORES.VIDEOS, 'readwrite');
    tx.objectStore(STORES.VIDEOS).put(blob, id);
    return new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  },
  getVideo: async (id: string) => {
    const db = await openDB();
    const tx = db.transaction(STORES.VIDEOS, 'readonly');
    const req = tx.objectStore(STORES.VIDEOS).get(id);
    return new Promise<Blob | null>((res) => req.onsuccess = () => res(req.result || null));
  },
  deleteVideo: async (id: string) => {
    const db = await openDB();
    const tx = db.transaction(STORES.VIDEOS, 'readwrite');
    tx.objectStore(STORES.VIDEOS).delete(id);
    return new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  }
};

export const PlanStorage = {
  savePlan: async (id: string, blob: Blob) => {
    const db = await openDB();
    const tx = db.transaction(STORES.PLANS, 'readwrite');
    tx.objectStore(STORES.PLANS).put(blob, id);
    return new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  },
  getPlan: async (id: string) => {
    const db = await openDB();
    const req = db.transaction(STORES.PLANS, 'readonly').objectStore(STORES.PLANS).get(id);
    return new Promise<Blob | null>((res) => req.onsuccess = () => res(req.result || null));
  },
  deletePlan: async (id: string) => {
    const db = await openDB();
    const tx = db.transaction(STORES.PLANS, 'readwrite');
    tx.objectStore(STORES.PLANS).delete(id);
    return new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  }
};

const _getLocalRequests = (): CoachRequest[] => {
  try { return JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]'); } catch { return []; }
};
const _saveLocalRequests = (requests: CoachRequest[]) => {
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
};

const getCachedPendingRequestsForEmail = (email: string) =>
  _getLocalRequests().filter((request) => request.athleteEmail?.toLowerCase() === email.toLowerCase());

const saveCachedPendingRequestsForEmail = (email: string, requests: CoachRequest[]) => {
  const normalizedEmail = email.toLowerCase();
  const remaining = _getLocalRequests().filter(
    (request) => request.athleteEmail?.toLowerCase() !== normalizedEmail
  );
  _saveLocalRequests([...remaining, ...requests]);
};

const normalizeUserDataSnapshot = (userId: string, data: UserData): UserData => {
  const normalized = { ...buildDefaultUserData(), ...data };
  if (!normalized.usage) normalized.usage = getInitialUsage();
  normalized.videos = sortAssetsNewestFirst((normalized.videos || []).map((video) => normalizeVideoRecord(userId, video)));
  normalized.plans = sortAssetsNewestFirst((normalized.plans || []).map((plan) => normalizePlanRecord(userId, plan)));
  return normalized;
};

const serializeComparableValue = (value: unknown) => {
  try {
    return JSON.stringify(cleanDataForStorage(value));
  } catch {
    return null;
  }
};

const canUseCloudPersistence = (userId: string) =>
  isFirebaseConfigured && !userId.startsWith('test-') && userId !== 'MASTER_GOD_EUKEN';

const upsertAssetInUserDataSection = async <T extends { id: string; uploadedAt?: any; date?: string }>(
  userId: string,
  section: 'videos' | 'plans',
  asset: T
) => {
  const currentSection = (getLocalUserDataSnapshot(userId)[section] || []) as unknown as T[];
  const nextSection = mergeAssetsById([cleanDataForStorage(asset)], currentSection);

  if (canUseCloudPersistence(userId)) {
    await db.collection("userdata").doc(userId).set({
      [section]: sanitizeForFirestore(nextSection)
    }, { merge: true });
  }

  writeUserDataSectionLocally(userId, section, nextSection);
  return nextSection;
};

const removeAssetFromUserDataSection = async (
  userId: string,
  section: 'videos' | 'plans',
  assetId: string
) => {
  const currentSection = getLocalUserDataSnapshot(userId)[section] || [];
  const nextSection = currentSection.filter((asset: any) => asset?.id !== assetId);

  if (canUseCloudPersistence(userId)) {
    await db.collection("userdata").doc(userId).set({
      [section]: sanitizeForFirestore(nextSection)
    }, { merge: true });
  }

  writeUserDataSectionLocally(userId, section, nextSection);
  return nextSection;
};

type AssetDownloadResolution = {
  url?: string;
  path?: string;
  contentType?: string;
  size?: number;
  createdAt?: string;
  errorCode?: string;
  errorMessage?: string;
};

type UploadedAssetResult = {
  storagePath: string;
  downloadURL: string;
  contentType?: string;
  size: number;
  createdAt?: string;
  ownerId: string;
};

type QuotaRegistrationResult = {
  success: boolean;
  count?: number;
  limit?: number | 'unlimited';
  period?: string;
  tier?: string;
};

type CloudQuotaUsage = {
  videosUsed: number;
  videosLimit: number;
  pdfsUsed: number;
  pdfsLimit: number;
  chatsUsed: number;
  chatsLimit: number | 'unlimited';
  period: string;
  tier: string;
};

const DEV_STORAGE_LOGS = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);
const MAX_VIDEO_FILE_SIZE_BYTES = 512 * 1024 * 1024;

const logStorageDebug = (event: string, payload?: Record<string, unknown>) => {
  if (!DEV_STORAGE_LOGS) return;
  console.debug(`[StorageService] ${event}`, payload || {});
};

const sanitizeStorageFileName = (fileName: string) =>
  fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

const buildUserAssetPath = (folder: 'videos' | 'plans', userId: string, assetId: string, fileName: string) =>
  `${folder}/${userId}/${assetId}_${sanitizeStorageFileName(fileName)}`;

const extractPersistedAssetUrl = (asset: { downloadURL?: string; remoteUrl?: string; url?: string }) => {
  if (asset.downloadURL) return asset.downloadURL;
  if (asset.remoteUrl) return asset.remoteUrl;
  if (asset.url && /^https?:/i.test(asset.url)) return asset.url;
  return undefined;
};

const toIsoStringMaybe = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as any)?.toDate === 'function') {
    try {
      return (value as any).toDate().toISOString();
    } catch {
      return undefined;
    }
  }
  return undefined;
};

const toNumberMaybe = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const normalizeVideoRecord = (userId: string, video: VideoFile): VideoFile => {
  const persistedUrl = extractPersistedAssetUrl(video);
  return {
    ...video,
    url: typeof video.url === 'string' ? video.url : '',
    remoteUrl: persistedUrl,
    downloadURL: persistedUrl,
    storagePath: video.storagePath || (video.id && video.name ? buildUserAssetPath('videos', userId, video.id, video.name) : undefined),
    contentType: video.contentType || undefined,
    size: toNumberMaybe(video.size),
    createdAt: video.createdAt || toIsoStringMaybe((video as any).uploadedAt),
    ownerId: video.ownerId || userId,
    status: video.status || (persistedUrl || video.storagePath ? 'ready' : undefined),
    errorCode: video.errorCode || undefined,
    errorMessage: video.errorMessage || undefined,
    playbackStatus: video.playbackStatus || 'unknown',
  };
};

const normalizePlanRecord = (userId: string, plan: PlanFile): PlanFile => {
  const persistedUrl = extractPersistedAssetUrl(plan);
  return {
    ...plan,
    url: typeof plan.url === 'string' ? plan.url : '',
    remoteUrl: persistedUrl,
    downloadURL: persistedUrl,
    storagePath: plan.storagePath || (plan.id && plan.name ? buildUserAssetPath('plans', userId, plan.id, plan.name) : undefined),
    contentType: plan.contentType || undefined,
    size: toNumberMaybe(plan.size),
    createdAt: plan.createdAt || toIsoStringMaybe((plan as any).uploadedAt),
    ownerId: plan.ownerId || userId,
    status: plan.status || (persistedUrl || plan.storagePath ? 'ready' : undefined),
    errorCode: plan.errorCode || undefined,
    errorMessage: plan.errorMessage || undefined,
  };
};

class StorageUploadError extends Error {
  code: string;
  originalError: unknown;

  constructor(code: string, message: string, originalError: unknown) {
    super(message);
    this.name = 'StorageUploadError';
    this.code = code;
    this.originalError = originalError;
  }
}

const getStorageErrorCode = (error: unknown) =>
  typeof (error as any)?.code === 'string'
    ? String((error as any).code)
    : typeof (error as any)?.originalError?.code === 'string'
      ? String((error as any).originalError.code)
      : 'storage/unknown';

const getStorageErrorMessage = (error: unknown, fallback: string) =>
  typeof (error as any)?.message === 'string' ? String((error as any).message) : fallback;

const buildAssetErrorResolution = (error: unknown, fallback: string): AssetDownloadResolution => ({
  errorCode: getStorageErrorCode(error),
  errorMessage: getStorageErrorMessage(error, fallback),
});

const getStorageUploadFailureMessage = (
  error: unknown,
  folder: 'videos' | 'plans',
  language: Language = 'es',
) => {
  const code = getStorageErrorCode(error);
  const isVideo = folder === 'videos';

  if (code === 'resource-exhausted' || code === 'functions/resource-exhausted') {
    const rawMessage = getStorageErrorMessage(error, '');
    if (rawMessage) return rawMessage;
    if (language === 'ing') return `You have reached the monthly ${isVideo ? 'video' : 'PDF'} limit for your subscription.`;
    if (language === 'eus') return `Zure harpidetzaren hileko ${isVideo ? 'bideo' : 'PDF'} muga gainditu duzu.`;
    return `Has alcanzado el límite mensual de ${isVideo ? 'vídeos' : 'PDFs'} de tu suscripción.`;
  }

  if (code === 'failed-precondition' || code === 'functions/failed-precondition') {
    const rawMessage = getStorageErrorMessage(error, '');
    if (rawMessage) return rawMessage;
  }

  if (code === 'storage/quota-exceeded') {
    if (language === 'ing') {
      return `The ${isVideo ? 'video' : 'file'} cannot be uploaded because Firebase Storage has exceeded its quota. Free up space or upgrade the Firebase plan, then try again.`;
    }
    if (language === 'eus') {
      return `${isVideo ? 'Bideoa' : 'Fitxategia'} ezin da igo Firebase Storage biltegiratze-kuota agortu delako. Askatu lekua edo hobetu Firebase plana, eta saiatu berriro.`;
    }
    return `No se puede subir ${isVideo ? 'el vídeo' : 'el archivo'} porque Firebase Storage ha agotado su cuota. Libera espacio o amplía el plan de Firebase y vuelve a intentarlo.`;
  }

  if (code === 'storage/unauthorized') {
    if (language === 'ing') return `You do not have permission to upload this ${isVideo ? 'video' : 'file'}. Sign in again or check the athlete/coach permissions.`;
    if (language === 'eus') return `Ez duzu ${isVideo ? 'bideo' : 'fitxategi'} hau igotzeko baimenik. Hasi saioa berriro edo egiaztatu atleta/entrenatzaile baimenak.`;
    return `No tienes permisos para subir ${isVideo ? 'este vídeo' : 'este archivo'}. Vuelve a iniciar sesión o revisa los permisos de atleta/entrenador.`;
  }

  if (code === 'storage/retry-limit-exceeded') {
    if (language === 'ing') return `The upload could not finish because the connection timed out. Check your connection and try again.`;
    if (language === 'eus') return `Igoera ezin izan da amaitu konexioak denbora-muga gainditu duelako. Egiaztatu konexioa eta saiatu berriro.`;
    return `La subida no ha podido terminar porque la conexión ha agotado el tiempo de espera. Revisa tu conexión e inténtalo de nuevo.`;
  }

  if (language === 'ing') return `The ${isVideo ? 'video' : 'file'} could not be uploaded. Please try again.`;
  if (language === 'eus') return `${isVideo ? 'Bideoa' : 'Fitxategia'} ezin izan da igo. Saiatu berriro.`;
  return `No se pudo subir ${isVideo ? 'el vídeo' : 'el archivo'}. Inténtalo de nuevo.`;
};

const getReferenceDetails = async (ref: firebase.storage.Reference): Promise<AssetDownloadResolution> => {
  const metadata = await ref.getMetadata();
  const url = await ref.getDownloadURL();
  return {
    url,
    path: ref.fullPath,
    contentType: metadata.contentType || undefined,
    size: toNumberMaybe(metadata.size),
    createdAt: metadata.timeCreated || undefined,
  };
};

const resolveFromStoragePath = async (path: string): Promise<AssetDownloadResolution | null> => {
  try {
    return await getReferenceDetails(storage.ref(path));
  } catch (error) {
    return buildAssetErrorResolution(error, 'No se pudo resolver el objeto en Firebase Storage.');
  }
};

const resolveFromDownloadUrl = async (url: string): Promise<AssetDownloadResolution | null> => {
  try {
    return await getReferenceDetails(storage.refFromURL(url));
  } catch (error) {
    return buildAssetErrorResolution(error, 'La URL persistida del archivo no es valida o ha quedado obsoleta.');
  }
};

const resolveCloudAssetDownload = async ({
  folder,
  userId,
  assetId,
  fileName,
  storagePath,
  persistedUrl,
}: {
  folder: 'videos' | 'plans';
  userId: string;
  assetId: string;
  fileName: string;
  storagePath?: string;
  persistedUrl?: string;
}): Promise<AssetDownloadResolution | null> => {
  if (!canUseCloudPersistence(userId)) return null;

  const candidatePaths = new Set<string>();
  if (storagePath) candidatePaths.add(storagePath);
  if (assetId && fileName) candidatePaths.add(buildUserAssetPath(folder, userId, assetId, fileName));

  let lastResolution: AssetDownloadResolution | null = null;

  for (const candidatePath of candidatePaths) {
    const resolved = await resolveFromStoragePath(candidatePath);
    if (resolved?.url) {
      logStorageDebug('resolved-by-path', { folder, userId, assetId, path: resolved.path });
      return resolved;
    }
    lastResolution = resolved;
  }

  if (persistedUrl) {
    const resolved = await resolveFromDownloadUrl(persistedUrl);
    if (resolved?.url) {
      logStorageDebug('resolved-by-url', { folder, userId, assetId, path: resolved.path });
      return resolved;
    }
    lastResolution = resolved;
  }

  try {
    const folderRef = storage.ref(`${folder}/${userId}`);
    const list = await folderRef.listAll();
    const match = list.items.find((item) => {
      const itemName = item.name || '';
      return (assetId && itemName.startsWith(`${assetId}_`)) || (!!fileName && itemName.endsWith(sanitizeStorageFileName(fileName)));
    });

    if (match) {
      const resolved = await getReferenceDetails(match);
      logStorageDebug('resolved-by-list', { folder, userId, assetId, path: resolved.path });
      return resolved;
    }
  } catch (error) {
    lastResolution = buildAssetErrorResolution(error, 'No se pudo listar la carpeta del archivo en Firebase Storage.');
  }

  return lastResolution || {
    errorCode: 'storage/object-not-found',
    errorMessage: 'El archivo no existe en Firebase Storage o su ruta ya no coincide con el registro.',
  };
};

export const StorageService = {
  isCloudMode: (): boolean => isFirebaseConfigured,
  isOnline: (): boolean => isBrowserOnline(),
  buildVideoStoragePath: (userId: string, assetId: string, fileName: string) =>
    buildUserAssetPath('videos', userId, assetId, fileName),
  buildPlanStoragePath: (userId: string, assetId: string, fileName: string) =>
    buildUserAssetPath('plans', userId, assetId, fileName),
  canPlayVideoContentType: (contentType?: string): boolean | undefined => {
    if (typeof document === 'undefined' || !contentType) return undefined;
    const videoElement = document.createElement('video');
    const support = videoElement.canPlayType(contentType);
    return support === 'probably' || support === 'maybe';
  },

  _getLocalUsers: (): User[] => {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch { return []; }
  },

  _saveLocalUserData: (userId: string, data: UserData) => {
    localStorage.setItem(`${DATA_PREFIX}${userId}`, JSON.stringify(cleanDataForStorage(data)));
  },

  initializeExercisesForSport: async (userId: string, sport: string) => {
    const defaults = SPORT_DEFAULTS[sport] || SPORT_DEFAULTS['other'];
    await StorageService.updateDataSection(userId, 'customExercises', defaults);
  },

  resetSportData: async (userId: string, sport: string) => {
    const defaults = SPORT_DEFAULTS[sport] || SPORT_DEFAULTS['other'];
    await StorageService.updateDataSection(userId, 'customExercises', defaults);
    await StorageService.updateDataSection(userId, 'strengthRecords', []);
  },

  register: async (username: string, password: string): Promise<User> => {
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();
    const initialData = buildDefaultUserData();

    if (isFirebaseConfigured && auth) {
      const userCredential = await auth.createUserWithEmailAndPassword(cleanUsername, cleanPassword);
      const fbUser = userCredential.user!;
      const newUser: User = { id: fbUser.uid, username: cleanUsername, email: cleanUsername, createdAt: new Date().toISOString() };

      await db.collection("users").doc(fbUser.uid).set({ uid: fbUser.uid, email: cleanUsername, username: cleanUsername, profile: null, createdAt: newUser.createdAt });
      await db.collection("userdata").doc(fbUser.uid).set(sanitizeForFirestore(initialData));

      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));
      return newUser;
    } else {
      const users = StorageService._getLocalUsers();
      if (users.find(u => u.username === cleanUsername)) throw new Error('Usuario ya existe.');
      const newUser: User = { id: Date.now().toString(), username: cleanUsername, password: cleanPassword, createdAt: new Date().toISOString() };
      users.push(newUser);
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      StorageService._saveLocalUserData(newUser.id, initialData);
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));
      return newUser;
    }
  },

  login: async (username: string, password: string): Promise<User> => {
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (isFirebaseConfigured && auth) {
      const userCredential = await auth.signInWithEmailAndPassword(cleanUsername, cleanPassword);
      const fbUser = userCredential.user!;

      const userDoc = await db.collection("users").doc(fbUser.uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};

      const user: User = { id: fbUser.uid, username: fbUser.email?.toLowerCase() || 'user', email: fbUser.email?.toLowerCase(), profile: (userData as any).profile, createdAt: new Date().toISOString() };
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
      return user;
    } else {
      const users = StorageService._getLocalUsers();
      const user = users.find(u => u.username === cleanUsername);
      if (!user || user.password !== cleanPassword) throw new Error('Credenciales incorrectas.');
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
      return user;
    }
  },

  logout: async () => {
    if (isFirebaseConfigured && auth) await auth.signOut();
    localStorage.removeItem(CURRENT_USER_KEY);
  },

  getCurrentUser: (): User | null => {
    try { return JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || 'null'); } catch { return null; }
  },

  updateUserProfile: async (userId: string, profile: UserProfile): Promise<User> => {
    const cleanedProfile = cleanDataForStorage(profile);
    if (canUseCloudPersistence(userId)) {
      await db.collection("users").doc(userId).set({ profile: sanitizeForFirestore(cleanedProfile) }, { merge: true });
    }
    const current = StorageService.getCurrentUser();
    if (current && current.id === userId) {
      const updated = { ...current, profile: cleanedProfile };
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updated));
      return updated;
    }
    return { id: userId, username: '', createdAt: '', profile: cleanedProfile };
  },

  getLocalUserData: (userId: string): UserData => {
    return normalizeUserDataSnapshot(userId, getLocalUserDataSnapshot(userId));
  },

  getLastUserDataLoadInfo: (userId: string): UserDataLoadInfo | null =>
    lastUserDataLoadInfoByUser.get(userId) || null,

  getUserData: async (userId: string): Promise<UserData> => {
    const finish = startFirestoreTrace('getUserData', { userId });

    const cached = getCachedUserData(userId);
    if (cached) {
      const info: UserDataLoadInfo = {
        source: 'memory',
        stale: false,
        durationMs: finish({ source: 'memory', stale: false }),
        fetchedAt: Date.now(),
      };
      lastUserDataLoadInfoByUser.set(userId, info);
      return cached;
    }

    const inFlight = userDataInFlight.get(userId);
    if (inFlight) {
      finish({ source: 'memory', deduped: true });
      return inFlight;
    }

    const task = (async () => {
      let data: UserData | null = null;
      let source: FirestoreDataSource = 'local';
      let stale = true;
      const defaults = buildDefaultUserData();

      if (canUseCloudPersistence(userId)) {
        const userDocRead = await readDocumentWithCacheFallback(
          db.collection("userdata").doc(userId),
          'getUserData.rootDoc',
          { userId }
        );

        source = userDocRead.source;
        stale = userDocRead.stale;

        if (userDocRead.snapshot?.exists) {
          const cloudData = unwrapFromFirestore(userDocRead.snapshot.data());
          data = { ...defaults, ...cloudData };
        }

        try {
          const [subVideos, subPlans] = await Promise.all([
            fetchAssetSubcollection<VideoFile>(`userdata/${userId}/videos`),
            fetchAssetSubcollection<PlanFile>(`userdata/${userId}/plans`)
          ]);

          if (!data) data = { ...defaults };
          if (subVideos.length > 0) {
            data.videos = mergeAssetsById(subVideos, data.videos || []);
          }

          if (subPlans.length > 0) {
            data.plans = mergeAssetsById(subPlans, data.plans || []);
          }
        } catch (subErr) {
          console.error("Failed fetching cloud asset subcollections", subErr);
        }
      }

      if (!data) {
        data = getLocalUserDataSnapshot(userId);
        source = 'local';
        stale = true;
      }

      const normalized = normalizeUserDataSnapshot(userId, data);
      StorageService._saveLocalUserData(userId, normalized);
      setCachedUserData(userId, normalized);

      const info: UserDataLoadInfo = {
        source,
        stale,
        durationMs: 0,
        fetchedAt: Date.now(),
      };

      lastUserDataLoadInfoByUser.set(userId, info);
      return normalized;
    })().finally(() => {
      userDataInFlight.delete(userId);
    });

    userDataInFlight.set(userId, task);

    try {
      const data = await task;
      const existing = lastUserDataLoadInfoByUser.get(userId);
      lastUserDataLoadInfoByUser.set(userId, {
        ...(existing || { source: 'local', stale: true, fetchedAt: Date.now() }),
        durationMs: finish({
          source: existing?.source || 'local',
          stale: existing?.stale ?? true,
        }),
      });
      return data;
    } catch (error) {
      const durationMs = finish({ error: getErrorMessage(error) });
      lastUserDataLoadInfoByUser.set(userId, {
        source: 'local',
        stale: true,
        durationMs,
        fetchedAt: Date.now(),
        error: getErrorMessage(error),
      });
      throw error;
    }
  },

  updateDataSection: async (
    userId: string,
    section: keyof UserData,
    value: any,
    options?: { reason?: string }
  ) => {
    const finish = startFirestoreTrace('updateDataSection', {
      userId,
      section,
      reason: options?.reason || 'default',
    });
    const cleanedValue = cleanDataForStorage(value);
    const currentValue = (getLocalUserDataSnapshot(userId) as any)[section];

    if (serializeComparableValue(currentValue) === serializeComparableValue(cleanedValue)) {
      finish({ skipped: true, source: 'memory', stale: false });
      return;
    }

    writeUserDataSectionLocally(userId, section, cleanedValue);

    let syncedToServer = false;
    if (canUseCloudPersistence(userId)) {
      try {
        syncedToServer = await queueCloudSectionWrite(userId, section, cleanedValue);
      } catch (err) {
        console.error("Firestore write error:", err);
      }
    }

    finish({
      source: syncedToServer ? 'server' : 'local',
      stale: !syncedToServer,
      pendingWrites: queuedCloudSectionWrites.size,
    });
  },

  incrementUsage: async (userId: string, type: 'analysis' | 'chat' | 'plan') => {
    const data = getLocalUserDataSnapshot(userId);
    if (!data.usage) data.usage = getInitialUsage();

    if (type === 'analysis') data.usage.analysisCount++;
    if (type === 'chat') data.usage.chatCount++;
    if (type === 'plan') data.usage.plansCount++;

    await StorageService.updateDataSection(userId, 'usage', data.usage);
  },

  updateVideos: (userId: string, videos: VideoFile[], options?: { reason?: string }) =>
    StorageService.updateDataSection(
      userId,
      'videos',
      videos.map((video) => normalizeVideoRecord(userId, video)),
      options,
    ),
  
  // V3 Authoritative Video Storage Add
  addVideoSafe: async (targetUserId: string, video: VideoFile): Promise<QuotaRegistrationResult> => {
    const normalizedVideo = normalizeVideoRecord(targetUserId, {
      ...video,
      status: video.status || 'ready',
    });
    const cleanedVideo = cleanDataForStorage(normalizedVideo);

    if (!canUseCloudPersistence(targetUserId)) {
      await upsertAssetInUserDataSection(targetUserId, 'videos', cleanedVideo);
      return { success: true };
    }

    try {
      const callableFunc = firebase.app().functions('europe-west1').httpsCallable('registerVideoInGallery');
      const result = await callableFunc({
        videoData: cleanedVideo,
        targetUserId
      });

      const registration = (result.data || {}) as QuotaRegistrationResult;
      if (registration.success === false) return registration;
      await upsertAssetInUserDataSection(targetUserId, 'videos', cleanedVideo);
      return { ...registration, success: true };
    } catch (callableError) {
      console.warn("registerVideoInGallery failed", callableError);
      throw callableError;
    }
  },

  // NEW V3: Authoritative PDF Storage Add
  addPdfSafe: async (targetUserId: string, plan: PlanFile): Promise<QuotaRegistrationResult> => {
    const normalizedPlan = normalizePlanRecord(targetUserId, {
      ...plan,
      status: plan.status || 'ready',
    });
    const cleanedPlan = cleanDataForStorage(normalizedPlan);

    if (!canUseCloudPersistence(targetUserId)) {
      await upsertAssetInUserDataSection(targetUserId, 'plans', cleanedPlan);
      return { success: true };
    }

    try {
      const callableFunc = firebase.app().functions('europe-west1').httpsCallable('registerPdfInGallery');
      const result = await callableFunc({
        pdfData: cleanedPlan,
        targetUserId
      });

      const registration = (result.data || {}) as QuotaRegistrationResult;
      if (registration.success === false) return registration;
      await upsertAssetInUserDataSection(targetUserId, 'plans', cleanedPlan);
      return { ...registration, success: true };
    } catch (callableError) {
      console.warn("registerPdfInGallery failed", callableError);
      throw callableError;
    }
  },

  // NEW V3: Fetch Global Quota Usage
  getCoachQuotaUsage: async (): Promise<CloudQuotaUsage | null> => {
    if (!isFirebaseConfigured || !isBrowserOnline()) return null;
    const currentAuthUser = await waitForAuthReady();
    if (!currentAuthUser) return null;

    const callableFunc = firebase.app().functions('europe-west1').httpsCallable('getCoachQuotaUsage');
    const result = await callableFunc();
    const cloudUsage = result.data as CloudQuotaUsage;

    try {
      const userDataSnap = await db.collection("userdata").doc(currentAuthUser.uid).get({ source: 'server' } as any);
      const legacyUsage = userDataSnap.exists ? (userDataSnap.data()?.usage || {}) : {};
      const shouldMergeLegacy = isLegacyUsageInPeriod(legacyUsage, cloudUsage.period);
      const legacyVideos = shouldMergeLegacy ? Number(legacyUsage.analysisCount || 0) || 0 : 0;
      const legacyPdfs = shouldMergeLegacy ? Number(legacyUsage.plansCount || 0) || 0 : 0;
      const legacyChats = shouldMergeLegacy ? Number(legacyUsage.chatCount || 0) || 0 : 0;
      return {
        ...cloudUsage,
        videosUsed: Math.max(Number(cloudUsage.videosUsed || 0), legacyVideos),
        pdfsUsed: Math.max(Number(cloudUsage.pdfsUsed || 0), legacyPdfs),
        chatsUsed: Math.max(Number(cloudUsage.chatsUsed || 0), legacyChats),
      };
    } catch (legacyError) {
      console.warn("Could not merge legacy cloud quota usage", legacyError);
      return cloudUsage;
    }
  },

  // V3 Authoritative Video Storage Delete
  deleteVideoSafe: async (userId: string, videoId: string): Promise<void> => {
    if (canUseCloudPersistence(userId)) {
      try {
        await db.collection(`userdata/${userId}/videos`).doc(videoId).delete();
      } catch (err) {
        console.error("Failed deleting video metadata from subcollection", err);
      }
    }

    await removeAssetFromUserDataSection(userId, 'videos', videoId);
  },

  deletePlanSafe: async (userId: string, planId: string): Promise<void> => {
    if (canUseCloudPersistence(userId)) {
      try {
        await db.collection(`userdata/${userId}/plans`).doc(planId).delete();
      } catch (err) {
        console.error("Failed deleting plan metadata from subcollection", err);
      }
    }

    await removeAssetFromUserDataSection(userId, 'plans', planId);
  },

  updatePlans: (userId: string, plans: PlanFile[], options?: { reason?: string }) =>
    StorageService.updateDataSection(
      userId,
      'plans',
      plans.map((plan) => normalizePlanRecord(userId, plan)),
      options,
    ),
  updateStrengthRecords: (userId: string, records: StrengthRecord[]) => StorageService.updateDataSection(userId, 'strengthRecords', records),
  updateCompetitionRecords: (userId: string, records: ThrowRecord[]) => StorageService.updateDataSection(userId, 'competitionRecords', records),
  updateTrainingRecords: (userId: string, records: ThrowRecord[]) => StorageService.updateDataSection(userId, 'trainingRecords', records),
  updateCustomExercises: (userId: string, ex: ExerciseDef[]) => StorageService.updateDataSection(userId, 'customExercises', ex),
  updateSupplements: (userId: string, items: SupplementItem[]) => StorageService.updateDataSection(userId, 'supplements', items),
  updateMatchRecords: (userId: string, records: any[]) => StorageService.updateDataSection(userId, 'matchRecords', records),

  validateVideoFile: (file: File): string | null => {
    if (!file) return 'No se ha seleccionado ningun archivo.';
    const looksLikeVideo = file.type?.startsWith('video/') || /\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(file.name);
    if (!looksLikeVideo) {
      return 'El archivo seleccionado no es un video valido.';
    }
    if (file.size > MAX_VIDEO_FILE_SIZE_BYTES) {
      return 'El video supera el limite permitido de 512 MB.';
    }
    return null;
  },

  uploadUserAsset: async (
    userId: string,
    file: File,
    folder: 'videos' | 'plans' = 'videos',
    customPath?: string,
  ): Promise<UploadedAssetResult | null> => {
    if (!isFirebaseConfigured || !isBrowserOnline() || userId.startsWith('test-') || userId === 'MASTER_GOD_EUKEN') {
      return null;
    }

    const authenticatedUser = auth?.currentUser;
    if (!authenticatedUser) {
      throw new Error('No hay una sesion autenticada valida para subir archivos a Firebase Storage.');
    }

    try {
      const path = customPath || `${folder}/${userId}/${Date.now()}_${sanitizeStorageFileName(file.name)}`;
      const ref = storage.ref(path);
      const snapshot = await ref.put(file, {
        contentType: file.type || undefined,
        customMetadata: {
          ownerId: userId,
          uploadedBy: authenticatedUser.uid,
        },
      });

      const [metadata, downloadURL] = await Promise.all([
        snapshot.ref.getMetadata(),
        snapshot.ref.getDownloadURL(),
      ]);

      const result: UploadedAssetResult = {
        storagePath: snapshot.ref.fullPath,
        downloadURL,
        contentType: metadata.contentType || file.type || undefined,
        size: toNumberMaybe(metadata.size) || file.size,
        createdAt: metadata.timeCreated || new Date().toISOString(),
        ownerId: userId,
      };

      logStorageDebug('upload-complete', {
        folder,
        userId,
        storagePath: result.storagePath,
        contentType: result.contentType,
        size: result.size,
      });

      return result;
    } catch (error) {
      console.error('Upload failed:', error);
      throw new StorageUploadError(
        getStorageErrorCode(error),
        getStorageUploadFailureMessage(error, folder),
        error,
      );
    }
  },

  uploadVideoFile: async (userId: string, file: File, customPath?: string): Promise<UploadedAssetResult | null> => {
    return StorageService.uploadUserAsset(userId, file, 'videos', customPath);
  },

  uploadFile: async (userId: string, file: File, folder = 'videos', customPath?: string): Promise<string | null> => {
    const uploaded = await StorageService.uploadUserAsset(userId, file, folder as 'videos' | 'plans', customPath);
    return uploaded?.downloadURL || null;
  },

  getUploadErrorMessage: (
    error: unknown,
    folder: 'videos' | 'plans',
    language: Language = 'es',
  ): string => getStorageUploadFailureMessage(error, folder, language),

  // Upload landing page video to public folder (admin only)
  uploadLandingVideo: async (file: File): Promise<string | null> => {
    if (!isFirebaseConfigured) return null;
    try {
      const path = `public/landing-video.mp4`;
      const ref = storage.ref(path);
      const snap = await ref.put(file);
      return await snap.ref.getDownloadURL();
    } catch (e) {
      console.error("Landing video upload failed:", e);
      return null;
    }
  },

  // Get landing video URL from Firebase Storage
  getLandingVideoUrl: async (): Promise<string | null> => {
    if (!isFirebaseConfigured) return null;
    try {
      const ref = storage.ref('public/landing-video.mp4');
      return await ref.getDownloadURL();
    } catch {
      return null;
    }
  },

  getDownloadUrlFromPath: async (path: string): Promise<string | null> => {
    if (!isFirebaseConfigured || !isBrowserOnline()) return null;
    try {
      const ref = storage.ref(path);
      return await ref.getDownloadURL();
    } catch {
      return null;
    }
  },

  findVideoDownloadUrl: async (userId: string, video: VideoFile): Promise<AssetDownloadResolution | null> => {
    return resolveCloudAssetDownload({
      folder: 'videos',
      userId,
      assetId: video.id,
      fileName: video.name,
      storagePath: video.storagePath,
      persistedUrl: extractPersistedAssetUrl(video),
    });
  },

  findPlanDownloadUrl: async (userId: string, plan: PlanFile): Promise<AssetDownloadResolution | null> => {
    return resolveCloudAssetDownload({
      folder: 'plans',
      userId,
      assetId: plan.id,
      fileName: plan.name,
      storagePath: plan.storagePath,
      persistedUrl: extractPersistedAssetUrl(plan),
    });
  },

  deleteFileFromCloud: async (url: string) => {
    if (isFirebaseConfigured && url?.startsWith('http')) {
      try { await storage.refFromURL(url).delete(); } catch { }
    }
  },

  deleteFileByPath: async (path: string) => {
    if (isFirebaseConfigured && path) {
      try { await storage.ref(path).delete(); } catch { }
    }
  },

  getManagedAthletes: async (athleteIds: string[]): Promise<User[]> => {
    if (!isFirebaseConfigured || !isBrowserOnline() || athleteIds.length === 0) return [];
    const snapshots = await Promise.all(
      athleteIds.map((id) => db.collection("users").doc(id).get())
    );
    return snapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => ({ id: snapshot.id, ...(snapshot.data() as any) } as User));
  },

  getPendingRequests: async (userEmail: string): Promise<PendingRequestsResult> => {
    const normalizedEmail = userEmail.toLowerCase().trim();
    const finish = startFirestoreTrace('getPendingRequests', { athleteEmail: normalizedEmail });
    const cached = pendingRequestsMemoryCache.get(normalizedEmail);

    if (cached && Date.now() - cached.fetchedAt < PENDING_REQUESTS_CACHE_TTL_MS) {
      finish({ source: 'memory', stale: cached.stale, count: cached.requests.length });
      return cached;
    }

    const inFlight = pendingRequestsInFlight.get(normalizedEmail);
    if (inFlight) {
      finish({ source: 'memory', stale: false, deduped: true });
      return inFlight;
    }

    const localRequests = getCachedPendingRequestsForEmail(normalizedEmail);
    const task = (async (): Promise<PendingRequestsResult> => {
      if (!isFirebaseConfigured) {
        const localResult: PendingRequestsResult & { fetchedAt: number } = {
          requests: localRequests,
          source: 'local',
          stale: true,
          fetchedAt: Date.now(),
        };
        pendingRequestsMemoryCache.set(normalizedEmail, localResult);
        return localResult;
      }

      const query = db.collection("requests")
        .where("athleteEmail", "==", normalizedEmail)
        .where("status", "==", "pending");

      try {
        const readResult = await readQueryWithCacheFallback(query, 'getPendingRequests.query', {
          athleteEmail: normalizedEmail,
        });

        if (!readResult.snapshot) {
          const fallbackResult: PendingRequestsResult & { fetchedAt: number } = {
            requests: localRequests,
            source: 'local',
            stale: true,
            fetchedAt: Date.now(),
          };
          pendingRequestsMemoryCache.set(normalizedEmail, fallbackResult);
          return fallbackResult;
        }

        const requests = readResult.snapshot.docs.map(
          (doc) => ({ id: doc.id, ...(doc.data() as any) } as CoachRequest)
        );

        saveCachedPendingRequestsForEmail(normalizedEmail, requests);
        const result: PendingRequestsResult & { fetchedAt: number } = {
          requests,
          source: readResult.source,
          stale: readResult.stale,
          fetchedAt: Date.now(),
        };
        pendingRequestsMemoryCache.set(normalizedEmail, result);
        return result;
      } catch (error) {
        const fallbackResult: PendingRequestsResult & { fetchedAt: number } = {
          requests: localRequests,
          source: 'local',
          stale: true,
          error: getErrorMessage(error),
          fetchedAt: Date.now(),
        };
        pendingRequestsMemoryCache.set(normalizedEmail, fallbackResult);
        return fallbackResult;
      }
    })().finally(() => {
      pendingRequestsInFlight.delete(normalizedEmail);
    });

    pendingRequestsInFlight.set(normalizedEmail, task);
    const result = await task;
    finish({ source: result.source, stale: result.stale, count: result.requests.length, error: result.error });
    return result;
  },

  getCoachRequests: async (coachId: string): Promise<CoachRequest[]> => {
    if (!isFirebaseConfigured || !isBrowserOnline()) return [];
    const snap = await db.collection("requests")
      .where("coachId", "==", coachId)
      .get();

    return snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as CoachRequest));
  },

  respondToCoachRequest: async (request: CoachRequest, accept: boolean, athleteUser: User) => {
    if (!isFirebaseConfigured || !isBrowserOnline()) return;
    await db.collection("requests").doc(request.id).update({ status: accept ? 'accepted' : 'rejected' });
    const athleteEmail = request.athleteEmail.toLowerCase();
    const remainingRequests = getCachedPendingRequestsForEmail(athleteEmail)
      .filter((cachedRequest) => cachedRequest.id !== request.id);
    saveCachedPendingRequestsForEmail(athleteEmail, remainingRequests);
    pendingRequestsMemoryCache.delete(athleteEmail);

    if (accept) {
      await db.collection("users").doc(request.coachId).update({ "profile.managedAthletes": firebase.firestore.FieldValue.arrayUnion(athleteUser.id) });
      const current = athleteUser.profile?.coaches || [];
      await StorageService.updateUserProfile(athleteUser.id, { ...athleteUser.profile!, coaches: [...current, request.coachId] });
    }
  },

  sendCoachRequest: async (coach: User, athleteEmail: string) => {
    if (!isFirebaseConfigured) throw new Error("Solo disponible en modo nube.");
    if (!isBrowserOnline()) throw new Error("Sin conexión. Inténtalo de nuevo cuando vuelva Internet.");
    const snap = await db.collection("users").where("username", "==", athleteEmail.toLowerCase()).get();
    if (snap.empty) throw new Error("Atleta no encontrado.");
    const athleteDoc = snap.docs[0];
    const athleteId = athleteDoc.id;
    const athleteData = athleteDoc.data() as any;

    // Use canonical composite ID for authorization lookups
    const reqId = `${coach.id}_${athleteId}`;

    await db.collection("requests").doc(reqId).set({
      coachId: coach.id,
      coachName: `${coach.profile?.firstName} ${coach.profile?.lastName}`,
      athleteId: athleteId,
      athleteEmail: athleteEmail.toLowerCase(),
      athleteName: `${athleteData.profile?.firstName} ${athleteData.profile?.lastName}`,
      athleteDiscipline: athleteData.profile?.discipline || 'Atleta',
      status: 'pending',
      createdAt: new Date().toISOString()
    }, { merge: true });
  },

  removeAthleteFromCoach: async (coachId: string, athleteId: string) => {
    if (isFirebaseConfigured) {
      try {
        await db.collection("users").doc(coachId).update({ "profile.managedAthletes": firebase.firestore.FieldValue.arrayRemove(athleteId) });
        await db.collection("users").doc(athleteId).update({ "profile.coaches": firebase.firestore.FieldValue.arrayRemove(coachId) });
        
        const reqId = `${coachId}_${athleteId}`;
        await db.collection("requests").doc(reqId).update({ status: 'rejected' }).catch(() => {});
        
        console.log("Successfully removed athlete from coach:", { coachId, athleteId });
      } catch (e) {
        console.error("Error removing athlete from coach:", e);
        throw e; // Re-throw so the caller can handle it
      }
    }
  },

  deleteUser: async (userId: string) => {
    if (isFirebaseConfigured) {
      await db.collection("userdata").doc(userId).delete();
      await db.collection("users").doc(userId).delete();
    }
    localStorage.removeItem(`${DATA_PREFIX}${userId}`);
  },

  deleteCurrentAccount: async () => {
    const user = StorageService.getCurrentUser();
    if (user) {
      await StorageService.deleteUser(user.id);
      if (isFirebaseConfigured && auth.currentUser) await auth.currentUser.delete();
    }
  },

  getSystemReport: async (): Promise<any[]> => {
    if (!isFirebaseConfigured) return [];
    const snap = await db.collection("users").get();
    const report: any[] = [];
    for (const d of snap.docs) {
      const u = { id: d.id, ...(d.data() as any) } as User;
      const data = await StorageService.getUserData(u.id);
      report.push({ user: u, stats: { videos: data.videos.length, plans: data.plans.length, strengthRecords: data.strengthRecords.length, competitionRecords: data.competitionRecords.length, trainingRecords: data.trainingRecords.length } });
    }
    return report;
  }
};
