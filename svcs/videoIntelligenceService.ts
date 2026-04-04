import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/functions';

import {
  ChatMessage,
  UserProfile,
  VideoChatResponse,
  VideoContextDoc,
  VideoPoseSnapshot,
  VideoQuestionMode,
  VideoTechnicalMetadata,
} from '../types';
import { VideoStorage } from './storageService';
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
  language: 'es' | 'ing' | 'eus';
  userProfile?: UserProfile;
  force?: boolean;
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

const getFunctionsInstance = () => firebase.app().functions('europe-west1');
const getFirestoreInstance = () => firebase.app().firestore();

const getVideoContextDocRef = (userId: string, videoId: string) =>
  getFirestoreInstance().doc(`userdata/${userId}/videoContexts/${videoId}`);

const resolveVideoSource = async ({
  videoId,
  explicitSource,
  remoteUrl,
}: {
  videoId: string;
  explicitSource?: VideoSource | null;
  remoteUrl?: string;
}) => {
  if (explicitSource && typeof explicitSource !== 'string') return explicitSource;

  const localBlob = await VideoStorage.getVideo(videoId);
  if (localBlob) return localBlob;

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
    language,
    userProfile,
    force = false,
  }: PrepareVideoContextArgs) => {
    const lockKey = `${userId}:${videoId}`;
    if (!force && processingLocks.has(lockKey)) {
      return processingLocks.get(lockKey)!;
    }

    const work = (async () => {
      const resolvedSource = await resolveVideoSource({ videoId, explicitSource: source, remoteUrl });
      if (!resolvedSource) return;

      const metadata = await extractVideoMetadata(resolvedSource, buildMetadataFallback(resolvedSource));
      const profile = metadata.durationSeconds > 25 ? 'coarse' : 'standard';
      const { plan, samples } = await captureSamplingArtifacts({
        source: resolvedSource,
        durationSeconds: metadata.durationSeconds,
        profile,
      });

      const functions = getFunctionsInstance();
      const callable = functions.httpsCallable('upsertVideoContext');
      await callable({
        targetUserId: userId,
        videoId,
        videoName,
        language,
        sportContext: toSportContext(userProfile),
        metadata,
        samplingProfile: profile,
        segments: plan,
        sampleFrames: samples,
      });
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
