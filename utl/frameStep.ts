// Frame-accurate stepping for <video>.
//
// The browser exposes no frame rate, and a guessed 1/30 s step skips frames on
// 60/120/240 fps footage (iPhone slow motion), which can leave the release
// frame of a throw unreachable. Instead: read the presentation timestamp (PTS)
// of the frame on screen via requestVideoFrameCallback, learn the real frame
// duration once per source (a seek 1 ms back lands on the previous frame, and
// the PTS difference is exactly one frame), then aim every step at the middle
// of the neighbouring frame so rounding at frame boundaries can never skip or
// repeat one. Nothing here runs during playback: only when a step is requested.

type FrameCallbackMetadata = { mediaTime?: number };

export type FrameSteppableVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: FrameCallbackMetadata) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const FRAME_READ_TIMEOUT_MS = 500;

const clampToDuration = (value: number, duration: number) => {
  const upper = Number.isFinite(duration) && duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.min(value, upper));
};

const isPlausibleFrameDuration = (value: number) => value >= 1 / 1000 && value <= 1 / 5;

// Seeks and resolves with the PTS of the frame the browser ends up showing, or
// null if no acceptable frame arrives in time. `accept` rejects a frame queued
// before this seek that happens to be presented late.
export const seekAndReadFrameTime = (
  element: FrameSteppableVideo,
  time: number,
  accept: (pts: number) => boolean,
): Promise<number | null> => new Promise((resolve) => {
  if (typeof element.requestVideoFrameCallback !== 'function') {
    element.currentTime = time;
    resolve(null);
    return;
  }

  let callbackId: number | null = null;
  const finish = (value: number | null) => {
    window.clearTimeout(watchdog);
    if (callbackId !== null) element.cancelVideoFrameCallback?.(callbackId);
    callbackId = null;
    resolve(value);
  };
  const onFrame = (_now: number, metadata: FrameCallbackMetadata) => {
    callbackId = null;
    const mediaTime = Number(metadata.mediaTime);
    if (Number.isFinite(mediaTime) && accept(mediaTime)) {
      finish(mediaTime);
      return;
    }
    callbackId = element.requestVideoFrameCallback?.(onFrame) ?? null;
  };
  const watchdog = window.setTimeout(() => finish(null), FRAME_READ_TIMEOUT_MS);
  callbackId = element.requestVideoFrameCallback(onFrame);
  element.currentTime = time;
});

// Moves one frame forward (1) or back (-1) and resolves with the PTS of the
// frame now on screen. `presentedFrameTime` is the PTS of the frame currently
// shown; `frameDuration` caches the learned duration for this source and must
// be reset to null whenever the source changes.
export const stepOneFrame = async (
  element: FrameSteppableVideo,
  direction: 1 | -1,
  presentedFrameTime: number,
  frameDuration: { current: number | null },
): Promise<number> => {
  if (typeof element.requestVideoFrameCallback !== 'function') {
    // No frame timestamps in this browser: nominal 30 fps step.
    const target = clampToDuration(element.currentTime + direction / 30, element.duration);
    element.currentTime = target;
    return target;
  }

  // presentedFrameTime follows every presented frame; if it has drifted from
  // currentTime (no frame yet for a new source) it is only an approximation.
  const baseIsExact = Math.abs(presentedFrameTime - element.currentTime) <= 0.1;
  const base = baseIsExact ? presentedFrameTime : element.currentTime;
  const isAfterBase = (pts: number) => pts > base + 1e-5;
  const isBeforeBase = (pts: number) => pts < base - 1e-5;

  if (direction < 0 && base <= 1e-3) return base;

  if (frameDuration.current === null && baseIsExact) {
    if (base > 2e-3) {
      const previous = await seekAndReadFrameTime(element, base - 1e-3, isBeforeBase);
      if (previous !== null && isPlausibleFrameDuration(base - previous)) {
        frameDuration.current = base - previous;
        // Stepping back, that probe already was the step.
        if (direction < 0) return previous;
      }
    } else {
      // First frame: nothing behind it. Hop ~1/24 s ahead, then 1 ms back from
      // whichever frame that landed on.
      const ahead = await seekAndReadFrameTime(element, base + 1 / 24, isAfterBase);
      if (ahead !== null) {
        const beforeAhead = await seekAndReadFrameTime(element, ahead - 1e-3, (pts) => pts < ahead - 1e-5);
        if (beforeAhead !== null && isPlausibleFrameDuration(ahead - beforeAhead)) {
          frameDuration.current = ahead - beforeAhead;
        }
      }
    }
  }

  const step = frameDuration.current ?? 1 / 30;
  const target = clampToDuration(direction > 0 ? base + 1.5 * step : base - 0.5 * step, element.duration);
  const landed = await seekAndReadFrameTime(element, target, direction > 0 ? isAfterBase : isBeforeBase);
  return landed ?? target;
};
