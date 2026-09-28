// Frame-accurate stepping for <video>.
//
// The browser exposes no frame rate, and a guessed 1/30 s step skips frames on
// 60/120/240 fps footage (iPhone slow motion), which can leave the release
// frame of a throw unreachable. Instead: read the presentation timestamp (PTS)
// of the frame on screen via requestVideoFrameCallback and learn the frame
// spacing from real timestamps (a seek 1 ms back lands on the previous frame,
// and the PTS difference is exactly one frame; the first step of a source does
// this twice).
//
// Footage can have a variable frame rate (phones, dropped frames), so the
// spacing kept is the shortest one seen: stepping back aims half of it behind
// the current frame and stepping forward 1.5x ahead, which can never pass two
// frames at once. A forward aim that falls short (a longer frame or a gap)
// advances by one more spacing until a new frame shows. Nothing here runs
// during playback: only when a step is requested.

type FrameCallbackMetadata = { mediaTime?: number };

export type FrameSteppableVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: FrameCallbackMetadata) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

// Upper bound for a slow decode (4K, distant keyframe).
const FRAME_READ_TIMEOUT_MS = 2000;
// Once the seek completes, how long to wait for an acceptable frame before
// concluding the target is still inside a frame we did not want.
const SEEKED_GRACE_MS = 120;
const MAX_FORWARD_ATTEMPTS = 8;
const FIRST_FRAME_HOP_SECONDS = 0.0437;

const clampToDuration = (value: number, duration: number) => {
  const upper = Number.isFinite(duration) && duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.min(value, upper));
};

const isPlausibleFrameSpacing = (value: number) => value >= 1 / 1000 && value <= 1 / 5;

// Seeks and resolves with the PTS of the frame the browser ends up showing, or
// null if no acceptable frame arrives. `accept` rejects both a frame queued
// before this seek and a re-presentation of a frame the caller did not want.
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

  let settled = false;
  let callbackId: number | null = null;
  let graceTimer: number | null = null;
  const finish = (value: number | null) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(watchdog);
    if (graceTimer !== null) window.clearTimeout(graceTimer);
    element.removeEventListener('seeked', onSeeked);
    if (callbackId !== null) element.cancelVideoFrameCallback?.(callbackId);
    callbackId = null;
    resolve(value);
  };
  const onSeeked = () => {
    // Give up through one more rendering step: video frame callbacks run
    // before animation frame callbacks, so a frame that is just about to be
    // presented still wins.
    graceTimer = window.setTimeout(() => {
      window.requestAnimationFrame(() => finish(null));
    }, SEEKED_GRACE_MS);
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
  element.addEventListener('seeked', onSeeked, { once: true });
  callbackId = element.requestVideoFrameCallback(onFrame);
  element.currentTime = time;
});

// Moves one frame forward (1) or back (-1) and resolves with the PTS of the
// frame now on screen. `presentedFrameTime` is the PTS of the frame currently
// shown; `frameSpacing` keeps the shortest spacing seen for this source and
// must be reset to null whenever the source changes.
export const stepOneFrame = async (
  element: FrameSteppableVideo,
  direction: 1 | -1,
  presentedFrameTime: number,
  frameSpacing: { current: number | null },
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
  const recordSpacing = (value: number) => {
    if (!baseIsExact || !isPlausibleFrameSpacing(value)) return;
    if (frameSpacing.current === null || value < frameSpacing.current) frameSpacing.current = value;
  };

  if (direction < 0 && base <= 1e-3) return base;

  let onScreen = base;
  if (frameSpacing.current === null && baseIsExact) {
    // Learn from two consecutive frame pairs: a single pair could straddle a
    // dropped frame and read double. Each probe 1 ms back shows the frame
    // before the one it starts from.
    let from = base;
    if (base <= 2e-3) {
      // First frame: nothing behind it, so hop a little ahead first (an offset
      // that is not a frame boundary at common rates).
      const ahead = await seekAndReadFrameTime(element, base + FIRST_FRAME_HOP_SECONDS, isAfterBase);
      if (ahead !== null) {
        from = ahead;
        onScreen = ahead;
      }
    }
    for (let probe = 0; probe < 2 && from > 2e-3; probe += 1) {
      const start = from;
      const previous = await seekAndReadFrameTime(element, start - 1e-3, (pts) => pts < start - 1e-5);
      if (previous === null) break;
      recordSpacing(start - previous);
      onScreen = previous;
      from = previous;
    }
  }

  const spacing = frameSpacing.current ?? 1 / 30;

  // A probe may have left the wanted frame on screen already, and seeking to
  // the frame on screen need not report anything. Within just under two
  // spacings of base there is only room for the neighbouring frame.
  const neighbourReach = 1.9 * spacing;
  if (onScreen !== base) {
    const isNeighbour = direction > 0
      ? isAfterBase(onScreen) && onScreen - base < neighbourReach
      : isBeforeBase(onScreen) && base - onScreen < neighbourReach;
    if (isNeighbour) return onScreen;
  }

  if (direction < 0) {
    // Every frame lasts at least `spacing`, so half of it back is always
    // inside the previous frame.
    const target = clampToDuration(base - 0.5 * spacing, element.duration);
    const landed = await seekAndReadFrameTime(element, target, isBeforeBase);
    if (landed === null) return target;
    recordSpacing(base - landed);
    return landed;
  }

  // Aim 1.5x ahead; if that is still inside the current frame, move on by one
  // spacing at a time: never further than the frame after next can start.
  for (let attempt = 0; attempt < MAX_FORWARD_ATTEMPTS; attempt += 1) {
    const offset = (1.5 + attempt) * spacing;
    const target = clampToDuration(base + offset, element.duration);
    const landed = await seekAndReadFrameTime(element, target, isAfterBase);
    if (landed !== null) {
      if (attempt === 0) recordSpacing(landed - base);
      return landed;
    }
    // Past the end: the current frame is the last one.
    if (target < base + offset) break;
  }
  return base;
};
