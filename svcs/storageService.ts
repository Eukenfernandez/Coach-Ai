
import { User, UserData, VideoFile, StrengthRecord, ThrowRecord, PlanFile, UserProfile, ExerciseDef, CoachRequest, UserUsage, SupplementItem, Language } from '../types';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import 'firebase/compat/functions'; // Required to call Cloud Functions
import 'firebase/compat/app-check';
import { persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

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

  const appCheckSiteKey = typeof import.meta !== 'undefined'
    ? import.meta.env?.VITE_FIREBASE_APPCHECK_SITE_KEY
    : undefined;
  if (
    appCheckSiteKey
    && typeof window !== 'undefined'
    && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')
  ) {
    app.appCheck().activate(appCheckSiteKey, true);
  }

  // COMPAT FIRESTORE INITIALIZATION
  db = app.firestore();
  try {
    db.settings({
      merge: true,
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
      experimentalAutoDetectLongPolling:
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'),
    } as any);
  } catch (settingsError) {
    console.warn("Firestore settings were already locked; reusing existing instance.", settingsError);
  }

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
const STORES = { VIDEOS: 'videos', PLANS: 'plans', FILMSTRIPS: 'filmstrips' };
const INDEXED_DB_OPEN_TIMEOUT_MS = 5000;
const INDEXED_DB_OPERATION_TIMEOUT_MS = 5000;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    // v3 adds the filmstrips store (scrubbing proxies).
    const request = indexedDB.open(DB_NAME, 3);
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('La base de datos local ha tardado demasiado en responder.'));
    }, INDEXED_DB_OPEN_TIMEOUT_MS);

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      reject(error instanceof Error ? error : new Error('No se ha podido abrir la base de datos local.'));
    };

    request.onerror = () => fail(request.error);
    // Another tab still holding the previous version blocks the upgrade. Without
    // this the request never settles and every caller awaits forever; failing
    // fast lets callers fall back to the network instead.
    request.onblocked = () => fail(new Error('La base de datos local está bloqueada por otra pestaña.'));
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      resolve(request.result);
    };
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORES.VIDEOS)) db.createObjectStore(STORES.VIDEOS);
      if (!db.objectStoreNames.contains(STORES.PLANS)) db.createObjectStore(STORES.PLANS);
      if (!db.objectStoreNames.contains(STORES.FILMSTRIPS)) db.createObjectStore(STORES.FILMSTRIPS);
    };
  });
};

const readStoredValue = async <T,>(
  storeName: string,
  id: string,
  accept: (value: unknown) => value is T,
): Promise<T | null> => {
  const db = await openDB();

  return new Promise<T | null>((resolve, reject) => {
    let settled = false;
    let storedValue: T | null = null;
    let timeoutId: ReturnType<typeof setTimeout>;

    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      db.close();

      if (error) {
        reject(error instanceof Error ? error : new Error('No se ha podido leer el archivo local.'));
        return;
      }

      resolve(storedValue);
    };

    timeoutId = setTimeout(() => {
      finish(new Error('La lectura del archivo local ha tardado demasiado en responder.'));
    }, INDEXED_DB_OPERATION_TIMEOUT_MS);

    try {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).get(id);

      request.onsuccess = () => {
        storedValue = accept(request.result) ? request.result : null;
      };
      request.onerror = () => finish(request.error);
      tx.oncomplete = () => finish();
      tx.onerror = () => finish(tx.error);
      tx.onabort = () => finish(tx.error || new Error('La lectura del archivo local se ha cancelado.'));
    } catch (error) {
      finish(error);
    }
  });
};

const isBlob = (value: unknown): value is Blob => value instanceof Blob;
const readStoredBlob = (storeName: string, id: string) => readStoredValue(storeName, id, isBlob);

const writeStoredValue = async (
  storeName: string,
  id: string,
  operation: 'put' | 'delete',
  blob?: unknown,
): Promise<void> => {
  const db = await openDB();

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      db.close();

      if (error) {
        reject(error instanceof Error ? error : new Error('No se ha podido guardar el archivo local.'));
        return;
      }

      resolve();
    };

    timeoutId = setTimeout(() => {
      finish(new Error('La escritura del archivo local ha tardado demasiado en responder.'));
    }, INDEXED_DB_OPERATION_TIMEOUT_MS);

    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      if (operation === 'put') {
        if (!blob) throw new Error('Falta el archivo que se debe guardar localmente.');
        store.put(blob, id);
      } else {
        store.delete(id);
      }
      tx.oncomplete = () => finish();
      tx.onerror = () => finish(tx.error);
      tx.onabort = () => finish(tx.error || new Error('La escritura del archivo local se ha cancelado.'));
    } catch (error) {
      finish(error);
    }
  });
};

const writeStoredBlob = (storeName: string, id: string, operation: 'put' | 'delete', blob?: Blob) =>
  writeStoredValue(storeName, id, operation, blob);

export const VideoStorage = {
  saveVideo: (id: string, blob: Blob) => writeStoredBlob(STORES.VIDEOS, id, 'put', blob),
  getVideo: (id: string) => readStoredBlob(STORES.VIDEOS, id),
  deleteVideo: (id: string) => writeStoredBlob(STORES.VIDEOS, id, 'delete'),
};

// Scrubbing proxies for high-resolution video. Rebuildable from the cached
// video, so a miss is never an error — it just means the drag falls back to
// decoding real frames.
export const FilmstripStorage = {
  saveFilmstrip: (id: string, filmstrip: unknown) =>
    writeStoredValue(STORES.FILMSTRIPS, id, 'put', filmstrip),
  getFilmstrip: <T,>(id: string): Promise<T | null> =>
    readStoredValue(STORES.FILMSTRIPS, id, (value): value is T => value != null),
  deleteFilmstrip: (id: string) =>
    writeStoredValue(STORES.FILMSTRIPS, id, 'delete').catch(() => undefined),
};

export const PlanStorage = {
  savePlan: (id: string, blob: Blob) => writeStoredBlob(STORES.PLANS, id, 'put', blob),
  getPlan: (id: string) => readStoredBlob(STORES.PLANS, id),
  deletePlan: (id: string) => writeStoredBlob(STORES.PLANS, id, 'delete'),
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
  storedCount?: number;
  storedLimit?: number;
  period?: string;
  periodStartMs?: number;
  periodEndMs?: number;
  tier?: string;
};

type CloudQuotaUsage = {
  videosUsed: number;
  videosLimit: number;
  videosStoredLimit?: number;
  pdfsUsed: number;
  pdfsLimit: number;
  pdfsStoredLimit?: number;
  chatsUsed: number;
  chatsLimit: number | 'unlimited';
  period: string;
  periodStartMs?: number;
  periodEndMs?: number;
  tier: string;
};

const DEV_STORAGE_LOGS = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);
const MAX_VIDEO_FILE_SIZE_BYTES = 512 * 1024 * 1024;
const MAX_PDF_FILE_SIZE_BYTES = 50 * 1024 * 1024;

const logStorageDebug = (event: string, payload?: Record<string, unknown>) => {
  if (!DEV_STORAGE_LOGS) return;
  console.debug(`[StorageService] ${event}`, payload || {});
};

// The backend accepts at most 180 characters after `${assetId}_`; keep a
// margin and preserve the extension when trimming long names.
const MAX_STORAGE_FILE_NAME_LENGTH = 120;
const MAX_STORAGE_FILE_EXTENSION_LENGTH = 16;

const sanitizeStorageFileName = (fileName: string) => {
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (sanitized.length <= MAX_STORAGE_FILE_NAME_LENGTH) return sanitized;
  const extensionIndex = sanitized.lastIndexOf('.');
  const extension = extensionIndex > 0 && sanitized.length - extensionIndex <= MAX_STORAGE_FILE_EXTENSION_LENGTH
    ? sanitized.slice(extensionIndex)
    : '';
  return sanitized.slice(0, MAX_STORAGE_FILE_NAME_LENGTH - extension.length) + extension;
};

const buildUserAssetPath = (folder: 'videos' | 'plans', userId: string, assetId: string, fileName: string) =>
  `${folder}/${userId}/${assetId}_${sanitizeStorageFileName(fileName)}`;

// Asset records come from userdata/{ownerId} (legacy root arrays written by old
// clients, plus the server-written subcollections). A coach (or admin) viewing
// that gallery resolves and deletes those paths with their own, broader Storage
// rights, so a record must never point outside the owner's folder — otherwise
// a forged legacy record could make the coach read or delete the coach's own
// or another athlete's files. Mirrors assertOwnedStoragePath.
const isOwnedAssetPath = (path: unknown, folder: 'videos' | 'plans', ownerId: string): path is string =>
  typeof path === 'string'
  && !!ownerId
  && path.startsWith(`${folder}/${ownerId}/`)
  && !path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');

// Accounts created from this date on must verify their email before a coach can
// invite them (the backend trusts only the email_verified token claim for them;
// keep this date in sync with the backend cutoff).
const EMAIL_VERIFICATION_CUTOFF_MS = Date.parse('2026-10-14T00:00:00Z');
const EMAIL_VERIFICATION_RESEND_KEY = 'coachai_email_verification_sent_at';
const EMAIL_VERIFICATION_RESEND_INTERVAL_MS = 24 * 60 * 60 * 1000;

const sendEmailVerificationMaybe = async (fbUser: firebase.User) => {
  try {
    await fbUser.sendEmailVerification();
    localStorage.setItem(`${EMAIL_VERIFICATION_RESEND_KEY}_${fbUser.uid}`, String(Date.now()));
  } catch (error) {
    console.warn('[Auth] Could not send the verification email', error);
  }
};

// Login re-sends the link (at most once a day) so users who lost the first one
// can still verify; older accounts are trusted without it.
const resendEmailVerificationIfNeeded = async (fbUser: firebase.User) => {
  if (fbUser.emailVerified) return;
  const createdAt = Date.parse(fbUser.metadata?.creationTime || '');
  if (!Number.isFinite(createdAt) || createdAt < EMAIL_VERIFICATION_CUTOFF_MS) return;
  const lastSent = Number(localStorage.getItem(`${EMAIL_VERIFICATION_RESEND_KEY}_${fbUser.uid}`) || 0);
  if (Date.now() - lastSent < EMAIL_VERIFICATION_RESEND_INTERVAL_MS) return;
  await sendEmailVerificationMaybe(fbUser);
};

// register() writes users/{uid} and userdata/{uid} right after creating the
// Auth account. If those writes failed, every later merge-save of { profile }
// is a *create* and the rules reject it (identity fields missing). Recreate
// the same minimal documents register() writes when a signed-in user has none.
// Runs in a transaction so an existing document is never overwritten, and
// never throws: a failure here must not block sign-in.
const ensureUserDocumentsExist = async (fbUser: firebase.User) => {
  const email = fbUser.email?.toLowerCase();
  if (!db || !email) return;
  try {
    const userRef = db.collection('users').doc(fbUser.uid);
    const userDataRef = db.collection('userdata').doc(fbUser.uid);
    const created = await db.runTransaction(async (transaction) => {
      const [userSnap, userDataSnap] = await Promise.all([
        transaction.get(userRef),
        transaction.get(userDataRef),
      ]);
      const createdDocs: string[] = [];
      if (!userSnap.exists) {
        transaction.set(userRef, {
          uid: fbUser.uid,
          email,
          username: email,
          profile: null,
          createdAt: new Date().toISOString(),
        });
        createdDocs.push('users');
      }
      if (!userDataSnap.exists) {
        // videos/plans stay empty: the userdata create rule requires it.
        transaction.set(userDataRef, sanitizeForFirestore(buildDefaultUserData()));
        createdDocs.push('userdata');
      }
      return createdDocs;
    });
    if (created.length > 0) {
      console.warn('[Auth] Recreated missing user documents', { uid: fbUser.uid, created });
    }
  } catch (error) {
    console.error('[Auth] Could not recreate the missing user documents', error);
  }
};

const getEffectiveUploadContentType = (file: File, folder: 'videos' | 'plans') => {
  if (folder === 'plans') return 'application/pdf';
  if (file.type?.startsWith('video/')) return file.type.toLowerCase();
  if (/\.mov$/i.test(file.name)) return 'video/quicktime';
  if (/\.webm$/i.test(file.name)) return 'video/webm';
  return 'video/mp4';
};

const getAssetIdFromStoragePath = (path: string, folder: 'videos' | 'plans', userId: string) => {
  const prefix = `${folder}/${userId}/`;
  if (!path.startsWith(prefix)) throw new Error('La ruta de subida no corresponde al usuario.');
  const fileName = path.slice(prefix.length);
  const separatorIndex = fileName.indexOf('_');
  const assetId = separatorIndex > 0 ? fileName.slice(0, separatorIndex) : '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(assetId) || fileName.includes('/')) {
    throw new Error('La ruta de subida no contiene un identificador válido.');
  }
  return assetId;
};

// The backend keeps a single upload grant per uploader and kind (2 h TTL) and
// rejects a new authorizeAssetUpload for another file while it is alive. A
// grant lives from authorize until the gallery registration consumes it, so
// this tab runs at most one upload per kind and holds the slot until the
// uploaded file is registered (or cancelled).
type AssetUploadKind = 'videos' | 'plans';
// Safety net: a caller that never registers/cancels must not wedge the queue.
const ASSET_UPLOAD_SLOT_HOLD_MS = 3 * 60 * 1000;
const assetUploadQueues: Record<AssetUploadKind, Promise<void>> = {
  videos: Promise.resolve(),
  plans: Promise.resolve(),
};
// storagePath -> settles the grant locally (releases the slot it holds).
const pendingAssetUploadGrants: Record<AssetUploadKind, Map<string, () => void>> = {
  videos: new Map(),
  plans: new Map(),
};

const acquireAssetUploadSlot = (kind: AssetUploadKind): Promise<() => void> => {
  let resolveReleased!: () => void;
  const released = new Promise<void>((resolve) => { resolveReleased = resolve; });
  const previous = assetUploadQueues[kind];
  assetUploadQueues[kind] = previous.then(() => released);
  return previous.then(() => {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      resolveReleased();
    };
  });
};

const holdAssetUploadSlotUntilSettled = (kind: AssetUploadKind, storagePath: string, releaseSlot: () => void) => {
  const grants = pendingAssetUploadGrants[kind];
  const settle = () => {
    clearTimeout(timer);
    if (grants.get(storagePath) === settle) grants.delete(storagePath);
    releaseSlot();
  };
  const timer = setTimeout(settle, ASSET_UPLOAD_SLOT_HOLD_MS);
  grants.get(storagePath)?.();
  grants.set(storagePath, settle);
};

const settleAssetUploadGrant = (kind: AssetUploadKind, storagePath?: string) => {
  if (!storagePath) return;
  pendingAssetUploadGrants[kind].get(storagePath)?.();
};

const hasOtherPendingAssetUploadGrant = (kind: AssetUploadKind, storagePath: string) =>
  Array.from(pendingAssetUploadGrants[kind].keys()).some((pendingPath) => pendingPath !== storagePath);

const isConcurrentUploadGrantError = (error: unknown) => {
  const code = String((error as any)?.code || '').replace(/^functions\//, '');
  const message = String((error as any)?.message || '');
  return code === 'failed-precondition' && /otra subida en curso/i.test(message);
};

const cancelAuthorizedAssetUpload = async (folder: AssetUploadKind, storagePath: string) => {
  if (!isFirebaseConfigured || !auth?.currentUser || !storagePath) {
    settleAssetUploadGrant(folder, storagePath);
    return;
  }
  try {
    const callable = firebase.app().functions('europe-west1').httpsCallable('cancelAssetUpload');
    await callable({ kind: folder, storagePath });
  } catch (error) {
    logStorageDebug('cancel-upload-authorization-failed', {
      folder,
      storagePath,
      error: getErrorMessage(error),
    });
  } finally {
    settleAssetUploadGrant(folder, storagePath);
  }
};

// Drops whatever grant the backend holds for this kind (e.g. one left behind
// by a closed tab or an upload that died before registering). Without a
// storagePath cancelAssetUpload removes the grant and its orphaned file.
const dropStaleAssetUploadGrant = async (folder: AssetUploadKind) => {
  try {
    const callable = firebase.app().functions('europe-west1').httpsCallable('cancelAssetUpload');
    await callable({ kind: folder });
    logStorageDebug('stale-upload-authorization-dropped', { folder });
  } catch (error) {
    logStorageDebug('stale-upload-authorization-drop-failed', {
      folder,
      error: getErrorMessage(error),
    });
  }
};

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

// The backend writes request `createdAt` as a Firestore Timestamp; the client
// model (and the local cache) expects an ISO string.
const mapCoachRequestDoc = (doc: { id: string; data: () => unknown }): CoachRequest => {
  const data = (doc.data() || {}) as any;
  return {
    id: doc.id,
    ...data,
    createdAt: toIsoStringMaybe(data.createdAt) || '',
  } as CoachRequest;
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
    // The gallery owner, never the record's own (client-written) claim.
    ownerId: userId,
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
    ownerId: userId,
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
    if (language === 'ing') return `You have reached the ${isVideo ? 'video' : 'PDF'} upload limit for your current billing cycle.`;
    if (language === 'eus') return `Uneko zikloko ${isVideo ? 'bideo' : 'PDF'} igoera-mugara iritsi zara.`;
    return `Has alcanzado el límite de subidas de ${isVideo ? 'vídeos' : 'PDFs'} de tu ciclo actual.`;
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

const resolveFromDownloadUrl = async (
  url: string,
  folder: 'videos' | 'plans',
  ownerId: string,
): Promise<AssetDownloadResolution | null> => {
  try {
    const ref = storage.refFromURL(url);
    if (!isOwnedAssetPath(ref.fullPath, folder, ownerId)) {
      return {
        errorCode: 'storage/invalid-asset-path',
        errorMessage: 'El registro del archivo apunta fuera de la carpeta de su propietario.',
      };
    }
    return await getReferenceDetails(ref);
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
  if (isOwnedAssetPath(storagePath, folder, userId)) candidatePaths.add(storagePath);
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
    const resolved = await resolveFromDownloadUrl(persistedUrl, folder, userId);
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
      await sendEmailVerificationMaybe(fbUser);
      const newUser: User = { id: fbUser.uid, username: cleanUsername, email: cleanUsername, createdAt: new Date().toISOString() };

      await db.collection("users").doc(fbUser.uid).set({ uid: fbUser.uid, email: cleanUsername, username: cleanUsername, profile: null, createdAt: newUser.createdAt });
      await db.collection("userdata").doc(fbUser.uid).set(sanitizeForFirestore(initialData));

      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));
      return newUser;
    }
    throw new Error('El servicio de autenticación no está disponible. Inténtalo de nuevo en unos segundos.');
  },

  login: async (username: string, password: string): Promise<User> => {
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (isFirebaseConfigured && auth) {
      const userCredential = await auth.signInWithEmailAndPassword(cleanUsername, cleanPassword);
      const fbUser = userCredential.user!;
      await resendEmailVerificationIfNeeded(fbUser);

      const userDoc = await db.collection("users").doc(fbUser.uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      if (!userDoc.exists && !userDoc.metadata.fromCache) {
        await ensureUserDocumentsExist(fbUser);
      }

      const user: User = { id: fbUser.uid, username: fbUser.email?.toLowerCase() || 'user', email: fbUser.email?.toLowerCase(), profile: (userData as any).profile, createdAt: new Date().toISOString() };
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
      return user;
    }
    throw new Error('El servicio de autenticación no está disponible. Inténtalo de nuevo en unos segundos.');
  },

  logout: async () => {
    if (isFirebaseConfigured && auth) await auth.signOut();
    localStorage.removeItem(CURRENT_USER_KEY);
  },

  getCurrentUser: (): User | null => {
    try { return JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || 'null'); } catch { return null; }
  },

  restoreCurrentUser: async (): Promise<User | null> => {
    const cachedUser = StorageService.getCurrentUser();
    if (!isFirebaseConfigured || !auth) {
      localStorage.removeItem(CURRENT_USER_KEY);
      return null;
    }

    const authenticatedUser = await waitForAuthReady(5000);
    if (!authenticatedUser || (cachedUser && cachedUser.id !== authenticatedUser.uid)) {
      localStorage.removeItem(CURRENT_USER_KEY);
      return null;
    }

    let userData: any = {};
    try {
      const userSnapshot = await db.collection('users').doc(authenticatedUser.uid).get({ source: 'server' as any });
      userData = userSnapshot.exists ? userSnapshot.data() || {} : {};
      if (!userSnapshot.exists) {
        await ensureUserDocumentsExist(authenticatedUser);
      }
    } catch (error) {
      if (!cachedUser) throw error;
      userData = cachedUser;
    }

    const restoredUser: User = {
      id: authenticatedUser.uid,
      username: authenticatedUser.email?.toLowerCase() || userData.username || cachedUser?.username || 'user',
      email: authenticatedUser.email?.toLowerCase() || userData.email || cachedUser?.email,
      profile: userData.profile || cachedUser?.profile,
      createdAt: toIsoStringMaybe(userData.createdAt) || cachedUser?.createdAt || new Date().toISOString(),
    };
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(restoredUser));
    return restoredUser;
  },

  updateUserProfile: async (userId: string, profile: UserProfile): Promise<User> => {
    const cleanedProfile = cleanDataForStorage(profile);
    if (canUseCloudPersistence(userId)) {
      // managedAthletes, coaches and subscriptionTier are server-managed (the
      // rules reject any client change). Leaving them out of the merge keeps
      // the server values even when this client's cached profile is stale.
      const {
        managedAthletes: _managedAthletes,
        coaches: _coaches,
        subscriptionTier: _subscriptionTier,
        ...writableProfile
      } = cleanedProfile as UserProfile;
      await db.collection("users").doc(userId).set({ profile: sanitizeForFirestore(writableProfile) }, { merge: true });
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
    if (canUseCloudPersistence(userId) && section !== 'videos' && section !== 'plans' && section !== 'usage') {
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
      if (cleanedVideo.storagePath) {
        await cancelAuthorizedAssetUpload('videos', cleanedVideo.storagePath);
      }
      throw callableError;
    } finally {
      // Registration consumed (or the catch cancelled) the upload grant.
      settleAssetUploadGrant('videos', cleanedVideo.storagePath);
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
      if (cleanedPlan.storagePath) {
        await cancelAuthorizedAssetUpload('plans', cleanedPlan.storagePath);
      }
      throw callableError;
    } finally {
      // Registration consumed (or the catch cancelled) the upload grant.
      settleAssetUploadGrant('plans', cleanedPlan.storagePath);
    }
  },

  // NEW V3: Fetch Global Quota Usage
  getCoachQuotaUsage: async (): Promise<CloudQuotaUsage | null> => {
    if (!isFirebaseConfigured || !isBrowserOnline()) return null;
    const currentAuthUser = await waitForAuthReady();
    if (!currentAuthUser) return null;

    const callableFunc = firebase.app().functions('europe-west1').httpsCallable('getCoachQuotaUsage');
    const result = await callableFunc();
    return result.data as CloudQuotaUsage;
  },

  // V3 Authoritative Video Storage Delete
  deleteVideoSafe: async (userId: string, videoId: string): Promise<void> => {
    if (canUseCloudPersistence(userId)) {
      const callableFunc = firebase.app().functions('europe-west1').httpsCallable('deleteVideoFromGallery');
      await callableFunc({ targetUserId: userId, assetId: videoId });
    }

    await removeAssetFromUserDataSection(userId, 'videos', videoId);
  },

  deletePlanSafe: async (userId: string, planId: string): Promise<void> => {
    if (canUseCloudPersistence(userId)) {
      const callableFunc = firebase.app().functions('europe-west1').httpsCallable('deletePdfFromGallery');
      await callableFunc({ targetUserId: userId, assetId: planId });
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

    const generatedAssetId = Date.now().toString();
    const path = customPath || buildUserAssetPath(folder, userId, generatedAssetId, file.name);
    const assetId = customPath
      ? getAssetIdFromStoragePath(path, folder, userId)
      : generatedAssetId;
    const contentType = getEffectiveUploadContentType(file, folder);
    if (folder === 'plans' && file.size > MAX_PDF_FILE_SIZE_BYTES) {
      throw new StorageUploadError('storage/file-too-large', 'El PDF supera el límite permitido de 50 MB.', null);
    }

    const releaseSlot = await acquireAssetUploadSlot(folder);
    let slotHandedOff = false;
    let uploadAuthorized = false;
    try {
      const authorizeUpload = firebase.app().functions('europe-west1').httpsCallable('authorizeAssetUpload');
      const authorizationRequest = {
        kind: folder,
        targetUserId: userId,
        assetId,
        storagePath: path,
        size: file.size,
        contentType,
      };
      try {
        await authorizeUpload(authorizationRequest);
      } catch (authorizationError) {
        // This tab serialises uploads per kind, so a live grant for another
        // file here is stale (closed tab, upload that never registered):
        // drop it and retry once.
        if (!isConcurrentUploadGrantError(authorizationError) || hasOtherPendingAssetUploadGrant(folder, path)) {
          throw authorizationError;
        }
        await dropStaleAssetUploadGrant(folder);
        await authorizeUpload(authorizationRequest);
      }
      uploadAuthorized = true;

      const ref = storage.ref(path);
      const snapshot = await ref.put(file, {
        contentType,
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
        contentType: metadata.contentType || contentType,
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

      // The grant stays alive until addVideoSafe/addPdfSafe registers the
      // file, so the next upload of this kind waits for that.
      holdAssetUploadSlotUntilSettled(folder, result.storagePath, releaseSlot);
      slotHandedOff = true;
      return result;
    } catch (error) {
      if (uploadAuthorized) {
        await cancelAuthorizedAssetUpload(folder, path);
      }
      console.error('Upload failed:', error);
      throw new StorageUploadError(
        getStorageErrorCode(error),
        getStorageUploadFailureMessage(error, folder),
        error,
      );
    } finally {
      if (!slotHandedOff) releaseSlot();
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

  // Both deletes are scoped to the gallery owner's folder: the URL/path comes
  // from an asset record (see isOwnedAssetPath).
  deleteFileFromCloud: async (url: string, folder: 'videos' | 'plans', ownerId: string) => {
    if (isFirebaseConfigured && url?.startsWith('http')) {
      try {
        const ref = storage.refFromURL(url);
        if (!isOwnedAssetPath(ref.fullPath, folder, ownerId)) {
          console.warn('[StorageService] Refusing to delete a file outside its owner folder', { folder, ownerId });
          return;
        }
        // Drops a still-pending upload grant for this exact file, if any.
        await cancelAuthorizedAssetUpload(folder, ref.fullPath);
        await ref.delete();
      } catch { }
    }
  },

  deleteFileByPath: async (path: string, folder: 'videos' | 'plans', ownerId: string) => {
    if (isFirebaseConfigured && path) {
      if (!isOwnedAssetPath(path, folder, ownerId)) {
        console.warn('[StorageService] Refusing to delete a file outside its owner folder', { folder, ownerId });
        return;
      }
      try {
        await cancelAuthorizedAssetUpload(folder, path);
        await storage.ref(path).delete();
      } catch { }
    }
  },

  getManagedAthletes: async (athleteIds: string[]): Promise<User[]> => {
    if (!isFirebaseConfigured || !isBrowserOnline() || athleteIds.length === 0) return [];
    // Tolerate per-athlete failures (e.g. a stale managedAthletes entry whose
    // relationship was revoked, which rules now reject) instead of failing all.
    const snapshots = await Promise.all(
      athleteIds.map((id) => db.collection("users").doc(id).get().catch(() => null))
    );
    return snapshots
      .filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot && snapshot.exists))
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

      const authenticatedUser = await waitForAuthReady();
      if (!authenticatedUser) {
        throw new Error('Debes iniciar sesión para consultar las solicitudes.');
      }
      const query = db.collection("requests")
        .where("athleteId", "==", authenticatedUser.uid)
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

        const requests = readResult.snapshot.docs.map(mapCoachRequestDoc);

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

    return snap.docs.map(mapCoachRequestDoc);
  },

  respondToCoachRequest: async (request: CoachRequest, accept: boolean, athleteUser: User) => {
    if (!isFirebaseConfigured || !isBrowserOnline()) return;
    // Server-authoritative: the callable flips the status and, on accept,
    // updates managedAthletes/coaches on both user docs (clients may not).
    const callableFunc = firebase.app().functions('europe-west1').httpsCallable('respondToCoachRequest');
    await callableFunc({ requestId: request.id, accept });
    const athleteEmail = request.athleteEmail.toLowerCase();
    const remainingRequests = getCachedPendingRequestsForEmail(athleteEmail)
      .filter((cachedRequest) => cachedRequest.id !== request.id);
    saveCachedPendingRequestsForEmail(athleteEmail, remainingRequests);
    pendingRequestsMemoryCache.delete(athleteEmail);
  },

  sendCoachRequest: async (_coach: User, athleteEmail: string) => {
    if (!isFirebaseConfigured) throw new Error("Solo disponible en modo nube.");
    if (!isBrowserOnline()) throw new Error("Sin conexión. Inténtalo de nuevo cuando vuelva Internet.");
    // Server-side callable: keeps user profiles non-enumerable and prevents
    // forged request documents (clients cannot write /requests).
    const callableFunc = firebase.app().functions('europe-west1').httpsCallable('sendCoachRequest');
    await callableFunc({ athleteEmail: athleteEmail.trim().toLowerCase() });
  },

  removeAthleteFromCoach: async (coachId: string, athleteId: string) => {
    if (isFirebaseConfigured) {
      try {
        // The callable revokes the relationship and cleans up both users'
        // relationship arrays server-side.
        const callableFunc = firebase.app().functions('europe-west1').httpsCallable('removeAthleteFromCoach');
        await callableFunc({ athleteId });
        console.log("Successfully removed athlete from coach:", { coachId, athleteId });
      } catch (e) {
        console.error("Error removing athlete from coach:", e);
        throw e; // Re-throw so the caller can handle it
      }
    }
  },

  deleteUser: async (userId: string) => {
    if (isFirebaseConfigured) {
      const callable = firebase.app().functions('europe-west1').httpsCallable('adminDeleteUser');
      await callable({ userId });
    }
    localStorage.removeItem(`${DATA_PREFIX}${userId}`);
  },

  deleteCurrentAccount: async () => {
    const authenticatedUser = await waitForAuthReady();
    if (!authenticatedUser) throw new Error('Debes iniciar sesión para eliminar la cuenta.');
    const localData = getLocalUserDataSnapshot(authenticatedUser.uid);
    const callable = firebase.app().functions('europe-west1').httpsCallable('deleteCurrentAccount');
    await callable();
    await Promise.allSettled([
      ...localData.videos.map((video) => VideoStorage.deleteVideo(video.id)),
      ...localData.plans.map((plan) => PlanStorage.deletePlan(plan.id)),
    ]);
    invalidateCache(authenticatedUser.uid);
    localStorage.removeItem(`${DATA_PREFIX}${authenticatedUser.uid}`);
    localStorage.removeItem(CURRENT_USER_KEY);
  },

  getSystemReport: async (): Promise<any[]> => {
    if (!isFirebaseConfigured) return [];
    const snap = await db.collection("users").get();
    const report: any[] = [];
    for (const d of snap.docs) {
      const u = { id: d.id, ...(d.data() as any) } as User;
      try {
        const data = await StorageService.getUserData(u.id);
        report.push({ user: u, stats: { videos: data.videos.length, plans: data.plans.length, strengthRecords: data.strengthRecords.length, competitionRecords: data.competitionRecords.length, trainingRecords: data.trainingRecords.length } });
      } catch (e) {
        // Keep the report usable even if one user's data can't be read.
        report.push({ user: u, stats: null, error: getErrorMessage(e) });
      }
    }
    return report;
  }
};
