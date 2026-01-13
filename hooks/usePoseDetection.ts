import { useRef, useCallback, useEffect, useState } from 'react';
import {
    PoseLandmarker,
    FilesetResolver,
    NormalizedLandmark,
} from '@mediapipe/tasks-vision';

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
];

// Main body keypoints we want to display (excluding face and hands details)
export const BODY_KEYPOINTS = [
    11, 12, // shoulders
    13, 14, // elbows
    15, 16, // wrists
    23, 24, // hips
    25, 26, // knees
    27, 28, // ankles
];

export interface PoseDetectionResult {
    landmarks: NormalizedLandmark[] | null;
    isLoading: boolean;
    isReady: boolean;
    error: string | null;
}

// Global model cache for faster activation
let cachedPoseLandmarker: PoseLandmarker | null = null;
let isModelLoading = false;
let modelLoadPromise: Promise<PoseLandmarker | null> | null = null;
let modelLoadError: string | null = null;

// Detect iOS/Safari for compatibility
function isIOSorSafari(): boolean {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    return isIOS || isSafari;
}

// Preload the model on module load for instant activation
async function preloadModel(): Promise<PoseLandmarker | null> {
    if (cachedPoseLandmarker) return cachedPoseLandmarker;
    if (modelLoadPromise) return modelLoadPromise;

    isModelLoading = true;
    modelLoadError = null;

    console.log('[PoseDetection] Starting model preload...');
    console.log('[PoseDetection] Device info:', {
        userAgent: navigator.userAgent,
        isIOSorSafari: isIOSorSafari(),
    });

    modelLoadPromise = (async () => {
        try {
            console.log('[PoseDetection] Loading vision WASM...');
            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
            );
            console.log('[PoseDetection] Vision WASM loaded successfully');

            // Use CPU delegate for iOS/Safari as GPU has issues
            // Also use float32 model for better compatibility
            const useGPU = !isIOSorSafari();
            const modelPath = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

            console.log('[PoseDetection] Using delegate:', useGPU ? 'GPU' : 'CPU');

            if (useGPU) {
                // Try GPU first on non-iOS devices
                try {
                    console.log('[PoseDetection] Attempting GPU delegate...');
                    cachedPoseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                        baseOptions: {
                            modelAssetPath: modelPath,
                            delegate: 'GPU',
                        },
                        runningMode: 'VIDEO',
                        numPoses: 1,
                    });
                    console.log('[PoseDetection] GPU delegate succeeded');
                } catch (gpuError) {
                    console.warn('[PoseDetection] GPU delegate failed, falling back to CPU:', gpuError);
                    cachedPoseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                        baseOptions: {
                            modelAssetPath: modelPath,
                            delegate: 'CPU',
                        },
                        runningMode: 'VIDEO',
                        numPoses: 1,
                    });
                    console.log('[PoseDetection] CPU fallback succeeded');
                }
            } else {
                // Force CPU for iOS/Safari
                console.log('[PoseDetection] Using CPU delegate for iOS/Safari compatibility...');
                cachedPoseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: modelPath,
                        delegate: 'CPU',
                    },
                    runningMode: 'VIDEO',
                    numPoses: 1,
                });
                console.log('[PoseDetection] CPU delegate succeeded for iOS/Safari');
            }

            console.log('[PoseDetection] Model loaded successfully!');
            return cachedPoseLandmarker;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error('[PoseDetection] Error preloading PoseLandmarker:', err);
            modelLoadError = errorMessage;
            return null;
        } finally {
            isModelLoading = false;
        }
    })();

    return modelLoadPromise;
}

// Start preloading immediately when module is imported
preloadModel();

// Export for explicit preload call from App.tsx if needed
export function preloadPoseModel() {
    return preloadModel();
}

export function usePoseDetection(
    videoRef: React.RefObject<HTMLVideoElement>,
    enabled: boolean
) {
    const animationFrameRef = useRef<number | null>(null);
    // Track last processed video time to avoid jitter when paused
    const lastVideoTimeRef = useRef<number>(-1);
    // Use ref for landmarks to avoid re-render delays
    const landmarksRef = useRef<NormalizedLandmark[] | null>(null);

    const [landmarks, setLandmarks] = useState<NormalizedLandmark[] | null>(null);
    const [isLoading, setIsLoading] = useState(isModelLoading);
    const [isReady, setIsReady] = useState(!!cachedPoseLandmarker);
    const [error, setError] = useState<string | null>(null);

    // Detection loop - only processes when video time changes to prevent jitter
    const detectPose = useCallback(() => {
        const video = videoRef.current;
        const poseLandmarker = cachedPoseLandmarker;

        if (!video || !poseLandmarker || !enabled) {
            animationFrameRef.current = null;
            return;
        }

        // Only process when video time has changed (prevents jitter when paused)
        // OR if this is the first detection (lastVideoTimeRef.current === -1)
        const currentVideoTime = video.currentTime;
        // Calculate time difference
        const timeDiff = currentVideoTime - lastVideoTimeRef.current;
        const isFirstDetection = lastVideoTimeRef.current === -1;
        const timeChanged = Math.abs(timeDiff) > 0.001 || isFirstDetection;

        // Detect if the user is scrubbing/seeking (large time jump)
        // If jumping > 100ms, reset the model's internal graph to avoid temporal smoothing artifacts (lag)
        if (Math.abs(timeDiff) > 0.1 && !isFirstDetection) {
            // reset() might not be in the type definition but exists in runtime
            if (typeof (poseLandmarker as any).reset === 'function') {
                (poseLandmarker as any).reset();
            }
        }

        if (video.readyState >= 2 && timeChanged) {
            lastVideoTimeRef.current = currentVideoTime;

            try {
                const results = poseLandmarker.detectForVideo(video, performance.now());

                if (results.landmarks && results.landmarks.length > 0) {
                    console.log('[PoseDetection] Landmarks detected:', results.landmarks[0].length, 'points');
                    landmarksRef.current = results.landmarks[0];
                    setLandmarks(results.landmarks[0]);
                } else {
                    console.log('[PoseDetection] No landmarks in this frame');
                    landmarksRef.current = null;
                    setLandmarks(null);
                }
            } catch (err) {
                console.error('[PoseDetection] Detection error:', err);
            }
        }

        // Continue detection loop
        animationFrameRef.current = requestAnimationFrame(detectPose);
    }, [videoRef, enabled]);

    // Start/stop detection based on enabled state
    useEffect(() => {
        if (enabled) {
            console.log('[PoseDetection] Pose detection enabled, starting...');
            // Reset time tracker to force immediate detection on first frame
            lastVideoTimeRef.current = -1;

            // Check if model is already loaded
            if (cachedPoseLandmarker) {
                console.log('[PoseDetection] Model already cached, starting detection loop');
                setIsReady(true);
                setIsLoading(false);
                animationFrameRef.current = requestAnimationFrame(detectPose);
            } else {
                // Model still loading, wait for it
                console.log('[PoseDetection] Model not cached, waiting for preload...');
                setIsLoading(true);
                preloadModel().then((model) => {
                    console.log('[PoseDetection] Preload complete, model:', model ? 'loaded' : 'failed');
                    if (model && enabled) {
                        console.log('[PoseDetection] Starting detection loop');
                        setIsReady(true);
                        setIsLoading(false);
                        animationFrameRef.current = requestAnimationFrame(detectPose);
                    } else if (!model) {
                        const errorMsg = modelLoadError || 'Error al cargar el modelo de detección';
                        console.error('[PoseDetection] Model failed to load:', errorMsg);
                        setError(errorMsg);
                        setIsLoading(false);
                    }
                });
            }
        } else {
            // Stop detection
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            landmarksRef.current = null;
            setLandmarks(null);
        }

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, [enabled, detectPose]);

    return {
        landmarks,
        isLoading,
        isReady,
        error,
    };
}

// Helper function to draw pose on canvas
export function drawPoseOnCanvas(
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    canvasWidth: number,
    canvasHeight: number
) {
    // Colors matching the reference image
    const POINT_COLOR = '#4F46E5'; // Indigo for points
    const POINT_BORDER = '#22C55E'; // Green border
    const LINE_COLOR = '#FACC15'; // Yellow for lines

    // Responsive sizing based on canvas width
    // Base scale: assuming ~1000px is standard desktop view
    // Mobile (~350px) will differ from Desktop (~1200px)
    const scaleFactor = Math.max(0.6, Math.min(1.2, canvasWidth / 800));

    // Dynamic sizes
    const lineWidth = Math.max(1, 2 * scaleFactor);
    const outerRadius = Math.max(3, 5 * scaleFactor); // Was 6 fixed (approx)
    const innerRadius = Math.max(1.5, 3 * scaleFactor); // Was 4 fixed (approx)

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
            const x1 = start.x * canvasWidth;
            const y1 = start.y * canvasHeight;
            const x2 = end.x * canvasWidth;
            const y2 = end.y * canvasHeight;

            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
        }
    }
    ctx.stroke();

    // Draw keypoints (Responsive circles)
    for (const idx of BODY_KEYPOINTS) {
        const point = landmarks[idx];

        if (point && point.visibility > 0.5) {
            const x = point.x * canvasWidth;
            const y = point.y * canvasHeight;

            // Outer circle (border)
            ctx.beginPath();
            ctx.arc(x, y, outerRadius, 0, 2 * Math.PI);
            ctx.fillStyle = POINT_BORDER;
            ctx.fill();

            // Inner circle
            ctx.beginPath();
            ctx.arc(x, y, innerRadius, 0, 2 * Math.PI);
            ctx.fillStyle = POINT_COLOR;
            ctx.fill();
        }
    }
}

// Helper function to draw pose on canvas with offset (for letterboxing/pillarboxing)
export function drawPoseOnCanvasWithOffset(
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    contentWidth: number,
    contentHeight: number,
    offsetX: number,
    offsetY: number
) {
    // Colors matching the reference image
    const POINT_COLOR = '#4F46E5'; // Indigo for points
    const POINT_BORDER = '#22C55E'; // Green border
    const LINE_COLOR = '#FACC15'; // Yellow for lines

    // Responsive sizing based on content width
    const scaleFactor = Math.max(0.6, Math.min(1.2, contentWidth / 800));

    // Dynamic sizes
    const lineWidth = Math.max(1, 2 * scaleFactor);
    const outerRadius = Math.max(3, 5 * scaleFactor);
    const innerRadius = Math.max(1.5, 3 * scaleFactor);

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
            // Apply offset to coordinates
            const x1 = start.x * contentWidth + offsetX;
            const y1 = start.y * contentHeight + offsetY;
            const x2 = end.x * contentWidth + offsetX;
            const y2 = end.y * contentHeight + offsetY;

            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
        }
    }
    ctx.stroke();

    // Draw keypoints (Responsive circles)
    for (const idx of BODY_KEYPOINTS) {
        const point = landmarks[idx];

        if (point && point.visibility > 0.5) {
            // Apply offset to coordinates
            const x = point.x * contentWidth + offsetX;
            const y = point.y * contentHeight + offsetY;

            // Outer circle (border)
            ctx.beginPath();
            ctx.arc(x, y, outerRadius, 0, 2 * Math.PI);
            ctx.fillStyle = POINT_BORDER;
            ctx.fill();

            // Inner circle
            ctx.beginPath();
            ctx.arc(x, y, innerRadius, 0, 2 * Math.PI);
            ctx.fillStyle = POINT_COLOR;
            ctx.fill();
        }
    }
}
