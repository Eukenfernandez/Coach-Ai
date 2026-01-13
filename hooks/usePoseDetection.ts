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

// Preload the model on module load for instant activation
async function preloadModel(): Promise<PoseLandmarker | null> {
    if (cachedPoseLandmarker) return cachedPoseLandmarker;
    if (modelLoadPromise) return modelLoadPromise;

    isModelLoading = true;
    modelLoadPromise = (async () => {
        try {
            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
            );

            cachedPoseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
                    delegate: 'GPU',
                },
                runningMode: 'VIDEO',
                numPoses: 1,
            });

            return cachedPoseLandmarker;
        } catch (err) {
            console.error('Error preloading PoseLandmarker:', err);
            return null;
        } finally {
            isModelLoading = false;
        }
    })();

    return modelLoadPromise;
}

// Start preloading immediately when module is imported
preloadModel();

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
        const currentVideoTime = video.currentTime;
        const timeChanged = Math.abs(currentVideoTime - lastVideoTimeRef.current) > 0.001;

        if (video.readyState >= 2 && timeChanged) {
            lastVideoTimeRef.current = currentVideoTime;

            try {
                const results = poseLandmarker.detectForVideo(video, performance.now());

                if (results.landmarks && results.landmarks.length > 0) {
                    landmarksRef.current = results.landmarks[0];
                    setLandmarks(results.landmarks[0]);
                } else {
                    landmarksRef.current = null;
                    setLandmarks(null);
                }
            } catch (err) {
                // Silently handle detection errors to avoid console spam
            }
        }

        // Continue detection loop
        animationFrameRef.current = requestAnimationFrame(detectPose);
    }, [videoRef, enabled]);

    // Start/stop detection based on enabled state
    useEffect(() => {
        if (enabled) {
            // Reset time tracker to force immediate detection on first frame
            lastVideoTimeRef.current = -1;

            // Check if model is already loaded
            if (cachedPoseLandmarker) {
                setIsReady(true);
                setIsLoading(false);
                animationFrameRef.current = requestAnimationFrame(detectPose);
            } else {
                // Model still loading, wait for it
                setIsLoading(true);
                preloadModel().then((model) => {
                    if (model && enabled) {
                        setIsReady(true);
                        setIsLoading(false);
                        animationFrameRef.current = requestAnimationFrame(detectPose);
                    } else if (!model) {
                        setError('Error al cargar el modelo de detección');
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

    // SMALLER line width for cleaner look
    ctx.lineWidth = 2;
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

    // Draw keypoints (SMALLER circles with border)
    for (const idx of BODY_KEYPOINTS) {
        const point = landmarks[idx];

        if (point && point.visibility > 0.5) {
            const x = point.x * canvasWidth;
            const y = point.y * canvasHeight;

            // Outer circle (border) - SMALLER: was 10, now 6
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = POINT_BORDER;
            ctx.fill();

            // Inner circle - SMALLER: was 6, now 4
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fillStyle = POINT_COLOR;
            ctx.fill();
        }
    }
}
