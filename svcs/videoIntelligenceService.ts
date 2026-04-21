import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/functions';

import {
  ChatMessage,
  UserProfile,
  VideoChatResponse,
  VideoContextDoc,
  VideoFrameArtifact,
  VideoPoseSnapshot,
  VideoQuestionMode,
  VideoSegmentPlan,
  VideoTechnicalMetadata,
} from '../types';
import { StorageService, VideoStorage } from './storageService';
import {
  captureCurrentFrameFromElement,
  captureQueryWindowArtifacts,
  captureSamplingArtifacts,
  extractVideoMetadata,
} from '../utl/videoIntelligence';

type VideoSource = string | Blob;

interface PrepareVideoContextArgs {
  userId: string;
  videoId: string;
  videoName: string;
  source?: VideoSource | null;
  remoteUrl?: string;
  storagePath?: string;
  language: 'es' | 'ing' | 'eus';
  userProfile?: UserProfile;
  force?: boolean;
  isUploading?: boolean;
}

interface AskVideoQuestionArgs {
  userId: string;
  videoId: string;
  sessionId?: string | null;
  message: string;
  currentTimeSeconds?: number | null;
  durationSeconds?: number | null;
  mode: VideoQuestionMode;
  language: 'es' | 'ing' | 'eus';
  chatHistory: ChatMessage[];
  userProfile?: UserProfile;
  poseSnapshot?: VideoPoseSnapshot | null;
  source?: VideoSource | null;
  fallbackVideoElement?: HTMLVideoElement | null;
}

const processingLocks = new Map<string, Promise<void>>();

type VideoContextCallableErrorCode =
  | 'invalid-argument'
  | 'unauthenticated'
  | 'not-found'
  | 'failed-precondition'
  | 'internal'
  | 'unknown';

class VideoContextServiceError extends Error {
  code: VideoContextCallableErrorCode;
  retryable: boolean;
  details?: unknown;

  constructor(
    code: VideoContextCallableErrorCode,
    message: string,
    retryable = false,
    details?: unknown,
  ) {
    super(message);
    this.name = 'VideoContextServiceError';
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

const getFunctionsInstance = () => firebase.app().functions('europe-west1');
const getFirestoreInstance = () => firebase.app().firestore();

const getVideoContextDocRef = (userId: string, videoId: string) =>
  getFirestoreInstance().doc(`userdata/${userId}/videoContexts/${videoId}`);

const normalizeCallableErrorCode = (value: unknown): VideoContextCallableErrorCode => {
  const normalized = typeof value === 'string' ? value.replace(/^functions\//, '') : '';
  switch (normalized) {
    case 'invalid-argument':
    case 'unauthenticated':
    case 'not-found':
    case 'failed-precondition':
    case 'internal':
      return normalized;
    default:
      return 'unknown';
  }
};

const normalizeCallableErrorMessage = (
  code: VideoContextCallableErrorCode,
  error: any,
  fallback: string,
) => {
  const detailMessage =
    typeof error?.details === 'string'
      ? error.details
      : typeof error?.details?.message === 'string'
        ? error.details.message
        : '';
  const rawMessage = typeof error?.message === 'string' ? error.message : '';
  const preferred = detailMessage || rawMessage;
  if (preferred && !/^functions\/[a-z-]+$/i.test(preferred)) {
    return preferred;
  }

  switch (code) {
    case 'invalid-argument':
      return 'La solicitud de contexto del vídeo es inválida.';
    case 'unauthenticated':
      return 'Tu sesión no es válida. Vuelve a iniciar sesión.';
    case 'not-found':
      return 'El vídeo ya no existe en Firebase Storage.';
    case 'failed-precondition':
      return 'El vídeo todavía no está listo para procesarse.';
    case 'internal':
      return 'El backend no pudo generar el contexto del vídeo.';
    default:
      return fallback;
  }
};

const toVideoContextServiceError = (error: unknown, fallback: string) => {
  const typedError = error as any;
  const code = normalizeCallableErrorCode(typedError?.code);
  const message = normalizeCallableErrorMessage(code, typedError, fallback);
  return new VideoContextServiceError(
    code,
    message,
    code === 'internal' || code === 'unknown',
    typedError?.details,
  );
};

const resolveVideoSource = async ({
  videoId,
  explicitSource,
  remoteUrl,
  storagePath,
}: {
  videoId: string;
  explicitSource?: VideoSource | null;
  remoteUrl?: string;
  storagePath?: string;
}) => {
  if (explicitSource && typeof explicitSource !== 'string') return explicitSource;

  const localBlob = await VideoStorage.getVideo(videoId);
  if (localBlob) return localBlob;

  if (storagePath) {
    const refreshedUrl = await StorageService.getDownloadUrlFromPath(storagePath);
    if (refreshedUrl) return refreshedUrl;
  }

  if (explicitSource && typeof explicitSource === 'string') return explicitSource;
  if (remoteUrl) return remoteUrl;
  return null;
};

const normalizeChatHistory = (messages: ChatMessage[]) =>
  messages
    .slice(-6)
    .map((message) => ({
      role: message.role,
      text: message.text,
      activeTimestampSeconds: message.activeTimestampSeconds ?? null,
      mode: message.mode ?? null,
    }));

const toSportContext = (userProfile?: UserProfile) => ({
  sport: userProfile?.sport || '',
  discipline: userProfile?.discipline || '',
});

const buildMetadataFallback = (source: VideoSource | null): Partial<VideoTechnicalMetadata> => {
  if (!source || typeof source === 'string') {
    return {};
  }

  return {
    mimeType: source.type || undefined,
    sizeBytes: typeof source.size === 'number' ? source.size : undefined,
  };
};

export const VideoIntelligenceService = {
  subscribeToVideoContext: (
    userId: string,
    videoId: string,
    onValue: (value: VideoContextDoc | null) => void,
  ) => getVideoContextDocRef(userId, videoId).onSnapshot((snapshot) => {
    onValue(snapshot.exists ? (snapshot.data() as VideoContextDoc) : null);
  }),

  prepareVideoContext: async ({
    userId,
    videoId,
    videoName,
    source,
    remoteUrl,
    storagePath,
    language,
    userProfile,
    force = false,
    isUploading = false,
  }: PrepareVideoContextArgs) => {
    const lockKey = `${userId}:${videoId}`;
    if (!force && processingLocks.has(lockKey)) {
      return processingLocks.get(lockKey)!;
    }

    const work = (async () => {
      if (isUploading) {
        console.info('[VideoIntelligenceService] Preparación omitida: el vídeo sigue subiendo.', {
          userId,
          videoId,
        });
        return;
      }

      if (!source && !remoteUrl && !storagePath) {
        console.warn('[VideoIntelligenceService] Preparación omitida: faltan referencias del vídeo.', {
          userId,
          videoId,
        });
        return;
      }

      const resolvedSource = await resolveVideoSource({
        videoId,
        explicitSource: source,
        remoteUrl,
        storagePath,
      });

      if (!resolvedSource) {
        throw new VideoContextServiceError(
          'not-found',
          'No se pudo localizar el vídeo para generar el contexto.',
        );
      }

      let metadata: VideoTechnicalMetadata;
      let profile: 'coarse' | 'standard';
      let plan: VideoSegmentPlan[];
      let samples: VideoFrameArtifact[];

      try {
        metadata = await extractVideoMetadata(resolvedSource, buildMetadataFallback(resolvedSource));
        profile = metadata.durationSeconds > 25 ? 'coarse' : 'standard';
        ({ plan, samples } = await captureSamplingArtifacts({
          source: resolvedSource,
          durationSeconds: metadata.durationSeconds,
          profile,
        }));
      } catch (error) {
        throw new VideoContextServiceError(
          'failed-precondition',
          'No se pudo leer el vídeo para generar el contexto. Verifica que exista y sea reproducible.',
          false,
          error,
        );
      }

      try {
        const functions = getFunctionsInstance();
        const callable = functions.httpsCallable('upsertVideoContext');
        await callable({
          targetUserId: userId,
          videoId,
          videoName,
          videoUrl: remoteUrl || (typeof resolvedSource === 'string' ? resolvedSource : undefined),
          storagePath: storagePath || undefined,
          language,
          sportContext: toSportContext(userProfile),
          metadata,
          samplingProfile: profile,
          segments: plan,
          sampleFrames: samples,
          force,
        });
      } catch (error) {
        throw toVideoContextServiceError(
          error,
          'No se pudo preparar el contexto del vídeo.',
        );
      }
    })().finally(() => {
      processingLocks.delete(lockKey);
    });

    processingLocks.set(lockKey, work);
    return work;
  },

  askVideoQuestion: async ({
    userId,
    videoId,
    sessionId,
    message,
    currentTimeSeconds,
    durationSeconds,
    mode,
    language,
    chatHistory,
    userProfile,
    poseSnapshot,
    source,
    fallbackVideoElement,
  }: AskVideoQuestionArgs): Promise<VideoChatResponse> => {
    const resolvedSource = await resolveVideoSource({
      videoId,
      explicitSource: source,
      remoteUrl: typeof source === 'string' ? source : undefined,
    });

    const effectiveDuration =
      durationSeconds && Number.isFinite(durationSeconds) && durationSeconds > 0
        ? durationSeconds
        : fallbackVideoElement?.duration && Number.isFinite(fallbackVideoElement.duration)
          ? fallbackVideoElement.duration
          : null;

    let windowFrames = [];
    let currentFrame = fallbackVideoElement ? captureCurrentFrameFromElement(fallbackVideoElement) : null;

    if (
      resolvedSource &&
      currentTimeSeconds !== null &&
      currentTimeSeconds !== undefined &&
      effectiveDuration &&
      mode !== 'summary'
    ) {
      try {
        windowFrames = await captureQueryWindowArtifacts({
          source: resolvedSource,
          currentTimeSeconds,
          durationSeconds: effectiveDuration,
          mode,
        });
      } catch (error) {
        console.warn('[VideoIntelligenceService] No se pudo capturar la ventana temporal:', error);
      }
    }

    if (!currentFrame && windowFrames.length > 0) {
      currentFrame = windowFrames[Math.floor(windowFrames.length / 2)] || null;
    }

    const callable = getFunctionsInstance().httpsCallable('askVideoQuestion');
    const result = await callable({
      targetUserId: userId,
      videoId,
      sessionId,
      message,
      currentTimeSeconds: currentTimeSeconds ?? null,
      durationSeconds: effectiveDuration,
      mode,
      language,
      sportContext: toSportContext(userProfile),
      poseSnapshot: poseSnapshot || null,
      currentFrame,
      windowFrames,
      history: normalizeChatHistory(chatHistory),
    });

    return result.data as VideoChatResponse;
  },
};
