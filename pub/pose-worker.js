// Coach AI - Pose detection worker.
//
// Runs MediaPipe Pose Landmarker off the main thread so inference never blocks
// playback or a scrubbing drag. It is a classic worker on purpose: MediaPipe
// loads its WASM glue with importScripts(), which module workers do not allow.
// The vendored file is the package's CommonJS build (jsDelivr serves it with a
// non-JavaScript MIME type, which importScripts refuses), so it gets a minimal
// `exports` object to write into.
//
// Every frame is analysed independently (runningMode IMAGE). VIDEO mode tracks
// from the previous frame's landmarks, which after a jump in the timeline sends
// it looking in the wrong place and draws a garbled skeleton.
(() => {
    self.exports = {};
    self.module = { exports: self.exports };
    importScripts('vendor/mediapipe-tasks-vision-0.10.22-rc.20250304.js');
    const { FilesetResolver, PoseLandmarker } = self.module.exports;

    // The model host only allows an hour of HTTP caching; Cache Storage keeps
    // the weights so later sessions start without downloading them again.
    const MODEL_CACHE = 'coachai-pose-models-v1';

    let landmarker = null;

    const loadModel = async (url) => {
        try {
            const cache = await caches.open(MODEL_CACHE);
            const cached = await cache.match(url);
            if (cached) return new Uint8Array(await cached.arrayBuffer());

            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) throw new Error(`model download failed: ${response.status}`);
            await cache.put(url, response.clone());
            return new Uint8Array(await response.arrayBuffer());
        } catch (cacheError) {
            // Cache Storage can be unavailable (some WebView schemes, private
            // modes): fall back to a plain download.
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) throw new Error(`model download failed: ${response.status}`);
            return new Uint8Array(await response.arrayBuffer());
        }
    };

    const createLandmarker = (fileset, modelBuffer, delegate) => PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
            // createFromOptions may hand the buffer to the WASM heap; each
            // attempt gets its own copy so a GPU failure can retry on CPU.
            modelAssetBuffer: modelBuffer.slice(),
            delegate,
        },
        runningMode: 'IMAGE',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
    });

    const init = async ({ wasmRoot, modelUrl, delegate }) => {
        const [fileset, modelBuffer] = await Promise.all([
            FilesetResolver.forVisionTasks(wasmRoot),
            loadModel(modelUrl),
        ]);

        if (delegate === 'GPU') {
            try {
                landmarker = await createLandmarker(fileset, modelBuffer, 'GPU');
                return 'GPU';
            } catch (gpuError) {
                // No WebGL2 in workers here: the CPU path below still works.
            }
        }
        landmarker = await createLandmarker(fileset, modelBuffer, 'CPU');
        return 'CPU';
    };

    // The first inference compiles the GPU shaders and sizes the buffers, which
    // took ~0.3s on desktop. Paying it here, during the background warm-up,
    // keeps it off the moment the user turns detection on.
    const warmUp = () => {
        if (typeof OffscreenCanvas === 'undefined') return;
        try {
            const canvas = new OffscreenCanvas(256, 256);
            const context = canvas.getContext('2d');
            if (context) {
                context.fillStyle = '#808080';
                context.fillRect(0, 0, 256, 256);
            }
            const bitmap = canvas.transferToImageBitmap();
            landmarker.detect(bitmap);
            bitmap.close();
        } catch (warmUpError) {
            // Only an optimisation: the first real frame pays the cost instead.
        }
    };

    self.onmessage = async (event) => {
        const message = event.data;

        if (message.type === 'init') {
            try {
                const delegate = await init(message);
                warmUp();
                self.postMessage({ type: 'ready', delegate });
            } catch (error) {
                self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
            }
            return;
        }

        if (message.type === 'detect') {
            const { id, bitmap } = message;
            try {
                if (!landmarker) throw new Error('pose model not ready');
                const startedAt = performance.now();
                const result = landmarker.detect(bitmap);
                const landmarks = result.landmarks && result.landmarks.length > 0 ? result.landmarks[0] : null;
                self.postMessage({ type: 'result', id, landmarks, ms: performance.now() - startedAt });
            } catch (error) {
                self.postMessage({ type: 'result', id, landmarks: null, error: error instanceof Error ? error.message : String(error) });
            } finally {
                bitmap.close();
            }
        }
    };
})();
