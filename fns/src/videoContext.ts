import { randomUUID } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';

import {
  buildRetrievalTrace,
  formatCompactStructuredAnswer,
  pickKeyMomentsForQuestion,
  rankSegmentsForQuestion,
  PersistedKeyMoment,
  PersistedSegment,
  StructuredVideoAnswer,
  VideoQuestionMode,
} from './video-intelligence/core.js';
import {
  buildVideoContextProcessingPrompt,
  buildVideoQuestionPrompt,
  VIDEO_ANSWER_SCHEMA,
  VIDEO_CONTEXT_SCHEMA,
} from './video-intelligence/prompts.js';

if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();
const storage = getStorage();
const geminiApiKey = defineSecret('GEMINI_API_KEY');

type AppLanguage = 'es' | 'ing' | 'eus';
type VideoContextStatus =
  | 'not_started'
  | 'queued'
  | 'sampling'
  | 'summarizing'
  | 'partial'
  | 'ready'
  | 'failed';

interface SportContext {
  sport?: string;
  discipline?: string;
}

interface FrameArtifactPayload {
  timestampSeconds: number;
  label: string;
  base64Jpeg: string;
  width: number;
  height: number;
}

interface SegmentPlanPayload {
  id: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  representativeTimeSeconds: number;
  label: string;
}

interface MetadataPayload {
  durationSeconds: number;
  width: number;
  height: number;
  estimatedFps?: number | null;
  frameCountEstimate?: number | null;
  aspectRatio?: number | null;
  orientation?: 'landscape' | 'portrait' | 'square';
  mimeType?: string;
  sizeBytes?: number;
}

interface HistoryEntry {
  role: 'user' | 'model';
  text: string;
  activeTimestampSeconds?: number | null;
  mode?: VideoQuestionMode | null;
}

interface PoseSnapshotPayload {
  source: 'mediapipe';
  joints: Record<string, { x: number; y: number; visibility?: number }>;
}

interface UpsertVideoContextPayload {
  targetUserId?: unknown;
  videoId?: unknown;
  videoName?: unknown;
  videoUrl?: unknown;
  storagePath?: unknown;
  metadata?: unknown;
  segments?: unknown;
  sampleFrames?: unknown;
  samplingProfile?: unknown;
  language?: unknown;
  sportContext?: unknown;
  force?: unknown;
}

interface NormalizedUpsertVideoContextInput {
  targetUserId: string;
  videoId: string;
  videoName: string;
  videoUrl: string | null;
  storagePath: string | null;
  metadata: MetadataPayload;
  segmentPlan: SegmentPlanPayload[];
  sampleFrames: FrameArtifactPayload[];
  samplingProfile: string;
  language: AppLanguage;
  sportContext: SportContext;
  force: boolean;
}

interface VideoGalleryRecord {
  id?: string;
  name?: string;
  remoteUrl?: string;
  downloadURL?: string;
  storagePath?: string;
  isUploading?: boolean;
  uploadedByCoachId?: string | null;
  uploadedAt?: unknown;
}

interface VideoRecordLookupResult {
  source: 'subcollection' | 'userdata_array' | 'missing';
  record: VideoGalleryRecord | null;
}

interface ParsedStorageLocation {
  bucketName: string;
  storagePath: string;
}

interface ResolvedVideoStorageReference {
  bucketName: string;
  storagePath: string;
  videoUrl: string | null;
}

interface StorageObjectVerification {
  bucketName: string;
  storagePath: string;
  sizeBytes: number | null;
  contentType: string | null;
  updated: string | null;
}

const PREMIUM_EMAILS = [
  'alejandrosanchez@gmail.com',
  'peioetxabe@hotmail.com',
  'fernandezeuken@gmail.com',
  'julianweber@gmail.com',
];

const PROCESSING_VERSION = 'video-context-v1';
const MAX_SAMPLE_FRAMES = 12;
const MAX_QUERY_FRAMES = 7;
const UPLOAD_IN_PROGRESS_STAGE = 'waiting_for_video';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const resolveUserTier = (uid: string, userEmail: string | undefined, userData: any): string => {
  if (userEmail && PREMIUM_EMAILS.includes(String(userEmail).toLowerCase())) return 'PREMIUM';
  if (uid.startsWith('test-')) {
    if (uid.includes('premium')) return 'PREMIUM';
    if (uid.includes('pro')) return 'PRO_ATHLETE';
    return 'FREE';
  }
  return userData?.currentPlanId || userData?.profile?.subscriptionTier || 'FREE';
};

const resolveAllowedModelForTier = (tier: string): string => {
  switch (tier) {
    case 'PREMIUM':
    case 'ATLETA_PREMIUM':
    case 'PRO_COACH':
      return 'gemini-2.5-pro';
    case 'PRO_ATHLETE':
    case 'ATLETA_PRO':
    case 'FREE':
    default:
      return 'gemini-2.5-flash';
  }
};

const normalizeLanguage = (value: string | undefined): AppLanguage =>
  value === 'ing' || value === 'eus' ? value : 'es';

const normalizeConfidence = (value: unknown): 'low' | 'medium' | 'high' => {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('high') || normalized.includes('alta') || normalized.includes('handia')) return 'high';
  if (normalized.includes('low') || normalized.includes('baja') || normalized.includes('txiki')) return 'low';
  return 'medium';
};

const sanitizeText = (value: unknown, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  return value.trim();
};

const sanitizeOptionalText = (value: unknown) => {
  const sanitized = sanitizeText(value);
  return sanitized || null;
};

const ensureStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item))
    .filter(Boolean)
    .slice(0, 6);
};

const clampNumber = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Number(Math.min(max, Math.max(min, parsed)).toFixed(3));
};

const sanitizeErrorMessage = (error: unknown, fallback = 'Unexpected error.') => {
  if (error instanceof Error) return sanitizeText(error.message, fallback);
  if (isRecord(error)) return sanitizeText(error.message, fallback);
  return fallback;
};

const parseBoolean = (value: unknown) => value === true || value === 'true';

const normalizeMetadataPayload = (value: unknown): MetadataPayload => {
  if (!isRecord(value)) {
    throw new HttpsError('invalid-argument', 'El campo metadata es obligatorio y debe ser un objeto.');
  }

  const durationSeconds = clampNumber(value.durationSeconds, 0);
  const width = clampNumber(value.width, 0);
  const height = clampNumber(value.height, 0);

  if (durationSeconds <= 0) {
    throw new HttpsError('invalid-argument', 'metadata.durationSeconds debe ser mayor que 0.');
  }

  if (width <= 0 || height <= 0) {
    throw new HttpsError('invalid-argument', 'metadata.width y metadata.height deben ser mayores que 0.');
  }

  const mimeType = sanitizeText(value.mimeType);

  return {
    durationSeconds,
    width,
    height,
    estimatedFps:
      value.estimatedFps === null || value.estimatedFps === undefined
        ? null
        : clampNumber(value.estimatedFps, 0),
    frameCountEstimate:
      value.frameCountEstimate === null || value.frameCountEstimate === undefined
        ? null
        : clampNumber(value.frameCountEstimate, 0),
    aspectRatio:
      value.aspectRatio === null || value.aspectRatio === undefined
        ? width && height
          ? Number((width / height).toFixed(4))
          : null
        : clampNumber(value.aspectRatio, 0),
    orientation:
      width === height ? 'square' : width > height ? 'landscape' : 'portrait',
    mimeType: mimeType || undefined,
    sizeBytes:
      value.sizeBytes === null || value.sizeBytes === undefined
        ? undefined
        : clampNumber(value.sizeBytes, 0),
  };
};

const normalizeSegmentPlanPayload = (
  value: unknown,
  durationSeconds: number,
): SegmentPlanPayload[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpsError('invalid-argument', 'El payload debe incluir segments con al menos un tramo.');
  }

  return value.slice(0, MAX_SAMPLE_FRAMES).map((rawSegment, index) => {
    if (!isRecord(rawSegment)) {
      throw new HttpsError('invalid-argument', `segments[${index}] no tiene un formato válido.`);
    }

    const startTimeSeconds = clampNumber(rawSegment.startTimeSeconds, 0, durationSeconds);
    const endTimeSeconds = clampNumber(
      rawSegment.endTimeSeconds,
      startTimeSeconds,
      durationSeconds,
    );

    if (endTimeSeconds <= startTimeSeconds) {
      throw new HttpsError(
        'invalid-argument',
        `segments[${index}] tiene un rango temporal inválido.`,
      );
    }

    return {
      id: sanitizeText(rawSegment.id, `segment_${index + 1}`),
      startTimeSeconds,
      endTimeSeconds,
      representativeTimeSeconds: clampNumber(
        rawSegment.representativeTimeSeconds ?? (startTimeSeconds + endTimeSeconds) / 2,
        startTimeSeconds,
        endTimeSeconds,
      ),
      label: sanitizeText(rawSegment.label, `Segment ${index + 1}`),
    };
  });
};

const normalizeSampleFramesPayload = (value: unknown): FrameArtifactPayload[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpsError(
      'invalid-argument',
      'El payload debe incluir sampleFrames con al menos una captura.',
    );
  }

  return value.slice(0, MAX_SAMPLE_FRAMES).map((rawFrame, index) => {
    if (!isRecord(rawFrame)) {
      throw new HttpsError('invalid-argument', `sampleFrames[${index}] no tiene un formato válido.`);
    }

    const base64Jpeg = sanitizeText(rawFrame.base64Jpeg);
    if (!base64Jpeg) {
      throw new HttpsError(
        'invalid-argument',
        `sampleFrames[${index}].base64Jpeg es obligatorio.`,
      );
    }

    return {
      timestampSeconds: clampNumber(rawFrame.timestampSeconds, 0),
      label: sanitizeText(rawFrame.label, `Frame ${index + 1}`),
      base64Jpeg,
      width: clampNumber(rawFrame.width, 1),
      height: clampNumber(rawFrame.height, 1),
    };
  });
};

const normalizeSportContextPayload = (value: unknown): SportContext => {
  if (!isRecord(value)) {
    return {};
  }

  return {
    sport: sanitizeText(value.sport),
    discipline: sanitizeText(value.discipline),
  };
};

const normalizeUpsertVideoContextInput = (
  data: unknown,
  callerId: string,
): NormalizedUpsertVideoContextInput => {
  if (!isRecord(data)) {
    throw new HttpsError('invalid-argument', 'El payload de upsertVideoContext es inválido.');
  }

  const videoId = sanitizeText(data.videoId);
  if (!videoId) {
    throw new HttpsError('invalid-argument', 'videoId es obligatorio.');
  }

  const videoUrl = sanitizeOptionalText(data.videoUrl);
  const storagePath = sanitizeOptionalText(data.storagePath);

  if (!videoUrl && !storagePath) {
    throw new HttpsError(
      'invalid-argument',
      'Debes enviar al menos videoUrl o storagePath para verificar el vídeo.',
    );
  }

  const metadata = normalizeMetadataPayload(data.metadata);

  return {
    targetUserId: sanitizeText(data.targetUserId, callerId),
    videoId,
    videoName: sanitizeText(data.videoName),
    videoUrl,
    storagePath,
    metadata,
    segmentPlan: normalizeSegmentPlanPayload(data.segments, metadata.durationSeconds),
    sampleFrames: normalizeSampleFramesPayload(data.sampleFrames),
    samplingProfile: sanitizeText(data.samplingProfile, 'standard'),
    language: normalizeLanguage(sanitizeText(data.language)),
    sportContext: normalizeSportContextPayload(data.sportContext),
    force: parseBoolean(data.force),
  };
};

const toLoggableVideoUrl = (value: string | null | undefined) => {
  if (!value) return null;

  try {
    const url = new URL(value);
    url.search = '';
    return url.toString();
  } catch {
    return value;
  }
};

const decodeStoragePath = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const parseStorageLocationFromUrl = (value: string | null | undefined): ParsedStorageLocation | null => {
  const rawValue = sanitizeText(value);
  if (!rawValue) return null;

  if (rawValue.startsWith('gs://')) {
    const withoutProtocol = rawValue.slice('gs://'.length);
    const slashIndex = withoutProtocol.indexOf('/');
    if (slashIndex <= 0) return null;

    return {
      bucketName: withoutProtocol.slice(0, slashIndex),
      storagePath: withoutProtocol.slice(slashIndex + 1),
    };
  }

  try {
    const parsedUrl = new URL(rawValue);

    const firebaseMatch = parsedUrl.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (firebaseMatch) {
      return {
        bucketName: firebaseMatch[1],
        storagePath: decodeStoragePath(firebaseMatch[2]),
      };
    }

    const storageApiMatch = parsedUrl.pathname.match(/^\/download\/storage\/v1\/b\/([^/]+)\/o\/(.+)$/);
    if (storageApiMatch) {
      return {
        bucketName: storageApiMatch[1],
        storagePath: decodeStoragePath(storageApiMatch[2]),
      };
    }

    if (parsedUrl.hostname === 'storage.googleapis.com') {
      const segments = parsedUrl.pathname.split('/').filter(Boolean);
      if (segments.length >= 2) {
        return {
          bucketName: segments[0],
          storagePath: decodeStoragePath(segments.slice(1).join('/')),
        };
      }
    }
  } catch {
    return null;
  }

  return null;
};

const assertConsistentVideoReferences = ({
  payloadVideoUrl,
  payloadStoragePath,
  firestoreVideoUrl,
  firestoreStoragePath,
}: {
  payloadVideoUrl: string | null;
  payloadStoragePath: string | null;
  firestoreVideoUrl: string | null;
  firestoreStoragePath: string | null;
}) => {
  const payloadUrlLocation = parseStorageLocationFromUrl(payloadVideoUrl);
  const firestoreUrlLocation = parseStorageLocationFromUrl(firestoreVideoUrl);

  if (
    payloadStoragePath &&
    payloadUrlLocation?.storagePath &&
    payloadStoragePath !== payloadUrlLocation.storagePath
  ) {
    throw new HttpsError(
      'failed-precondition',
      'El payload es inconsistente: videoUrl y storagePath apuntan a objetos distintos.',
    );
  }

  if (
    firestoreStoragePath &&
    firestoreUrlLocation?.storagePath &&
    firestoreStoragePath !== firestoreUrlLocation.storagePath
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Firestore contiene un videoUrl y un storagePath incoherentes para este vídeo.',
    );
  }

  if (payloadStoragePath && firestoreStoragePath && payloadStoragePath !== firestoreStoragePath) {
    throw new HttpsError(
      'failed-precondition',
      'El storagePath enviado no coincide con el registrado en Firestore.',
    );
  }

  if (
    payloadUrlLocation?.storagePath &&
    firestoreStoragePath &&
    payloadUrlLocation.storagePath !== firestoreStoragePath
  ) {
    throw new HttpsError(
      'failed-precondition',
      'El videoUrl enviado no coincide con el storagePath registrado en Firestore.',
    );
  }
};

const getVideoDocRef = (userId: string, videoId: string) =>
  db.collection('userdata').doc(userId).collection('videos').doc(videoId);

const readVideoGalleryRecord = async (
  userId: string,
  videoId: string,
): Promise<VideoRecordLookupResult> => {
  const subcollectionSnap = await getVideoDocRef(userId, videoId).get();
  if (subcollectionSnap.exists) {
    return {
      source: 'subcollection',
      record: subcollectionSnap.data() as VideoGalleryRecord,
    };
  }

  const userDataSnap = await db.collection('userdata').doc(userId).get();
  const videos = Array.isArray(userDataSnap.data()?.videos) ? userDataSnap.data()?.videos : [];
  const found = videos.find((video: any) => sanitizeText(video?.id) === videoId) || null;

  return {
    source: found ? 'userdata_array' : 'missing',
    record: found as VideoGalleryRecord | null,
  };
};

const resolveVideoStorageReference = ({
  input,
  videoRecord,
}: {
  input: NormalizedUpsertVideoContextInput;
  videoRecord: VideoGalleryRecord | null;
}): ResolvedVideoStorageReference => {
  const firestoreVideoUrl = sanitizeOptionalText(videoRecord?.downloadURL || videoRecord?.remoteUrl);
  const firestoreStoragePath = sanitizeOptionalText(videoRecord?.storagePath);

  assertConsistentVideoReferences({
    payloadVideoUrl: input.videoUrl,
    payloadStoragePath: input.storagePath,
    firestoreVideoUrl,
    firestoreStoragePath,
  });

  const parsedPayloadUrl = parseStorageLocationFromUrl(input.videoUrl);
  const parsedFirestoreUrl = parseStorageLocationFromUrl(firestoreVideoUrl);

  const storagePath =
    input.storagePath ||
    firestoreStoragePath ||
    parsedPayloadUrl?.storagePath ||
    parsedFirestoreUrl?.storagePath ||
    null;

  if (!storagePath) {
    throw new HttpsError(
      'invalid-argument',
      'No se pudo resolver un storagePath válido a partir del payload o Firestore.',
    );
  }

  return {
    bucketName:
      parsedPayloadUrl?.bucketName ||
      parsedFirestoreUrl?.bucketName ||
      storage.bucket().name,
    storagePath,
    videoUrl: input.videoUrl || firestoreVideoUrl || null,
  };
};

const verifyStorageObject = async (
  reference: ResolvedVideoStorageReference,
): Promise<StorageObjectVerification> => {
  const bucket = storage.bucket(reference.bucketName);
  const file = bucket.file(reference.storagePath);
  const [exists] = await file.exists();

  if (!exists) {
    throw new HttpsError(
      'not-found',
      `No existe ningún archivo en Storage para ${reference.storagePath}.`,
    );
  }

  const [metadata] = await file.getMetadata();

  return {
    bucketName: reference.bucketName,
    storagePath: reference.storagePath,
    sizeBytes: metadata.size ? Number(metadata.size) : null,
    contentType: metadata.contentType || null,
    updated: metadata.updated || null,
  };
};

const assertStorageObjectReady = ({
  verification,
  videoRecord,
}: {
  verification: StorageObjectVerification;
  videoRecord: VideoGalleryRecord | null;
}) => {
  if (videoRecord?.isUploading) {
    throw new HttpsError(
      'failed-precondition',
      'El vídeo todavía figura como uploading en Firestore. Reintenta cuando termine la subida.',
    );
  }

  if (!verification.sizeBytes || verification.sizeBytes <= 0) {
    throw new HttpsError(
      'failed-precondition',
      'El vídeo existe en Storage pero todavía no está listo para ser procesado.',
    );
  }

  const contentType = sanitizeText(verification.contentType || '').toLowerCase();
  if (contentType && !contentType.startsWith('video/')) {
    throw new HttpsError(
      'failed-precondition',
      `El archivo de Storage no parece un vídeo válido (contentType: ${contentType}).`,
    );
  }
};

const getConfiguredGeminiApiKey = () => {
  const apiKey = sanitizeText(geminiApiKey.value());
  if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
    throw new HttpsError(
      'failed-precondition',
      'La Cloud Function no tiene GEMINI_API_KEY configurada correctamente.',
    );
  }

  return apiKey;
};

const buildUpsertVideoContextLog = ({
  requestId,
  callerId,
  input,
}: {
  requestId: string;
  callerId: string;
  input: NormalizedUpsertVideoContextInput;
}) => ({
  requestId,
  callerId,
  targetUserId: input.targetUserId,
  videoId: input.videoId,
  videoName: input.videoName,
  language: input.language,
  samplingProfile: input.samplingProfile,
  sampleFrameCount: input.sampleFrames.length,
  segmentPlanCount: input.segmentPlan.length,
  storagePath: input.storagePath,
  videoUrl: toLoggableVideoUrl(input.videoUrl),
  metadata: {
    durationSeconds: input.metadata.durationSeconds,
    width: input.metadata.width,
    height: input.metadata.height,
    mimeType: input.metadata.mimeType || null,
    sizeBytes: input.metadata.sizeBytes ?? null,
  },
  sportContext: {
    sport: input.sportContext.sport || '',
    discipline: input.sportContext.discipline || '',
  },
  force: input.force,
});

const persistContextErrorState = async ({
  contextRef,
  error,
  processingStage,
  requestId,
}: {
  contextRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
  error: HttpsError;
  processingStage: string;
  requestId: string;
}) => {
  await contextRef.set(
    {
      status: error.code === 'failed-precondition' ? 'queued' : 'failed',
      processingStage,
      lastError: error.message,
      lastErrorCode: error.code,
      lastRequestId: requestId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
};

const toHttpsError = (
  error: unknown,
  fallbackCode: HttpsError['code'],
  fallbackMessage: string,
) => {
  if (error instanceof HttpsError) {
    return error;
  }

  const errorMessage = sanitizeErrorMessage(error, fallbackMessage);

  if (/api key|secret|gemini_api_key/i.test(errorMessage)) {
    return new HttpsError(
      'failed-precondition',
      'La integración de Gemini no está configurada correctamente en el backend.',
    );
  }

  if (error instanceof SyntaxError) {
    return new HttpsError(
      'internal',
      'La respuesta del modelo no se pudo parsear como JSON válido.',
    );
  }

  return new HttpsError(fallbackCode, fallbackMessage);
};

const parseJsonResponse = (rawText: string) => {
  const cleaned = rawText
    .trim()
    .replace(/^```json/i, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim();
  return JSON.parse(cleaned);
};

const getUserTier = async (uid: string, email: string | undefined) => {
  const userSnap = await db.collection('users').doc(uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  return resolveUserTier(uid, email, userData);
};

const validateTargetAccess = async (callerId: string, targetUserId: string) => {
  if (callerId === targetUserId) return;
  const relationSnap = await db.collection('requests').doc(`${callerId}_${targetUserId}`).get();
  if (!relationSnap.exists || relationSnap.data()?.status !== 'accepted') {
    throw new HttpsError(
      'permission-denied',
      `No tienes acceso a los datos del usuario ${targetUserId}.`,
    );
  }
};

const getContextRef = (userId: string, videoId: string) =>
  db.collection('userdata').doc(userId).collection('videoContexts').doc(videoId);

const getSegmentsRef = (userId: string, videoId: string) =>
  getContextRef(userId, videoId).collection('segments');

const getSessionsRef = (userId: string, videoId: string) =>
  getContextRef(userId, videoId).collection('chatSessions');

const buildGenerationParts = (prompt: string, frames: FrameArtifactPayload[]) => {
  const parts: any[] = [{ text: prompt }];

  frames.forEach((frame, index) => {
    parts.push({
      text: `Frame ${index + 1}: ${frame.label} at ${frame.timestampSeconds.toFixed(3)}s.`,
    });
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: frame.base64Jpeg,
      },
    });
  });

  return parts;
};

const embedText = async (
  genAI: GoogleGenerativeAI,
  text: string,
  taskType: TaskType,
) => {
  if (!text.trim()) return [];
  const embedModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  const result = await embedModel.embedContent({
    content: {
      role: 'user',
      parts: [{ text }],
    },
    taskType,
  });

  return result.embedding.values || [];
};

const persistSegments = async (
  userId: string,
  videoId: string,
  segments: PersistedSegment[],
) => {
  const batch = db.batch();
  const segmentsRef = getSegmentsRef(userId, videoId);
  const existing = await segmentsRef.get();
  existing.docs.forEach((doc) => batch.delete(doc.ref));
  segments.forEach((segment) => batch.set(segmentsRef.doc(segment.id), segment));
  await batch.commit();
};

const normalizeSegments = (
  rawSegments: any[],
  segmentPlan: SegmentPlanPayload[],
  durationSeconds: number,
) => {
  const fallbackSegments = rawSegments.length > 0 ? rawSegments : segmentPlan;

  return fallbackSegments.map((rawSegment, index) => {
    const fallback = segmentPlan[index] || segmentPlan[segmentPlan.length - 1];
    const startTimeSeconds = clampNumber(
      rawSegment?.startTimeSeconds ?? fallback?.startTimeSeconds ?? 0,
      0,
      durationSeconds,
    );
    const endTimeSeconds = clampNumber(
      rawSegment?.endTimeSeconds ?? fallback?.endTimeSeconds ?? durationSeconds,
      startTimeSeconds,
      durationSeconds,
    );
    const representativeTimeSeconds = clampNumber(
      rawSegment?.representativeTimeSeconds ??
        fallback?.representativeTimeSeconds ??
        (startTimeSeconds + endTimeSeconds) / 2,
      startTimeSeconds,
      endTimeSeconds,
    );

    const segment: PersistedSegment = {
      id: sanitizeText(rawSegment?.segmentId, fallback?.id || `segment_${index + 1}`),
      startTimeSeconds,
      endTimeSeconds,
      representativeTimeSeconds,
      phaseLabel: sanitizeText(rawSegment?.phaseLabel, fallback?.label || `Segment ${index + 1}`),
      summary: sanitizeText(
        rawSegment?.summary,
        'No hay suficiente información visual para resumir este tramo con más precisión.',
      ),
      visibleObservations: ensureStringArray(rawSegment?.visibleObservations),
      technicalFocus: ensureStringArray(rawSegment?.technicalFocus),
      probableErrors: ensureStringArray(rawSegment?.probableErrors),
      coachingCues: ensureStringArray(rawSegment?.coachingCues),
      confidence: normalizeConfidence(rawSegment?.confidence),
      embedding: [],
    };

    return segment;
  });
};

const normalizeKeyMoments = (
  rawKeyMoments: any[],
  segments: PersistedSegment[],
  durationSeconds: number,
): PersistedKeyMoment[] => {
  if (!Array.isArray(rawKeyMoments) || rawKeyMoments.length === 0) {
    return segments.slice(0, 3).map((segment) => ({
      id: `moment_${segment.id}`,
      timestampSeconds: segment.representativeTimeSeconds,
      label: segment.phaseLabel,
      note: segment.summary,
      phaseLabel: segment.phaseLabel,
      confidence: segment.confidence,
    }));
  }

  return rawKeyMoments.slice(0, 5).map((rawMoment: any, index: number) => ({
    id: `moment_${index + 1}`,
    timestampSeconds: clampNumber(rawMoment?.timestampSeconds, 0, durationSeconds),
    label: sanitizeText(rawMoment?.label, `Momento ${index + 1}`),
    note: sanitizeText(rawMoment?.note, 'Momento relevante detectado en el gesto.'),
    phaseLabel: sanitizeText(rawMoment?.phaseLabel),
    confidence: normalizeConfidence(rawMoment?.confidence),
  }));
};

const enrichSegmentsWithEmbeddings = async (genAI: GoogleGenerativeAI, segments: PersistedSegment[]) => {
  const embeddings = await Promise.all(
    segments.map((segment) =>
      embedText(
        genAI,
        [segment.phaseLabel, segment.summary, ...segment.technicalFocus, ...segment.probableErrors]
          .filter(Boolean)
          .join('\n'),
        TaskType.RETRIEVAL_DOCUMENT,
      ).catch(() => []),
    ),
  );

  return segments.map((segment, index) => ({
    ...segment,
    embedding: embeddings[index],
  }));
};

const readPersistedSegments = async (userId: string, videoId: string) => {
  const snapshot = await getSegmentsRef(userId, videoId).orderBy('startTimeSeconds').get();
  return snapshot.docs.map((doc) => doc.data() as PersistedSegment);
};

const executeUpsertVideoContextFlow = async ({
  request,
  callerId,
  callerEmail,
  requestId,
  input,
  logContext,
}: {
  request: CallableRequest<any>;
  callerId: string;
  callerEmail?: string;
  requestId: string;
  input: NormalizedUpsertVideoContextInput;
  logContext: ReturnType<typeof buildUpsertVideoContextLog>;
}) => {
  const contextRef = getContextRef(input.targetUserId, input.videoId);

  try {
    const [videoLookup, contextSnap] = await Promise.all([
      readVideoGalleryRecord(input.targetUserId, input.videoId),
      contextRef.get(),
    ]);

    logger.info('[upsertVideoContext] firestore_video_lookup', {
      requestId,
      videoId: input.videoId,
      targetUserId: input.targetUserId,
      lookupSource: videoLookup.source,
      hasVideoRecord: Boolean(videoLookup.record),
      firestoreStoragePath: sanitizeOptionalText(videoLookup.record?.storagePath),
        firestoreVideoUrl: toLoggableVideoUrl(videoLookup.record?.downloadURL || videoLookup.record?.remoteUrl || null),
      firestoreIsUploading: Boolean(videoLookup.record?.isUploading),
    });

    if (!videoLookup.record) {
      throw new HttpsError(
        'failed-precondition',
        'No existe un documento de vídeo coherente en Firestore para este videoId.',
      );
    }

    if (!input.force && contextSnap.exists) {
      const existingContext = contextSnap.data() as Record<string, unknown>;
      const currentStatus = sanitizeText(existingContext?.status);
      const currentStage = sanitizeText(existingContext?.processingStage);

      if (
        (currentStatus === 'ready' || currentStatus === 'partial') &&
        sanitizeText(existingContext?.processingVersion) === PROCESSING_VERSION
      ) {
        logger.info('[upsertVideoContext] skip_existing_context', {
          requestId,
          videoId: input.videoId,
          status: currentStatus,
          processingStage: currentStage || null,
        });

        return {
          status: currentStatus,
          reusedExistingContext: true,
          segmentCount: clampNumber(existingContext?.segmentCount, 0),
          keyMomentCount: Array.isArray(existingContext?.keyMoments)
            ? existingContext.keyMoments.length
            : 0,
        };
      }

      if (currentStage === 'summarizing') {
        logger.info('[upsertVideoContext] already_summarizing', {
          requestId,
          videoId: input.videoId,
          status: currentStatus || 'summarizing',
        });

        return {
          status: currentStatus || 'summarizing',
          alreadyInProgress: true,
          segmentCount: clampNumber(existingContext?.segmentCount, 0),
          keyMomentCount: Array.isArray(existingContext?.keyMoments)
            ? existingContext.keyMoments.length
            : 0,
        };
      }
    }

    const resolvedReference = resolveVideoStorageReference({
      input,
      videoRecord: videoLookup.record,
    });

    logger.info('[upsertVideoContext] storage_reference_resolved', {
      requestId,
      videoId: input.videoId,
      targetUserId: input.targetUserId,
      storagePath: resolvedReference.storagePath,
      bucketName: resolvedReference.bucketName,
      videoUrl: toLoggableVideoUrl(resolvedReference.videoUrl),
    });

    let verification: StorageObjectVerification;
    try {
      verification = await verifyStorageObject(resolvedReference);
      logger.info('[upsertVideoContext] storage_exists', {
        requestId,
        videoId: input.videoId,
        storagePath: verification.storagePath,
        bucketName: verification.bucketName,
        sizeBytes: verification.sizeBytes,
        contentType: verification.contentType,
        updated: verification.updated,
      });
    } catch (error) {
      if (
        error instanceof HttpsError &&
        error.code === 'not-found' &&
        videoLookup.record.isUploading
      ) {
        throw new HttpsError(
          'failed-precondition',
          'El vídeo aún no está disponible en Storage. Reintenta cuando termine la subida.',
        );
      }

      throw error;
    }

    assertStorageObjectReady({
      verification,
      videoRecord: videoLookup.record,
    });

    await contextRef.set(
      {
        videoId: input.videoId,
        userId: input.targetUserId,
        status: 'summarizing',
        processingStage: 'summarizing',
        processingVersion: PROCESSING_VERSION,
        videoName: input.videoName,
        videoUrl: resolvedReference.videoUrl,
        storagePath: verification.storagePath,
        storageBucket: verification.bucketName,
        storageContentType: verification.contentType,
        storageUpdatedAt: verification.updated,
        sampledFrameTimestamps: input.sampleFrames.map((frame) => frame.timestampSeconds),
        metadata: input.metadata,
        sport: input.sportContext.sport || '',
        discipline: input.sportContext.discipline || '',
        lastError: null,
        lastErrorCode: null,
        lastRequestId: requestId,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    logger.info('[upsertVideoContext] processing_started', {
      requestId,
      videoId: input.videoId,
      targetUserId: input.targetUserId,
    });

    const tier = await getUserTier(callerId, callerEmail);
    const modelName = resolveAllowedModelForTier(tier);
    const genAI = new GoogleGenerativeAI(getConfiguredGeminiApiKey());
    const processingModel = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.25,
        responseMimeType: 'application/json',
        responseSchema: VIDEO_CONTEXT_SCHEMA,
      },
    });

    const prompt = buildVideoContextProcessingPrompt({
      language: input.language,
      sport: input.sportContext.sport,
      discipline: input.sportContext.discipline,
      metadata: input.metadata,
      segments: input.segmentPlan,
    });

    let parsed: any;
    try {
      const generation = await processingModel.generateContent(
        buildGenerationParts(prompt, input.sampleFrames),
      );
      parsed = parseJsonResponse(generation.response.text());
    } catch (error) {
      logger.error('[upsertVideoContext] model_generation_failed', {
        ...logContext,
        requestId,
        modelName,
        errorMessage: sanitizeErrorMessage(error, 'Unknown model generation error.'),
        stack: error instanceof Error ? error.stack : null,
      });
      throw toHttpsError(error, 'internal', 'No se pudo generar el contexto del vídeo.');
    }

    let normalizedSegments: PersistedSegment[];
    try {
      normalizedSegments = normalizeSegments(
        Array.isArray(parsed.segments) ? parsed.segments : [],
        input.segmentPlan,
        input.metadata.durationSeconds || 0,
      );
      normalizedSegments = await enrichSegmentsWithEmbeddings(genAI, normalizedSegments);
    } catch (error) {
      logger.error('[upsertVideoContext] segment_processing_failed', {
        requestId,
        videoId: input.videoId,
        errorMessage: sanitizeErrorMessage(error, 'Unknown segment processing error.'),
        stack: error instanceof Error ? error.stack : null,
      });
      throw toHttpsError(
        error,
        'internal',
        'No se pudo transformar el contexto generado en segmentos persistibles.',
      );
    }

    const keyMoments = normalizeKeyMoments(
      Array.isArray(parsed.keyMoments) ? parsed.keyMoments : [],
      normalizedSegments,
      input.metadata.durationSeconds || 0,
    );

    const usedFallbacks =
      !Array.isArray(parsed.segments) ||
      parsed.segments.length === 0 ||
      !sanitizeText(parsed.globalTechnicalAssessment);

    logger.info('[upsertVideoContext] context_generated', {
      requestId,
      videoId: input.videoId,
      modelName,
      usedFallbacks,
      generatedSegmentCount: normalizedSegments.length,
      generatedKeyMomentCount: keyMoments.length,
    });

    try {
      await persistSegments(input.targetUserId, input.videoId, normalizedSegments);
      logger.info('[upsertVideoContext] firestore_segments_written', {
        requestId,
        videoId: input.videoId,
        targetUserId: input.targetUserId,
        segmentCount: normalizedSegments.length,
      });

      await contextRef.set(
        {
          videoId: input.videoId,
          userId: input.targetUserId,
          status: (usedFallbacks ? 'partial' : 'ready') as VideoContextStatus,
          processingStage: usedFallbacks ? 'partial_context_ready' : 'complete_context_ready',
          processingVersion: PROCESSING_VERSION,
          videoName: input.videoName,
          videoUrl: resolvedReference.videoUrl,
          storagePath: verification.storagePath,
          storageBucket: verification.bucketName,
          samplingProfile: input.samplingProfile,
          metadata: input.metadata,
          sport: input.sportContext.sport || '',
          discipline: input.sportContext.discipline || '',
          globalSummary: sanitizeText(parsed.globalSummary),
          globalTechnicalAssessment: sanitizeText(parsed.globalTechnicalAssessment),
          timelineSummary: ensureStringArray(parsed.timelineSummary),
          keyMoments,
          segmentCount: normalizedSegments.length,
          sampledFrameTimestamps: input.sampleFrames.map((frame) => frame.timestampSeconds),
          recommendedQuestions: ensureStringArray(parsed.recommendedQuestions),
          lastError: null,
          lastErrorCode: null,
          lastRequestId: requestId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (error) {
      logger.error('[upsertVideoContext] firestore_write_failed', {
        requestId,
        videoId: input.videoId,
        targetUserId: input.targetUserId,
        errorMessage: sanitizeErrorMessage(error, 'Unknown Firestore write error.'),
        stack: error instanceof Error ? error.stack : null,
      });
      throw toHttpsError(
        error,
        'internal',
        'No se pudo persistir el contexto del vídeo en Firestore.',
      );
    }

    logger.info('[upsertVideoContext] completed', {
      requestId,
      videoId: input.videoId,
      targetUserId: input.targetUserId,
      status: usedFallbacks ? 'partial' : 'ready',
      segmentCount: normalizedSegments.length,
      keyMomentCount: keyMoments.length,
    });

    return {
      status: usedFallbacks ? 'partial' : 'ready',
      segmentCount: normalizedSegments.length,
      keyMomentCount: keyMoments.length,
      storagePath: verification.storagePath,
    };
  } catch (error) {
    const typedError = toHttpsError(
      error,
      'internal',
      'No se pudo procesar el contexto del vídeo.',
    );

    logger.error('[upsertVideoContext] failed', {
      ...logContext,
      requestId,
      errorCode: typedError.code,
      errorMessage: typedError.message,
      stack: error instanceof Error ? error.stack : null,
    });

    await persistContextErrorState({
      contextRef,
      error: typedError,
      processingStage:
        typedError.code === 'failed-precondition' ? UPLOAD_IN_PROGRESS_STAGE : 'failed',
      requestId,
    }).catch((persistError) => {
      logger.error('[upsertVideoContext] failed_to_persist_error_state', {
        requestId,
        videoId: input.videoId,
        targetUserId: input.targetUserId,
        errorMessage: sanitizeErrorMessage(
          persistError,
          'Unknown error while writing failure state.',
        ),
        stack: persistError instanceof Error ? persistError.stack : null,
      });
    });

    throw typedError;
  }
};

export const upsertVideoContext = onCall(
  {
    region: 'europe-west1',
    maxInstances: 10,
    secrets: [geminiApiKey],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const callerId = request.auth.uid;
    const requestId = randomUUID();
    const input = normalizeUpsertVideoContextInput(
      request.data as UpsertVideoContextPayload | undefined,
      callerId,
    );
    const logContext = buildUpsertVideoContextLog({ requestId, callerId, input });
    logger.info('[upsertVideoContext] start', logContext);
    await validateTargetAccess(callerId, input.targetUserId);
    logger.info('[upsertVideoContext] auth_ok', {
      requestId,
      callerId,
      targetUserId: input.targetUserId,
    });
    return executeUpsertVideoContextFlow({
      request,
      callerId,
      callerEmail: request.auth.token.email,
      requestId,
      input,
      logContext,
    });
    /* Legacy implementation retained during refactor.
    try {
      const [videoLookup, contextSnap] = await Promise.all([
        readVideoGalleryRecord(input.targetUserId, input.videoId),
        contextRef.get(),
      ]);
      throw new HttpsError('invalid-argument', 'Faltan artefactos de muestreo del vídeo.');
    }

    await validateTargetAccess(callerId, targetUserId);

    const contextRef = getContextRef(targetUserId, videoId);
    await contextRef.set(
      {
        videoId,
        userId: targetUserId,
        status: 'summarizing',
        processingStage: 'summarizing',
        processingVersion: PROCESSING_VERSION,
        sampledFrameTimestamps: sampleFrames.map((frame) => frame.timestampSeconds),
        metadata,
        sport: sportContext.sport || '',
        discipline: sportContext.discipline || '',
        lastError: null,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const tier = await getUserTier(callerId, request.auth.token.email);
    const modelName = resolveAllowedModelForTier(tier);
    const genAI = new GoogleGenerativeAI(geminiApiKey.value());
    const processingModel = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.25,
        responseMimeType: 'application/json',
        responseSchema: VIDEO_CONTEXT_SCHEMA,
      },
    });

    try {
      const prompt = buildVideoContextProcessingPrompt({
        language,
        sport: sportContext.sport,
        discipline: sportContext.discipline,
        metadata,
        segments: segmentPlan,
      });

      const generation = await processingModel.generateContent(
        buildGenerationParts(prompt, sampleFrames),
      );
      const parsed = parseJsonResponse(generation.response.text());

      let normalizedSegments = normalizeSegments(
        Array.isArray(parsed.segments) ? parsed.segments : [],
        segmentPlan,
        metadata.durationSeconds || 0,
      );
      normalizedSegments = await enrichSegmentsWithEmbeddings(genAI, normalizedSegments);
      const keyMoments = normalizeKeyMoments(
        Array.isArray(parsed.keyMoments) ? parsed.keyMoments : [],
        normalizedSegments,
        metadata.durationSeconds || 0,
      );

      const usedFallbacks =
        !Array.isArray(parsed.segments) ||
        parsed.segments.length === 0 ||
        !sanitizeText(parsed.globalTechnicalAssessment);

      await persistSegments(targetUserId, videoId, normalizedSegments);
      await contextRef.set(
        {
          videoId,
          userId: targetUserId,
          status: (usedFallbacks ? 'partial' : 'ready') as VideoContextStatus,
          processingStage: usedFallbacks ? 'partial_context_ready' : 'complete_context_ready',
          processingVersion: PROCESSING_VERSION,
          videoName,
          samplingProfile,
          metadata,
          sport: sportContext.sport || '',
          discipline: sportContext.discipline || '',
          globalSummary: sanitizeText(parsed.globalSummary),
          globalTechnicalAssessment: sanitizeText(parsed.globalTechnicalAssessment),
          timelineSummary: ensureStringArray(parsed.timelineSummary),
          keyMoments,
          segmentCount: normalizedSegments.length,
          sampledFrameTimestamps: sampleFrames.map((frame) => frame.timestampSeconds),
          recommendedQuestions: ensureStringArray(parsed.recommendedQuestions),
          lastError: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      return {
        status: usedFallbacks ? 'partial' : 'ready',
        segmentCount: normalizedSegments.length,
        keyMomentCount: keyMoments.length,
      };
    } catch (error: any) {
      console.error('[upsertVideoContext] Error:', error);
      await contextRef.set(
        {
          status: 'failed',
          processingStage: 'failed',
          lastError: error?.message || 'Video context processing failed.',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      throw new HttpsError('internal', 'No se pudo procesar el contexto del vídeo.');
    }
    */
  },
);

export const askVideoQuestion = onCall(
  {
    region: 'europe-west1',
    maxInstances: 20,
    secrets: [geminiApiKey],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const callerId = request.auth.uid;
    const targetUserId = sanitizeText(request.data?.targetUserId, callerId);
    const videoId = sanitizeText(request.data?.videoId);
    const message = sanitizeText(request.data?.message);
    const sessionId = sanitizeText(request.data?.sessionId);
    const currentTimeSeconds =
      request.data?.currentTimeSeconds === null || request.data?.currentTimeSeconds === undefined
        ? null
        : clampNumber(request.data?.currentTimeSeconds);
    const durationSeconds =
      request.data?.durationSeconds === null || request.data?.durationSeconds === undefined
        ? null
        : clampNumber(request.data?.durationSeconds);
    const mode = sanitizeText(request.data?.mode, 'frame') as VideoQuestionMode;
    const language = normalizeLanguage(request.data?.language);
    const sportContext = (request.data?.sportContext || {}) as SportContext;
    const poseSnapshot = (request.data?.poseSnapshot || null) as PoseSnapshotPayload | null;
    const history = Array.isArray(request.data?.history)
      ? (request.data.history as HistoryEntry[]).slice(-6)
      : [];
    const currentFrame = request.data?.currentFrame
      ? (request.data.currentFrame as FrameArtifactPayload)
      : null;
    const windowFrames = Array.isArray(request.data?.windowFrames)
      ? (request.data.windowFrames as FrameArtifactPayload[]).slice(0, MAX_QUERY_FRAMES)
      : [];

    if (!videoId || !message) {
      throw new HttpsError('invalid-argument', 'Faltan datos de la consulta.');
    }

    await validateTargetAccess(callerId, targetUserId);

    const contextRef = getContextRef(targetUserId, videoId);
    const contextSnap = await contextRef.get();
    const contextData = contextSnap.exists ? contextSnap.data() : {};
    const processingStatus = (contextData?.status || 'not_started') as VideoContextStatus;
    const segments = await readPersistedSegments(targetUserId, videoId);
    const keyMoments = Array.isArray(contextData?.keyMoments)
      ? (contextData?.keyMoments as PersistedKeyMoment[])
      : [];

    const tier = await getUserTier(callerId, request.auth.token.email);
    const modelName = resolveAllowedModelForTier(tier);
    const genAI = new GoogleGenerativeAI(geminiApiKey.value());

    let questionEmbedding: number[] = [];
    if (segments.some((segment) => Array.isArray(segment.embedding) && segment.embedding.length > 0)) {
      try {
        questionEmbedding = await embedText(genAI, message, TaskType.RETRIEVAL_QUERY);
      } catch (error) {
        console.warn('[askVideoQuestion] embedText fallback:', error);
      }
    }

    const ranked = rankSegmentsForQuestion({
      segments,
      questionEmbedding,
      activeTimeSeconds: currentTimeSeconds,
    });
    const relevantKeyMoments = pickKeyMomentsForQuestion({
      keyMoments,
      activeTimeSeconds: currentTimeSeconds,
    });

    const retrievalPayload = {
      processingStatus,
      globalSummary: sanitizeText(contextData?.globalSummary),
      globalTechnicalAssessment: sanitizeText(contextData?.globalTechnicalAssessment),
      timelineSummary: Array.isArray(contextData?.timelineSummary) ? contextData?.timelineSummary : [],
      activeSegment: ranked.activeSegment,
      adjacentSegments: ranked.adjacentSegments,
      semanticSegments: ranked.semanticSegments,
      keyMoments: relevantKeyMoments,
      currentTimeSeconds,
      mode,
      metadata: contextData?.metadata || null,
      poseSnapshot,
    };

    const prompt = buildVideoQuestionPrompt({
      language,
      sport: sportContext.sport,
      discipline: sportContext.discipline,
      question: message,
      currentTimeSeconds,
      mode,
      retrievalPayload,
      history,
      processingStatus,
    });

    const answerModel = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: VIDEO_ANSWER_SCHEMA,
      },
    });

    const framesForPrompt = [
      ...(currentFrame ? [currentFrame] : []),
      ...windowFrames.filter(
        (frame) =>
          !currentFrame ||
          Math.abs(frame.timestampSeconds - currentFrame.timestampSeconds) > 0.001,
      ),
    ];

    const generation = await answerModel.generateContent(
      buildGenerationParts(prompt, framesForPrompt),
    );
    const parsed = parseJsonResponse(generation.response.text());

    const structured: StructuredVideoAnswer = {
      momentOfGesture: sanitizeText(
        parsed.momentOfGesture,
        currentTimeSeconds !== null && currentTimeSeconds !== undefined
          ? `Instante ${currentTimeSeconds.toFixed(2)}s`
          : 'Resumen general del gesto',
      ),
      phase: sanitizeText(parsed.phase, ranked.activeSegment?.phaseLabel || 'Fase no concluyente'),
      visibleObservations: ensureStringArray(parsed.visibleObservations),
      technicalEvaluation: ensureStringArray(parsed.technicalEvaluation),
      probableErrorsOrRisks: ensureStringArray(parsed.probableErrorsOrRisks),
      recommendations: ensureStringArray(parsed.recommendations),
      confidence: normalizeConfidence(parsed.confidence),
      visualLimitations: ensureStringArray(parsed.visualLimitations),
      probableInferences: ensureStringArray(parsed.probableInferences),
    };

    const trace = buildRetrievalTrace({
      processingStatus,
      mode,
      activeTimeSeconds: currentTimeSeconds,
      durationSeconds: durationSeconds || contextData?.metadata?.durationSeconds || null,
      activeSegment: ranked.activeSegment,
      adjacentSegments: ranked.adjacentSegments,
      semanticSegments: ranked.semanticSegments,
      keyMoments: relevantKeyMoments,
      hasWindowFrames: windowFrames.length > 0,
      hasCurrentFrame: !!currentFrame,
      hasChatHistory: history.length > 0,
      hasBiomechanicsRules: Boolean(sportContext.sport || sportContext.discipline),
      hasPoseSnapshot: Boolean(poseSnapshot),
    });
    trace.windowFrameTimestamps = windowFrames.map((frame) => frame.timestampSeconds);

    const answer = formatCompactStructuredAnswer(structured, language);

    const sessionsRef = getSessionsRef(targetUserId, videoId);
    const sessionRef = sessionId ? sessionsRef.doc(sessionId) : sessionsRef.doc();
    const userMessageRef = sessionRef.collection('messages').doc();
    const assistantMessageRef = sessionRef.collection('messages').doc();
    const batch = db.batch();

    batch.set(
      sessionRef,
      {
        videoId,
        userId: targetUserId,
        mode,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastQueriedTimestampSeconds: currentTimeSeconds,
        lastContextSummaryLabel: trace.contextSummaryLabel,
      },
      { merge: true },
    );

    batch.set(userMessageRef, {
      role: 'user',
      text: message,
      createdAt: FieldValue.serverTimestamp(),
      activeTimestampSeconds: currentTimeSeconds,
      mode,
    });

    batch.set(assistantMessageRef, {
      role: 'model',
      text: answer,
      createdAt: FieldValue.serverTimestamp(),
      activeTimestampSeconds: currentTimeSeconds,
      mode,
      structured,
      trace,
      modelName,
      processingStatus,
    });

    batch.set(
      contextRef,
      {
        updatedAt: FieldValue.serverTimestamp(),
        lastQuestionAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await batch.commit();

    return {
      sessionId: sessionRef.id,
      answer,
      structured,
      trace,
    };
  },
);
