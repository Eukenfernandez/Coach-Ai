
import { User, UserData, VideoFile, StrengthRecord, ThrowRecord, PlanFile, UserProfile, ExerciseDef, CoachRequest, UserUsage, SupplementItem } from '../types';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';

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

try {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const app = firebase.app();
  auth = app.auth();

  // COMPAT FIRESTORE INITIALIZATION
  db = app.firestore();

  // Enable persistence (equivalent to persistentLocalCache + persistentMultipleTabManager)
  db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    console.warn("Persistence could not be enabled:", err);
  });

  storage = app.storage();
  isFirebaseConfigured = true;
} catch (e) {
  console.error("Firebase failed to initialize:", e);
}

const USERS_KEY = 'coachai_users';
const CURRENT_USER_KEY = 'coachai_current_user';
const DATA_PREFIX = 'coachai_data_';
const REQUESTS_KEY = 'coachai_local_requests';

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
    return new Promise<void>((res) => tx.oncomplete = () => res());
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
  }
};

export const PlanStorage = {
  savePlan: async (id: string, blob: Blob) => {
    const db = await openDB();
    const tx = db.transaction(STORES.PLANS, 'readwrite');
    tx.objectStore(STORES.PLANS).put(blob, id);
  },
  getPlan: async (id: string) => {
    const db = await openDB();
    const req = db.transaction(STORES.PLANS, 'readonly').objectStore(STORES.PLANS).get(id);
    return new Promise<Blob | null>((res) => req.onsuccess = () => res(req.result || null));
  },
  deletePlan: async (id: string) => {
    const db = await openDB();
    db.transaction(STORES.PLANS, 'readwrite').objectStore(STORES.PLANS).delete(id);
  }
};

const _getLocalRequests = (): CoachRequest[] => {
  try { return JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]'); } catch { return []; }
};
const _saveLocalRequests = (requests: CoachRequest[]) => {
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
};

export const StorageService = {
  isCloudMode: (): boolean => isFirebaseConfigured,

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
    const initialData: UserData = {
      videos: [], plans: [], strengthRecords: [], competitionRecords: [], trainingRecords: [],
      customExercises: [], supplements: [], usage: getInitialUsage()
    };

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
    if (isFirebaseConfigured && !userId.startsWith('test-') && userId !== 'MASTER_GOD_EUKEN') {
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

  getUserData: async (userId: string): Promise<UserData> => {
    let data: any = null;
    const defaults: UserData = {
      videos: [], plans: [], strengthRecords: [], competitionRecords: [], trainingRecords: [],
      customExercises: [], supplements: [], usage: getInitialUsage()
    };

    if (isFirebaseConfigured && !userId.startsWith('test-') && userId !== 'MASTER_GOD_EUKEN') {
      const snap = await db.collection("userdata").doc(userId).get();
      if (snap.exists) {
        const cloudData = unwrapFromFirestore(snap.data());
        // Merge with defaults to ensure all fields exist even if cloud doc is partial
        data = { ...defaults, ...cloudData };
      }
    }
    if (!data) {
      const local = localStorage.getItem(`${DATA_PREFIX}${userId}`);
      data = local ? JSON.parse(local) : defaults;
    }
    if (!data.usage) data.usage = getInitialUsage();
    return data as UserData;
  },

  updateDataSection: async (userId: string, section: keyof UserData, value: any) => {
    const cleanedValue = cleanDataForStorage(value);
    if (isFirebaseConfigured && !userId.startsWith('test-') && userId !== 'MASTER_GOD_EUKEN') {
      await db.collection("userdata").doc(userId).set({ [section]: sanitizeForFirestore(cleanedValue) }, { merge: true });
    }
    const data = await StorageService.getUserData(userId);
    (data as any)[section] = cleanedValue;
    StorageService._saveLocalUserData(userId, data);
  },

  incrementUsage: async (userId: string, type: 'analysis' | 'chat' | 'plan') => {
    const data = await StorageService.getUserData(userId);
    if (type === 'analysis') data.usage.analysisCount++;
    if (type === 'chat') data.usage.chatCount++;
    if (type === 'plan') data.usage.plansCount++;
    await StorageService.updateDataSection(userId, 'usage', data.usage);
  },

  updateVideos: (userId: string, videos: VideoFile[]) => StorageService.updateDataSection(userId, 'videos', videos),
  updatePlans: (userId: string, plans: PlanFile[]) => StorageService.updateDataSection(userId, 'plans', plans),
  updateStrengthRecords: (userId: string, records: StrengthRecord[]) => StorageService.updateDataSection(userId, 'strengthRecords', records),
  updateCompetitionRecords: (userId: string, records: ThrowRecord[]) => StorageService.updateDataSection(userId, 'competitionRecords', records),
  updateTrainingRecords: (userId: string, records: ThrowRecord[]) => StorageService.updateDataSection(userId, 'trainingRecords', records),
  updateCustomExercises: (userId: string, ex: ExerciseDef[]) => StorageService.updateDataSection(userId, 'customExercises', ex),
  updateSupplements: (userId: string, items: SupplementItem[]) => StorageService.updateDataSection(userId, 'supplements', items),
  updateMatchRecords: (userId: string, records: any[]) => StorageService.updateDataSection(userId, 'matchRecords', records),

  uploadFile: async (userId: string, file: File, folder = 'videos', customPath?: string): Promise<string | null> => {
    if (!isFirebaseConfigured || userId.startsWith('test-') || userId === 'MASTER_GOD_EUKEN') return null;
    try {
      // Ensure path is safe even if customPath wasn't sanitized
      let path = customPath || `${folder}/${userId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

      const ref = storage.ref(path);
      const snap = await ref.put(file);
      return await snap.ref.getDownloadURL();
    } catch (e) {
      console.error("Upload failed:", e);
      return null;
    }
  },

  getDownloadUrlFromPath: async (path: string): Promise<string | null> => {
    if (!isFirebaseConfigured) return null;
    try {
      const ref = storage.ref(path);
      return await ref.getDownloadURL();
    } catch {
      return null;
    }
  },

  findPlanDownloadUrl: async (userId: string, plan: PlanFile): Promise<{ url: string, path?: string } | null> => {
    if (!isFirebaseConfigured || userId.startsWith('test-') || userId === 'MASTER_GOD_EUKEN') return null;
    let candidates: string[] = [];

    if (plan.storagePath) candidates.push(plan.storagePath);
    // Also try sanitized version if original name had spaces
    if (plan.id && plan.name) {
      candidates.push(`plans/${userId}/${plan.id}_${plan.name}`);
      const sanitized = plan.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      candidates.push(`plans/${userId}/${plan.id}_${sanitized}`);
    }

    for (const path of candidates) {
      const url = await StorageService.getDownloadUrlFromPath(path);
      if (url) return { url, path };
    }

    // List all and fuzzy match
    try {
      const folderRef = storage.ref(`plans/${userId}`);
      const list = await folderRef.listAll();
      const match = list.items.find(item => {
        const name = item.name || "";
        return (plan.name && name.endsWith(plan.name)) || (plan.id && name.startsWith(plan.id));
      });
      if (match) {
        const url = await match.getDownloadURL();
        return { url, path: match.fullPath };
      }
    } catch { }

    return null;
  },

  deleteFileFromCloud: async (url: string) => {
    if (isFirebaseConfigured && url?.startsWith('http')) {
      try { await storage.refFromURL(url).delete(); } catch { }
    }
  },

  getManagedAthletes: async (athleteIds: string[]): Promise<User[]> => {
    const athletes: User[] = [];
    if (isFirebaseConfigured) {
      for (const id of athleteIds) {
        const snap = await db.collection("users").doc(id).get();
        if (snap.exists) athletes.push({ id: snap.id, ...(snap.data() as any) } as User);
      }
    }
    return athletes;
  },

  getPendingRequests: async (userEmail: string): Promise<CoachRequest[]> => {
    if (!isFirebaseConfigured) return [];
    const snap = await db.collection("requests")
      .where("athleteEmail", "==", userEmail.toLowerCase())
      .where("status", "==", "pending")
      .get();

    return snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as CoachRequest));
  },

  respondToCoachRequest: async (request: CoachRequest, accept: boolean, athleteUser: User) => {
    if (!isFirebaseConfigured) return;
    await db.collection("requests").doc(request.id).update({ status: accept ? 'accepted' : 'rejected' });
    if (accept) {
      await db.collection("users").doc(request.coachId).update({ "profile.managedAthletes": firebase.firestore.FieldValue.arrayUnion(athleteUser.id) });
      const current = athleteUser.profile?.coaches || [];
      await StorageService.updateUserProfile(athleteUser.id, { ...athleteUser.profile!, coaches: [...current, request.coachId] });
    }
  },

  sendCoachRequest: async (coach: User, athleteEmail: string) => {
    if (!isFirebaseConfigured) throw new Error("Solo disponible en modo nube.");
    const snap = await db.collection("users").where("username", "==", athleteEmail.toLowerCase()).get();
    if (snap.empty) throw new Error("Atleta no encontrado.");

    await db.collection("requests").add({
      coachId: coach.id,
      coachName: `${coach.profile?.firstName} ${coach.profile?.lastName}`,
      athleteEmail: athleteEmail.toLowerCase(),
      status: 'pending',
      createdAt: new Date().toISOString()
    });
  },

  removeAthleteFromCoach: async (coachId: string, athleteId: string) => {
    if (isFirebaseConfigured) {
      await db.collection("users").doc(coachId).update({ "profile.managedAthletes": firebase.firestore.FieldValue.arrayRemove(athleteId) });
      await db.collection("users").doc(athleteId).update({ "profile.coaches": firebase.firestore.FieldValue.arrayRemove(coachId) });
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
