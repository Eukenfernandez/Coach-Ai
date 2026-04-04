import { VideoFrameArtifact, VideoQuestionMode, VideoSegmentPlan, VideoTechnicalMetadata } from '../types';

type VideoSource = string | Blob;
type SamplingProfile = 'coarse' | 'standard' | 'dense';

interface CaptureOptions {
  maxWidth?: number;
  quality?: number;
}

const DEFAULT_CAPTURE_OPTIONS: Required<CaptureOptions> = {
  maxWidth: 960,
  quality: 0.68,
};

const QUERY_WINDOW_CAPTURE_OPTIONS: Required<CaptureOptions> = {
  maxWidth: 1120,
  quality: 0.76,
};

const roundSeconds = (value: number) => Math.max(0, Number(value.toFixed(3)));

const clampTime = (time: number, durationSeconds: number) => {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  return Math.min(durationSeconds, Math.max(0, time));
};

const toOrientation = (width: number, height: number): VideoTechnicalMetadata['orientation'] => {
  if (width === height) return 'square';
  return width > height ? 'landscape' : 'portrait';
};

const waitForEvent = (target: EventTarget, eventName: string) =>
  new Promise<void>((resolve, reject) => {
    const onSuccess = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Video event failed: ${eventName}`));
    };
    const cleanup = () => {
      target.removeEventListener(eventName, onSuccess);
      target.removeEventListener('error', onError);
    };
    target.addEventListener(eventName, onSuccess, { once: true });
    target.addEventListener('error', onError, { once: true });
  });

const createVideoElement = (source: VideoSource) => {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;

  const shouldRevoke = typeof source !== 'string';
  const sourceUrl = typeof source === 'string' ? source : URL.createObjectURL(source);
  video.src = sourceUrl;

  const cleanup = () => {
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {
      // no-op
    }

    if (shouldRevoke) {
      try {
        URL.revokeObjectURL(sourceUrl);
      } catch {
        // no-op
      }
    }
  };

  return { video, cleanup };
};

const ensureVideoReady = async (video: HTMLVideoElement) => {
  if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) {
    return;
  }

  video.load();
  await waitForEvent(video, 'loadedmetadata');
};

const seekVideo = async (video: HTMLVideoElement, timeSeconds: number) => {
  const targetTime = clampTime(timeSeconds, video.duration || timeSeconds);
  if (Math.abs((video.currentTime || 0) - targetTime) < 0.001) {
    return;
  }

  const seekPromise = waitForEvent(video, 'seeked');
  video.currentTime = targetTime;
  await seekPromise;
};

const captureFrameFromVideo = (
  video: HTMLVideoElement,
  timestampSeconds: number,
  label: string,
  captureOptions: Required<CaptureOptions>,
): VideoFrameArtifact => {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  const scale = width > captureOptions.maxWidth ? captureOptions.maxWidth / width : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo obtener el contexto de canvas para capturar frames.');
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const base64Jpeg = canvas.toDataURL('image/jpeg', captureOptions.quality).split(',')[1] || '';

  return {
    timestampSeconds: roundSeconds(timestampSeconds),
    label,
    base64Jpeg,
    width: canvas.width,
    height: canvas.height,
  };
};

export const buildVideoSamplingPlan = (
  durationSeconds: number,
  profile: SamplingProfile = 'standard',
): VideoSegmentPlan[] => {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return [];
  }

  const targetSegments =
    profile === 'dense'
      ? Math.min(12, Math.max(8, Math.ceil(durationSeconds / 1.25)))
      : profile === 'coarse'
        ? Math.min(6, Math.max(4, Math.ceil(durationSeconds / 3)))
        : Math.min(10, Math.max(6, Math.ceil(durationSeconds / 2)));

  const segmentDuration = durationSeconds / targetSegments;
  const segments: VideoSegmentPlan[] = [];

  for (let index = 0; index < targetSegments; index += 1) {
    const startTimeSeconds = roundSeconds(index * segmentDuration);
    const endTimeSeconds =
      index === targetSegments - 1
        ? roundSeconds(durationSeconds)
        : roundSeconds((index + 1) * segmentDuration);
    const representativeTimeSeconds = roundSeconds(
      clampTime((startTimeSeconds + endTimeSeconds) / 2, durationSeconds),
    );

    segments.push({
      id: `segment_${index + 1}`,
      startTimeSeconds,
      endTimeSeconds,
      representativeTimeSeconds,
      label: `Segment ${index + 1}`,
    });
  }

  return segments;
};

export const buildQueryWindowPlan = (
  currentTimeSeconds: number,
  durationSeconds: number,
  mode: VideoQuestionMode,
) => {
  const offsets =
    mode === 'summary'
      ? []
      : mode === 'range'
        ? [-1, -0.5, 0, 0.5, 1]
        : [-0.6, -0.25, 0, 0.25, 0.6];

  const timestamps = offsets.map((offset) =>
    roundSeconds(clampTime(currentTimeSeconds + offset, durationSeconds)),
  );

  return Array.from(new Set(timestamps)).map((timestampSeconds, index) => ({
    timestampSeconds,
    label: index === Math.floor(timestamps.length / 2) ? 'Current frame' : `Window ${index + 1}`,
  }));
};

export const extractVideoMetadata = async (
  source: VideoSource,
  fallback?: Partial<VideoTechnicalMetadata>,
): Promise<VideoTechnicalMetadata> => {
  const { video, cleanup } = createVideoElement(source);

  try {
    await ensureVideoReady(video);

    const width = video.videoWidth || fallback?.width || 0;
    const height = video.videoHeight || fallback?.height || 0;
    const durationSeconds = Number.isFinite(video.duration) ? Number(video.duration) : fallback?.durationSeconds || 0;

    return {
      durationSeconds: roundSeconds(durationSeconds),
      width,
      height,
      estimatedFps: fallback?.estimatedFps ?? null,
      frameCountEstimate:
        fallback?.frameCountEstimate ??
        (fallback?.estimatedFps && durationSeconds ? Math.round(fallback.estimatedFps * durationSeconds) : null),
      aspectRatio: width && height ? Number((width / height).toFixed(4)) : null,
      orientation: toOrientation(width, height),
      mimeType: fallback?.mimeType,
      sizeBytes: fallback?.sizeBytes,
    };
  } finally {
    cleanup();
  }
};

export const captureSamplingArtifacts = async ({
  source,
  durationSeconds,
  profile = 'standard',
  captureOptions = DEFAULT_CAPTURE_OPTIONS,
}: {
  source: VideoSource;
  durationSeconds: number;
  profile?: SamplingProfile;
  captureOptions?: CaptureOptions;
}) => {
  const plan = buildVideoSamplingPlan(durationSeconds, profile);
  const { video, cleanup } = createVideoElement(source);
  const resolvedOptions = { ...DEFAULT_CAPTURE_OPTIONS, ...captureOptions };

  try {
    await ensureVideoReady(video);

    const samples: VideoFrameArtifact[] = [];
    for (const segment of plan) {
      await seekVideo(video, segment.representativeTimeSeconds);
      samples.push(
        captureFrameFromVideo(
          video,
          segment.representativeTimeSeconds,
          `${segment.label} @ ${segment.representativeTimeSeconds.toFixed(2)}s`,
          resolvedOptions,
        ),
      );
    }

    return { plan, samples };
  } finally {
    cleanup();
  }
};

export const captureQueryWindowArtifacts = async ({
  source,
  currentTimeSeconds,
  durationSeconds,
  mode,
  captureOptions = QUERY_WINDOW_CAPTURE_OPTIONS,
}: {
  source: VideoSource;
  currentTimeSeconds: number;
  durationSeconds: number;
  mode: VideoQuestionMode;
  captureOptions?: CaptureOptions;
}) => {
  const { video, cleanup } = createVideoElement(source);
  const resolvedOptions = { ...QUERY_WINDOW_CAPTURE_OPTIONS, ...captureOptions };

  try {
    await ensureVideoReady(video);

    const frames: VideoFrameArtifact[] = [];
    for (const item of buildQueryWindowPlan(currentTimeSeconds, durationSeconds, mode)) {
      await seekVideo(video, item.timestampSeconds);
      frames.push(captureFrameFromVideo(video, item.timestampSeconds, item.label, resolvedOptions));
    }

    return frames;
  } finally {
    cleanup();
  }
};

export const captureCurrentFrameFromElement = (
  video: HTMLVideoElement,
  label = 'Current frame',
): VideoFrameArtifact | null => {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return null;
  }

  return captureFrameFromVideo(
    video,
    video.currentTime || 0,
    label,
    QUERY_WINDOW_CAPTURE_OPTIONS,
  );
};
