/**
 * Low-resolution filmstrips for scrubbing high-resolution video.
 *
 * An accurate seek on 4K footage costs the decoder ~75ms, so dragging the
 * scrubber can only ever repaint ~12 times a second no matter how the seek
 * queue is written. A filmstrip is a sprite sheet of small frames sampled
 * across the video: while the decoder catches up we can paint the nearest
 * sampled frame instantly, so the picture keeps tracking the pointer.
 */

export interface Filmstrip {
  sprite: Blob;
  cols: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  /** mediaTime of each frame, ascending. Sampling is uneven by nature. */
  times: number[];
}

/** Below this width the decoder already keeps up with a drag on its own. */
export const FILMSTRIP_MIN_VIDEO_WIDTH = 1600;

const FRAME_WIDTH = 256;
const COLS = 16;
const MAX_FRAMES = 256;
const MIN_INTERVAL_SECONDS = 0.25;
const EXTRACTION_PLAYBACK_RATE = 8;

interface GenerateOptions {
  /** Called between frames; while true, extraction pauses and frees the decoder. */
  shouldPause?: () => boolean;
  signal?: AbortSignal;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: { mediaTime?: number }) => void,
  ) => number;
};

/**
 * Samples `src` by playing it fast and capturing presented frames. Sequential
 * decoding is far cheaper than one seek per sample, which would cost a full
 * decode-from-keyframe every time.
 */
export async function generateFilmstrip(
  src: string,
  options: GenerateOptions = {},
): Promise<Filmstrip | null> {
  const { shouldPause, signal } = options;
  if (!src || signal?.aborted) return null;

  const video = document.createElement('video') as FrameCallbackVideo;
  // requestVideoFrameCallback only fires for frames the compositor actually
  // presents, and a detached element is never composited — measured on a 4K
  // clip, detaching drops the yield from 234 frames to 39.
  Object.assign(video.style, {
    position: 'fixed',
    left: '0px',
    bottom: '0px',
    width: '2px',
    height: '2px',
    opacity: '0.01',
    pointerEvents: 'none',
    zIndex: '-1',
  });
  video.src = src;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    if (typeof video.requestVideoFrameCallback !== 'function') return null;

    document.body.appendChild(video);
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('filmstrip: source failed to load'));
      video.load();
    });

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || !video.videoWidth || !video.videoHeight) {
      return null;
    }

    const frameWidth = FRAME_WIDTH;
    const frameHeight = Math.max(1, Math.round((FRAME_WIDTH * video.videoHeight) / video.videoWidth));
    const interval = Math.max(MIN_INTERVAL_SECONDS, duration / MAX_FRAMES);

    const sheet = document.createElement('canvas');
    sheet.width = COLS * frameWidth;
    sheet.height = Math.ceil(MAX_FRAMES / COLS) * frameHeight;
    const ctx = sheet.getContext('2d');
    if (!ctx) return null;

    const times: number[] = [];
    let lastCaptured = -Infinity;

    video.playbackRate = EXTRACTION_PLAYBACK_RATE;
    try {
      await video.play();
    } catch {
      return null;
    }

    await new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        resolve();
      };

      signal?.addEventListener('abort', finish, { once: true });
      video.addEventListener('ended', finish, { once: true });
      video.addEventListener('error', finish, { once: true });

      const step = (_now: number, metadata: { mediaTime?: number }) => {
        if (finished || signal?.aborted) return finish();

        const mediaTime = Number(metadata.mediaTime);
        if (
          Number.isFinite(mediaTime) &&
          mediaTime - lastCaptured >= interval &&
          times.length < MAX_FRAMES
        ) {
          const index = times.length;
          ctx.drawImage(
            video,
            (index % COLS) * frameWidth,
            Math.floor(index / COLS) * frameHeight,
            frameWidth,
            frameHeight,
          );
          times.push(mediaTime);
          lastCaptured = mediaTime;
        }

        if (times.length >= MAX_FRAMES || video.ended) return finish();

        if (shouldPause?.()) {
          void (async () => {
            try {
              video.pause();
            } catch {
              // ignore: the element is torn down in the finally block
            }
            while (shouldPause?.() && !signal?.aborted && !finished) {
              await delay(250);
            }
            if (finished || signal?.aborted) return finish();
            try {
              video.playbackRate = EXTRACTION_PLAYBACK_RATE;
              await video.play();
            } catch {
              return finish();
            }
            video.requestVideoFrameCallback?.(step);
          })();
          return;
        }

        video.requestVideoFrameCallback?.(step);
      };

      video.requestVideoFrameCallback?.(step);
    });

    if (times.length < 2) return null;

    const usedRows = Math.ceil(times.length / COLS);
    let output = sheet;
    if (usedRows * frameHeight < sheet.height) {
      output = document.createElement('canvas');
      output.width = sheet.width;
      output.height = usedRows * frameHeight;
      output.getContext('2d')?.drawImage(sheet, 0, 0);
    }

    const sprite = await new Promise<Blob | null>((resolve) => {
      output.toBlob((blob) => resolve(blob), 'image/jpeg', 0.7);
    });
    if (!sprite) return null;

    return { sprite, cols: COLS, rows: usedRows, frameWidth, frameHeight, times };
  } catch {
    return null;
  } finally {
    try {
      video.pause();
    } catch {
      // ignore
    }
    video.removeAttribute('src');
    video.load();
    video.remove();
  }
}

/** Index of the sampled frame closest to `time`. Assumes `times` is ascending. */
export function findFilmstripIndex(times: number[], time: number): number {
  if (times.length === 0) return -1;

  let low = 0;
  let high = times.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (times[mid] < time) low = mid + 1;
    else high = mid;
  }

  if (low > 0 && Math.abs(times[low - 1] - time) <= Math.abs(times[low] - time)) {
    return low - 1;
  }
  return low;
}
