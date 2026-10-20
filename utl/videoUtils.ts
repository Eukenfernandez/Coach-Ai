
/**
 * Configuration for Camera Recording.
 * Targets 1080p at 30 fps on the environment (back) camera: enough detail for
 * technique and pose analysis, while 4K recordings were several times larger
 * and slow to upload, stream and scrub.
 */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: true,
  video: {
    facingMode: 'environment', // Use back camera
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 }
  }
};

// Bitrate cap for in-app recordings (~1 MB per second of video).
export const RECORDING_VIDEO_BITS_PER_SECOND = 8_000_000;

/**
 * Generates a compact thumbnail from an early visible frame of a video file.
 * It retries later positions when intros/first frames are effectively black.
 */
export const generateVideoThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');

    // Critical attributes for mobile (iOS/Safari) background loading.
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    // Default placeholder in case of failure (Dark gray with Orange chevron)
    const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180' viewBox='0 0 320 180'%3E%3Crect width='320' height='180' fill='%231f1f1f'/%3E%3Cpath d='M140 70 L180 90 L140 110 Z' fill='%23ea580c'/%3E%3C/svg%3E";

    let isResolved = false;
    let seekTargets: number[] = [];
    let seekIndex = 0;
    let bestCandidate = '';

    const safeResolve = (val: string) => {
      if (isResolved) return;
      isResolved = true;
      window.clearTimeout(timeoutId);
      resolve(val);
      try {
        URL.revokeObjectURL(objectUrl);
        video.onloadedmetadata = null;
        video.onseeked = null;
        video.onerror = null;
        video.removeAttribute('src');
        video.load();
      } catch {
        // ignore cleanup errors
      }
    };

    const isFrameEffectivelyBlack = () => {
      const sample = document.createElement('canvas');
      sample.width = 24;
      sample.height = 24;
      const context = sample.getContext('2d', { willReadFrequently: true });
      if (!context) return false;

      context.drawImage(video, 0, 0, sample.width, sample.height);
      const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
      let luminance = 0;
      let detailedPixels = 0;
      const pixelCount = pixels.length / 4;

      for (let index = 0; index < pixels.length; index += 4) {
        const value = (pixels[index] * 0.2126) + (pixels[index + 1] * 0.7152) + (pixels[index + 2] * 0.0722);
        luminance += value;
        if (value > 28) detailedPixels += 1;
      }

      return luminance / pixelCount < 11 && detailedPixels / pixelCount < 0.02;
    };

    const captureCurrentFrame = () => {
      try {
        if (video.videoWidth <= 0 || video.videoHeight <= 0) return '';

        const maxWidth = 480;
        const scale = Math.min(1, maxWidth / video.videoWidth);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.72);
      } catch (error) {
        console.error('Canvas draw error', error);
        return '';
      }
    };

    const seekNextFrame = () => {
      const target = seekTargets[seekIndex];
      if (target === undefined) {
        safeResolve(bestCandidate || fallback);
        return;
      }

      try {
        video.currentTime = target;
      } catch {
        seekIndex += 1;
        seekNextFrame();
      }
    };

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (duration <= 0) {
        safeResolve(fallback);
        return;
      }

      const lastSafeFrame = Math.max(0, duration - 0.05);
      const candidates = [
        Math.min(Math.max(duration * 0.12, 0.2), 3, lastSafeFrame),
        Math.min(Math.max(duration * 0.4, 0.35), 6, lastSafeFrame),
        Math.min(Math.max(duration * 0.7, 0.5), 10, lastSafeFrame),
      ];

      seekTargets = candidates.filter((target, index) => (
        target >= 0 && candidates.findIndex((candidate) => Math.abs(candidate - target) < 0.04) === index
      ));
      seekIndex = 0;
      seekNextFrame();
    };

    video.onseeked = () => {
      const candidate = captureCurrentFrame();
      if (candidate) bestCandidate = candidate;

      if (candidate && !isFrameEffectivelyBlack()) {
        safeResolve(candidate);
        return;
      }

      seekIndex += 1;
      seekNextFrame();
    };

    video.onerror = () => {
      console.warn('Thumbnail generation failed: Video could not be loaded.');
      safeResolve(bestCandidate || fallback);
    };

    // Large mobile recordings can take a moment to expose a seekable frame.
    const timeoutId = window.setTimeout(() => {
      console.warn('Thumbnail generation timed out for:', file.name);
      safeResolve(bestCandidate || fallback);
    }, 8000);

    // Trigger load
    video.load();
  });
};

export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const formatDurationLabel = (seconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const getVideoDurationLabel = (source: string | Blob): Promise<string | undefined> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    let objectUrl: string | null = null;
    let settled = false;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore cleanup failures
        }
      }
    };

    const safeResolve = (value?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();
      resolve(value);
    };

    const timeoutId = window.setTimeout(() => safeResolve(undefined), 10000);

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    if (typeof source === 'string') {
      if (/^https?:/i.test(source)) {
        video.crossOrigin = 'anonymous';
      }
      video.src = source;
    } else {
      objectUrl = URL.createObjectURL(source);
      video.src = objectUrl;
    }

    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        safeResolve(undefined);
        return;
      }

      safeResolve(formatDurationLabel(video.duration));
    };

    video.onerror = () => safeResolve(undefined);
    video.load();
  });
};
