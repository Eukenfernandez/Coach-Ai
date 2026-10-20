import { useCallback, useEffect, useState } from 'react';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

// Keep the runtime assets on the exact same version as the installed JS package
// (and the copy vendored for the worker in pub/vendor). Using `@latest` can
// silently load an incompatible WASM build and is especially likely to fail in
// Safari after a new MediaPipe release is published.
const MEDIAPIPE_VERSION = '0.10.22-rc.20250304';
const MEDIAPIPE_WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const POSE_MODEL_BASE = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker';
// "full" is far more precise than "lite" on athletes who fill little of the
// frame; "heavy" is the most precise but too slow for a phone's CPU path.
const POSE_MODEL_FULL_URL = `${POSE_MODEL_BASE}/pose_landmarker_full/float16/1/pose_landmarker_full.task`;
const POSE_MODEL_HEAVY_URL = `${POSE_MODEL_BASE}/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task`;

// While playing, analyse at most ~20 frames a second; paused frames are always
// analysed as soon as they are on screen.
const PLAYBACK_INTERVAL_MS = 1000 / 20;
// A skeleton further than this from the frame on screen belongs to another
// moment: hide it instead of drawing it over the wrong body position.
const STALE_SKELETON_SECONDS = 0.2;
// Consecutive playback frames closer than this are smoothed together.
const CONTINUOUS_FRAME_SECONDS = 0.25;
const ENGINE_INIT_TIMEOUT_MS = 90000;

const POSE_DEBUG = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);
const poseLog = (...args: any[]) => {
    if (POSE_DEBUG) console.log(...args);
};
const poseWarn = (...args: any[]) => {
    if (POSE_DEBUG) console.warn(...args);
};

// Keypoint connections for drawing skeleton lines
// Based on MediaPipe Pose landmark indices
export const POSE_CONNECTIONS: [number, number][] = [
    // Torso
    [11, 12], // shoulders
    [11, 23], // left shoulder to left hip
    [12, 24], // right shoulder to right hip
    [23, 24], // hips

    // Left arm
    [11, 13], // left shoulder to left elbow
    [13, 15], // left elbow to left wrist

    // Right arm
    [12, 14], // right shoulder to right elbow
    [14, 16], // right elbow to right wrist

    // Left leg
    [23, 25], // left hip to left knee
    [25, 27], // left knee to left ankle

    // Right leg
    [24, 26], // right hip to right knee
    [26, 28], // right knee to right ankle

    // Left foot
    [27, 29], // left ankle to left heel
    [29, 31], // left heel to left toe
    [27, 31], // left ankle to left toe

    // Right foot
    [28, 30], // right ankle to right heel
    [30, 32], // right heel to right toe
    [28, 32], // right ankle to right toe
];

// Main body keypoints we want to display (excluding face and hands details)
export const BODY_KEYPOINTS = [
    11, 12, // shoulders
    13, 14, // elbows
    15, 16, // wrists
    23, 24, // hips
    25, 26, // knees
    27, 28, // ankles
    29, 30, // heels
    31, 32, // toes
];

export interface PoseDetectionResult {
    landmarks: NormalizedLandmark[] | null;
    isLoading: boolean;
    isReady: boolean;
    error: string | null;
}

interface PoseEngine {
    /** Takes ownership of the bitmap. */
    detect(bitmap: ImageBitmap): Promise<NormalizedLandmark[] | null>;
}

// iOS/iPadOS stays on the CPU delegate: its WebGL path has been unreliable for
// MediaPipe. Everything else tries the GPU first, with a CPU fallback.
function isIOSDevice(): boolean {
    const ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isMobileDevice(): boolean {
    return isIOSDevice()
        || /Android/i.test(navigator.userAgent)
        || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
}

const getEngineConfig = () => {
    const mobile = isMobileDevice();
    return {
        wasmRoot: MEDIAPIPE_WASM_ROOT,
        modelUrl: mobile ? POSE_MODEL_FULL_URL : POSE_MODEL_HEAVY_URL,
        delegate: (isIOSDevice() ? 'CPU' : 'GPU') as 'CPU' | 'GPU',
        // Long side of the frame handed to the model. The landmark stage crops
        // the athlete from this image, so more pixels help small subjects.
        maxInputSide: mobile ? 960 : 1280,
    };
};

type EngineConfig = ReturnType<typeof getEngineConfig>;

function createWorkerEngine(config: EngineConfig): Promise<PoseEngine> {
    return new Promise((resolve, reject) => {
        let worker: Worker;
        try {
            worker = new Worker(new URL('/pose-worker.js', window.location.href));
        } catch (error) {
            reject(error);
            return;
        }

        let nextId = 1;
        let ready = false;
        const pending = new Map<number, { resolve: (value: NormalizedLandmark[] | null) => void; reject: (error: Error) => void }>();

        const fail = (error: Error) => {
            window.clearTimeout(initTimer);
            pending.forEach((request) => request.reject(error));
            pending.clear();
            worker.terminate();
            reject(error);
        };

        const initTimer = window.setTimeout(() => fail(new Error('El modelo de detección tardó demasiado en cargar')), ENGINE_INIT_TIMEOUT_MS);

        const engine: PoseEngine = {
            detect(bitmap) {
                return new Promise((resolveDetect, rejectDetect) => {
                    const id = nextId++;
                    pending.set(id, { resolve: resolveDetect, reject: rejectDetect });
                    worker.postMessage({ type: 'detect', id, bitmap }, [bitmap]);
                });
            },
        };

        worker.onmessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'ready') {
                ready = true;
                window.clearTimeout(initTimer);
                poseLog('[PoseDetection] Worker ready on', message.delegate);
                resolve(engine);
            } else if (message.type === 'error') {
                fail(new Error(message.message || 'Error al cargar el modelo de detección'));
            } else if (message.type === 'result') {
                const request = pending.get(message.id);
                if (!request) return;
                pending.delete(message.id);
                if (message.error) poseWarn('[PoseDetection] Detection error:', message.error);
                else poseLog('[PoseDetection] Inference ms:', Math.round(message.ms));
                request.resolve(message.landmarks);
            }
        };

        worker.onerror = (event) => {
            event.preventDefault();
            if (!ready) {
                fail(new Error(event.message || 'No se pudo iniciar el detector'));
                return;
            }
            pending.forEach((request) => request.reject(new Error(event.message || 'Detector error')));
            pending.clear();
        };

        worker.postMessage({ type: 'init', wasmRoot: config.wasmRoot, modelUrl: config.modelUrl, delegate: config.delegate });
    });
}

// Same model on the main thread, for shells where the worker cannot start
// (e.g. a file:// Electron build). Slower to keep the UI smooth, but correct.
async function createMainThreadEngine(config: EngineConfig): Promise<PoseEngine> {
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(config.wasmRoot);
    const create = (delegate: 'CPU' | 'GPU') => PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: config.modelUrl, delegate },
        runningMode: 'IMAGE',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
    });

    let landmarker;
    try {
        landmarker = await create(config.delegate);
    } catch (error) {
        if (config.delegate !== 'GPU') throw error;
        landmarker = await create('CPU');
    }

    return {
        async detect(bitmap) {
            try {
                const result = landmarker.detect(bitmap);
                return result.landmarks?.[0] ?? null;
            } finally {
                bitmap.close();
            }
        },
    };
}

let enginePromise: Promise<PoseEngine> | null = null;
// True while enginePromise may still fall back to the main thread.
let enginePromiseAllowsFallback = false;
let readyEngine: PoseEngine | null = null;
let engineConfig: EngineConfig | null = null;

function loadEngine(allowMainThread: boolean): Promise<PoseEngine> {
    engineConfig = engineConfig ?? getEngineConfig();
    const config = engineConfig;
    return createWorkerEngine(config)
        .catch((workerError) => {
            if (!allowMainThread) throw workerError;
            poseWarn('[PoseDetection] Worker unavailable, using the main thread:', workerError);
            return createMainThreadEngine(config);
        })
        .then((engine) => {
            readyEngine = engine;
            return engine;
        });
}

function getPoseEngine(): Promise<PoseEngine> {
    if (readyEngine) return Promise.resolve(readyEngine);
    if (!enginePromise || !enginePromiseAllowsFallback) {
        // A background warm-up still in flight is reused; if it fails, the
        // explicit request retries with the main-thread fallback allowed.
        const warmUp = enginePromise;
        const request: Promise<PoseEngine> = (warmUp ? warmUp.catch(() => loadEngine(true)) : loadEngine(true))
            .catch((error) => {
                // A failed load must stay retryable from the pose button.
                if (enginePromise === request) enginePromise = null;
                throw error;
            });
        enginePromise = request;
        enginePromiseAllowsFallback = true;
    }
    return enginePromise;
}

/**
 * Starts loading the detector in the background so the pose button responds
 * at once. Desktop only: on a phone the download (~18 MB) and the WASM compile
 * competed with the video the user was scrubbing, so phones load it when the
 * button is pressed. It never falls back to the main thread on its own.
 */
export function warmPoseDetector() {
    if (isMobileDevice() || readyEngine || enginePromise) return;
    const connection = (navigator as any).connection;
    if (connection?.saveData || /(^|-)2g$|^3g$/.test(connection?.effectiveType || '')) return;
    const warmUp: Promise<PoseEngine> = loadEngine(false).catch((error) => {
        if (enginePromise === warmUp) enginePromise = null;
        throw error;
    });
    warmUp.catch(() => {});
    enginePromise = warmUp;
    enginePromiseAllowsFallback = false;
}

async function grabFrame(video: HTMLVideoElement, maxSide: number): Promise<ImageBitmap> {
    const longSide = Math.max(video.videoWidth, video.videoHeight);
    if (longSide > maxSide) {
        const scale = maxSide / longSide;
        try {
            return await createImageBitmap(video, {
                resizeWidth: Math.round(video.videoWidth * scale),
                resizeHeight: Math.round(video.videoHeight * scale),
                resizeQuality: 'medium',
            });
        } catch {
            // Resize options unsupported: send the full frame.
        }
    }
    return createImageBitmap(video);
}

// One Euro filter (Casiez et al.): smooths jitter at low speed while letting
// fast movement through with little lag. Only used across continuous playback
// frames; paused frames show the raw, frame-exact result.
const SMOOTHING_MIN_CUTOFF_HZ = 3;
const SMOOTHING_BETA = 10;
const SMOOTHING_DERIVATIVE_CUTOFF_HZ = 1;

const smoothingAlpha = (cutoffHz: number, dt: number) => {
    const tau = 1 / (2 * Math.PI * cutoffHz);
    return 1 / (1 + tau / dt);
};

class LandmarkSmoother {
    private values: number[] | null = null;
    private derivatives: number[] | null = null;
    private lastTime = 0;

    reset(landmarks: NormalizedLandmark[], time: number) {
        this.values = landmarks.flatMap((point) => [point.x, point.y, point.z]);
        this.derivatives = this.values.map(() => 0);
        this.lastTime = time;
        return landmarks;
    }

    clear() {
        this.values = null;
        this.derivatives = null;
    }

    apply(landmarks: NormalizedLandmark[], time: number) {
        const dt = time - this.lastTime;
        if (!this.values || !this.derivatives || dt <= 0 || this.values.length !== landmarks.length * 3) {
            return this.reset(landmarks, time);
        }

        const derivativeAlpha = smoothingAlpha(SMOOTHING_DERIVATIVE_CUTOFF_HZ, dt);
        const smoothed = landmarks.map((point, index) => {
            const raw = [point.x, point.y, point.z];
            const next = raw.map((value, axis) => {
                const slot = index * 3 + axis;
                const previous = this.values![slot];
                const derivative = derivativeAlpha * ((value - previous) / dt) + (1 - derivativeAlpha) * this.derivatives![slot];
                this.derivatives![slot] = derivative;
                const alpha = smoothingAlpha(SMOOTHING_MIN_CUTOFF_HZ + SMOOTHING_BETA * Math.abs(derivative), dt);
                const filtered = alpha * value + (1 - alpha) * previous;
                this.values![slot] = filtered;
                return filtered;
            });
            return { ...point, x: next[0], y: next[1], z: next[2] };
        });

        this.lastTime = time;
        return smoothed;
    }
}

type FrameCallbackVideo = HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: () => void) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
};

/**
 * Keeps one video's skeleton in step with the frame on screen: every newly
 * presented frame is sent to the detector, one at a time, always the latest
 * one, so after a fast scrub the detector jumps straight to where the user
 * stopped instead of working through a backlog.
 */
function trackVideoPose(
    videoRef: React.RefObject<HTMLVideoElement>,
    engine: PoseEngine,
    maxInputSide: number,
    onResult: (landmarks: NormalizedLandmark[] | null) => void,
): () => void {
    let cancelled = false;
    let element: FrameCallbackVideo | null = null;
    let frameHandle: number | null = null;
    let playbackTimer: number | null = null;
    let inFlight = false;
    let dirty = true;
    let lastProcessedTime: number | null = null;
    let lastResultTime: number | null = null;
    let lastStartedAt = -Infinity;
    const smoother = new LandmarkSmoother();

    const showResult = (landmarks: NormalizedLandmark[] | null, frameTime: number | null) => {
        lastResultTime = landmarks ? frameTime : null;
        onResult(landmarks);
    };

    const pump = async () => {
        const video = element;
        if (cancelled || !video || inFlight || !dirty) return;
        if (video.readyState < 2 || !video.videoWidth || video.seeking) return;

        const frameTime = video.currentTime;
        if (lastResultTime !== null && Math.abs(frameTime - lastResultTime) > STALE_SKELETON_SECONDS) {
            smoother.clear();
            showResult(null, null);
        }
        if (lastProcessedTime !== null && Math.abs(frameTime - lastProcessedTime) < 1e-4) {
            dirty = false;
            return;
        }
        if (!video.paused) {
            const wait = PLAYBACK_INTERVAL_MS - (performance.now() - lastStartedAt);
            if (wait > 0) {
                if (playbackTimer === null) {
                    playbackTimer = window.setTimeout(() => {
                        playbackTimer = null;
                        void pump();
                    }, wait);
                }
                return;
            }
        }

        const previousTime = lastProcessedTime;
        dirty = false;
        inFlight = true;
        lastProcessedTime = frameTime;
        lastStartedAt = performance.now();

        try {
            const bitmap = await grabFrame(video, maxInputSide);
            const landmarks = await engine.detect(bitmap);
            if (cancelled || element !== video) return;

            // The user may have moved on while the frame was being analysed.
            if (Math.abs(video.currentTime - frameTime) > STALE_SKELETON_SECONDS) {
                dirty = true;
                return;
            }

            const continuous = !video.paused
                && previousTime !== null
                && frameTime > previousTime
                && frameTime - previousTime < CONTINUOUS_FRAME_SECONDS;
            if (!landmarks) {
                smoother.clear();
                showResult(null, null);
            } else {
                showResult(continuous ? smoother.apply(landmarks, frameTime) : smoother.reset(landmarks, frameTime), frameTime);
            }
        } catch (error) {
            poseWarn('[PoseDetection] Frame skipped:', error);
        } finally {
            inFlight = false;
            if (!cancelled) void pump();
        }
    };

    const markFrame = () => {
        dirty = true;
        void pump();
    };

    const onPresentedFrame = () => {
        if (cancelled || !element) return;
        markFrame();
        frameHandle = element.requestVideoFrameCallback?.(onPresentedFrame) ?? null;
    };

    // Browsers without requestVideoFrameCallback: poll while playing.
    const pollPlayback = () => {
        if (cancelled || !element) return;
        if (!element.paused) markFrame();
        frameHandle = requestAnimationFrame(pollPlayback);
    };

    const detach = () => {
        if (!element) return;
        if (frameHandle !== null) {
            if (typeof element.cancelVideoFrameCallback === 'function') {
                element.cancelVideoFrameCallback(frameHandle);
            } else {
                cancelAnimationFrame(frameHandle);
            }
        }
        frameHandle = null;
        element.removeEventListener('seeked', markFrame);
        element.removeEventListener('loadeddata', markFrame);
        element.removeEventListener('play', markFrame);
        element = null;
    };

    const attach = (video: FrameCallbackVideo) => {
        element = video;
        lastProcessedTime = null;
        video.addEventListener('seeked', markFrame);
        video.addEventListener('loadeddata', markFrame);
        video.addEventListener('play', markFrame);
        if (typeof video.requestVideoFrameCallback === 'function') {
            frameHandle = video.requestVideoFrameCallback(onPresentedFrame);
        } else {
            frameHandle = requestAnimationFrame(pollPlayback);
        }
        markFrame();
    };

    // The <video> can mount after detection is switched on, or be replaced.
    const syncElement = () => {
        const current = videoRef.current as FrameCallbackVideo | null;
        if (current === element) return;
        detach();
        smoother.clear();
        showResult(null, null);
        if (current) attach(current);
    };

    syncElement();
    const elementWatch = window.setInterval(syncElement, 500);

    return () => {
        cancelled = true;
        window.clearInterval(elementWatch);
        if (playbackTimer !== null) window.clearTimeout(playbackTimer);
        detach();
    };
}

export function usePoseDetection(
    videoRef: React.RefObject<HTMLVideoElement>,
    enabled: boolean,
    secondVideoRef?: React.RefObject<HTMLVideoElement> | null
) {
    const [landmarks, setLandmarks] = useState<NormalizedLandmark[] | null>(null);
    const [landmarks2, setLandmarks2] = useState<NormalizedLandmark[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isReady, setIsReady] = useState(!!readyEngine);
    const [error, setError] = useState<string | null>(null);
    const [loadAttempt, setLoadAttempt] = useState(0);

    // Load the engine when detection is switched on (instantly if it was
    // warmed up in the background).
    useEffect(() => {
        if (readyEngine) {
            setIsReady(true);
            setIsLoading(false);
            setError(null);
            return;
        }
        if (!enabled) {
            setIsLoading(false);
            return;
        }

        let cancelled = false;
        setIsLoading(true);
        setError(null);
        getPoseEngine()
            .then(() => {
                if (cancelled) return;
                setIsReady(true);
                setIsLoading(false);
            })
            .catch((loadError) => {
                if (cancelled) return;
                console.error('[PoseDetection] Model failed to load:', loadError);
                setIsReady(false);
                setIsLoading(false);
                setError(loadError instanceof Error ? loadError.message : 'Error al cargar el modelo de detección');
            });

        return () => {
            cancelled = true;
        };
    }, [enabled, loadAttempt]);

    const retry = useCallback(async () => {
        setLoadAttempt((attempt) => attempt + 1);
        try {
            await getPoseEngine();
            return true;
        } catch {
            return false;
        }
    }, []);

    useEffect(() => {
        if (!enabled || !isReady || !readyEngine) {
            setLandmarks(null);
            setLandmarks2(null);
            return;
        }

        const maxInputSide = (engineConfig ?? getEngineConfig()).maxInputSide;
        const stopPrimary = trackVideoPose(videoRef, readyEngine, maxInputSide, setLandmarks);
        const stopSecondary = secondVideoRef
            ? trackVideoPose(secondVideoRef, readyEngine, maxInputSide, setLandmarks2)
            : null;
        if (!secondVideoRef) setLandmarks2(null);

        return () => {
            stopPrimary();
            stopSecondary?.();
        };
    }, [enabled, isReady, videoRef, secondVideoRef]);

    return {
        landmarks,
        landmarks2,
        isLoading,
        isReady,
        error,
        retry,
    };
}

// Helper function to draw pose on canvas
export function drawPoseOnCanvas(
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    canvasWidth: number,
    canvasHeight: number
) {
    drawPoseOnCanvasWithOffset(ctx, landmarks, canvasWidth, canvasHeight, 0, 0);
}

// Helper function to draw pose on canvas with offset correction
export function drawPoseOnCanvasWithOffset(
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    canvasWidth: number,
    canvasHeight: number,
    offsetX: number,
    offsetY: number
) {
    // Colors matching the reference image
    const POINT_COLOR = '#4F46E5'; // Indigo for points
    const POINT_BORDER = '#22C55E'; // Green border
    const LINE_COLOR = '#FACC15'; // Yellow for lines

    // FIXED sizes for consistent appearance across all videos
    // Using small fixed values to match the left video reference
    const lineWidth = 2;
    const outerRadius = 4;
    const innerRadius = 2;

    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw connections (lines)
    ctx.strokeStyle = LINE_COLOR;
    ctx.beginPath();

    for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
        const start = landmarks[startIdx];
        const end = landmarks[endIdx];

        if (start && end && start.visibility > 0.5 && end.visibility > 0.5) {
            const x1 = start.x * canvasWidth + offsetX;
            const y1 = start.y * canvasHeight + offsetY;
            const x2 = end.x * canvasWidth + offsetX;
            const y2 = end.y * canvasHeight + offsetY;

            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
        }
    }
    ctx.stroke();

    // Draw keypoints (Responsive circles)
    for (const idx of BODY_KEYPOINTS) {
        const point = landmarks[idx];

        if (point && point.visibility > 0.5) {
            const x = point.x * canvasWidth + offsetX;
            const y = point.y * canvasHeight + offsetY;

            // Outer circle (border)
            ctx.beginPath();
            ctx.arc(x, y, outerRadius, 0, 2 * Math.PI);
            ctx.fillStyle = POINT_BORDER;
            ctx.fill();

            // Inner circle (point)
            ctx.beginPath();
            ctx.arc(x, y, innerRadius, 0, 2 * Math.PI);
            ctx.fillStyle = POINT_COLOR;
            ctx.fill();
        }
    }
}
