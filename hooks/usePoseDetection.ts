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

// Global cache for PRIMARY model instance
let cachedPoseLandmarker: PoseLandmarker | null = null;
let isModelLoading = false;
let modelLoadPromise: Promise<PoseLandmarker | null> | null = null;
let modelLoadError: string | null = null;

// Global cache for SECONDARY model instance (for dual video mode)
let cachedPoseLandmarker2: PoseLandmarker | null = null;
let isModel2Loading = false;
let model2LoadPromise: Promise<PoseLandmarker | null> | null = null;

// Detect iOS/Safari for compatibility
function isIOSorSafari(): boolean {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    return isIOS || isSafari;
}

// Create a new PoseLandmarker instance
async function createPoseLandmarkerInstance(): Promise<PoseLandmarker | null> {
    try {
        const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        const useGPU = !isIOSorSafari();
        const modelPath = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

        if (useGPU) {
            try {
                return await PoseLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: modelPath,
                        delegate: 'GPU',
                    },
                    runningMode: 'VIDEO',
                    numPoses: 1,
                });
            } catch (gpuError) {
                console.warn('[PoseDetection] GPU delegate failed, falling back to CPU:', gpuError);
                return await PoseLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: modelPath,
                        delegate: 'CPU',
                    },
                    runningMode: 'VIDEO',
                    numPoses: 1,
                });
            }
        } else {
            return await PoseLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: modelPath,
                    delegate: 'CPU',
                },
                runningMode: 'VIDEO',
                numPoses: 1,
            });
        }
    } catch (err) {
        console.error('[PoseDetection] Error creating PoseLandmarker instance:', err);
        return null;
    }
}

// Preload the PRIMARY model on module load
async function preloadModel(): Promise<PoseLandmarker | null> {
    if (cachedPoseLandmarker) return cachedPoseLandmarker;
    if (modelLoadPromise) return modelLoadPromise;

    isModelLoading = true;
    modelLoadError = null;

    console.log('[PoseDetection] Starting PRIMARY model preload...');

    modelLoadPromise = (async () => {
        try {
            cachedPoseLandmarker = await createPoseLandmarkerInstance();
            if (cachedPoseLandmarker) {
                console.log('[PoseDetection] PRIMARY model loaded successfully!');
            } else {
                modelLoadError = 'Error al cargar el modelo de detección';
            }
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

// Load SECONDARY model for dual video mode
async function loadSecondaryModel(): Promise<PoseLandmarker | null> {
    if (cachedPoseLandmarker2) return cachedPoseLandmarker2;
    if (model2LoadPromise) return model2LoadPromise;

    isModel2Loading = true;
    console.log('[PoseDetection] Starting SECONDARY model load for dual video...');

    model2LoadPromise = (async () => {
        try {
            cachedPoseLandmarker2 = await createPoseLandmarkerInstance();
            if (cachedPoseLandmarker2) {
                console.log('[PoseDetection] SECONDARY model loaded successfully!');
            }
            return cachedPoseLandmarker2;
        } catch (err) {
            console.error('[PoseDetection] Error loading secondary model:', err);
            return null;
        } finally {
            isModel2Loading = false;
        }
    })();

    return model2LoadPromise;
}

// Start preloading immediately when module is imported
preloadModel();

// Export for explicit preload call from App.tsx if needed
export function preloadPoseModel() {
    return preloadModel();
}

export function usePoseDetection(
    videoRef: React.RefObject<HTMLVideoElement>,
    enabled: boolean,
    secondVideoRef?: React.RefObject<HTMLVideoElement> | null
) {
    const animationFrameRef = useRef<number | null>(null);
    const landmarksRef = useRef<NormalizedLandmark[] | null>(null);
    const landmarks2Ref = useRef<NormalizedLandmark[] | null>(null);
    // Track timestamps to avoid processing same frame twice
    const lastTime1 = useRef<number>(-1);
    const lastTime2 = useRef<number>(-1);

    const [landmarks, setLandmarks] = useState<NormalizedLandmark[] | null>(null);
    const [landmarks2, setLandmarks2] = useState<NormalizedLandmark[] | null>(null);
    const [isLoading, setIsLoading] = useState(isModelLoading);
    const [isReady, setIsReady] = useState(!!cachedPoseLandmarker);
    const [error, setError] = useState<string | null>(null);

    // Track if we have the secondary model loaded
    const [hasSecondaryModel, setHasSecondaryModel] = useState(!!cachedPoseLandmarker2);

    // Detection loop using SEPARATE model instances for each video
    const detectPose = useCallback(() => {
        const video = videoRef.current;
        const video2 = secondVideoRef?.current;
        const model1 = cachedPoseLandmarker;
        const model2 = cachedPoseLandmarker2;

        if (!model1 || !enabled) {
            animationFrameRef.current = null;
            return;
        }

        // Process PRIMARY video with model1
        if (video && video.readyState >= 2 && video.videoWidth > 0) {
            const currentTime = video.currentTime;
            // Only process if time changed (avoid processing paused frame repeatedly)
            if (Math.abs(currentTime - lastTime1.current) > 0.001 || lastTime1.current === -1) {
                lastTime1.current = currentTime;
                try {
                    const timestamp1 = performance.now();
                    const results = model1.detectForVideo(video, timestamp1);
                    if (results.landmarks && results.landmarks.length > 0) {
                        landmarksRef.current = results.landmarks[0];
                        setLandmarks(results.landmarks[0]);
                    } else {
                        landmarksRef.current = null;
                        setLandmarks(null);
                    }
                } catch (err) {
                    console.error('[PoseDetection] Detection error (video 1):', err);
                }
            }
        }

        // Process SECONDARY video with model2 (SEPARATE instance!)
        if (video2 && video2.readyState >= 2 && video2.videoWidth > 0 && model2) {
            const currentTime2 = video2.currentTime;
            if (Math.abs(currentTime2 - lastTime2.current) > 0.001 || lastTime2.current === -1) {
                lastTime2.current = currentTime2;
                try {
                    const timestamp2 = performance.now();
                    const results2 = model2.detectForVideo(video2, timestamp2);
                    if (results2.landmarks && results2.landmarks.length > 0) {
                        landmarks2Ref.current = results2.landmarks[0];
                        setLandmarks2(results2.landmarks[0]);
                    } else {
                        landmarks2Ref.current = null;
                        setLandmarks2(null);
                    }
                } catch (err) {
                    console.error('[PoseDetection] Detection error (video 2):', err);
                }
            }
        } else if (!video2 || !secondVideoRef) {
            // No second video, clear landmarks2
            if (landmarks2Ref.current !== null) {
                landmarks2Ref.current = null;
                setLandmarks2(null);
            }
        }

        // Continue detection loop
        animationFrameRef.current = requestAnimationFrame(detectPose);
    }, [videoRef, secondVideoRef, enabled]);

    // Load secondary model when dual video mode is detected
    useEffect(() => {
        if (enabled && secondVideoRef?.current && !cachedPoseLandmarker2 && !isModel2Loading) {
            console.log('[PoseDetection] Dual video mode detected, loading secondary model...');
            loadSecondaryModel().then((model) => {
                if (model) {
                    setHasSecondaryModel(true);
                    console.log('[PoseDetection] Secondary model ready');
                }
            });
        }
    }, [enabled, secondVideoRef]);

    // Start/stop detection based on enabled state
    useEffect(() => {
        if (enabled) {
            console.log('[PoseDetection] Pose detection enabled, starting...');
            // Reset time trackers
            lastTime1.current = -1;
            lastTime2.current = -1;

            // Check if primary model is already loaded
            if (cachedPoseLandmarker) {
                console.log('[PoseDetection] Primary model ready, starting detection loop');
                setIsReady(true);
                setIsLoading(false);
                animationFrameRef.current = requestAnimationFrame(detectPose);
            } else {
                // Model still loading, wait for it
                console.log('[PoseDetection] Waiting for primary model...');
                setIsLoading(true);
                preloadModel().then((model) => {
                    if (model && enabled) {
                        console.log('[PoseDetection] Primary model loaded, starting detection');
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
            landmarks2Ref.current = null;
            setLandmarks(null);
            setLandmarks2(null);
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
        landmarks2,
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

            // Inner circle (point)
            ctx.beginPath();
            ctx.arc(x, y, innerRadius, 0, 2 * Math.PI);
            ctx.fillStyle = POINT_COLOR;
            ctx.fill();
        }
    }
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
