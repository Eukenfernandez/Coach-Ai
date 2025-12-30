
/**
 * Configuration for Camera Recording.
 * Prioritizes 4K resolution (3840x2160) on the environment (back) camera.
 * Browsers will fall back to the highest available resolution if 4K is not supported.
 */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: true,
  video: {
    facingMode: 'environment', // Use back camera
    width: { ideal: 3840 },    // Target 4K
    height: { ideal: 2160 }
  }
};

/**
 * Generates a thumbnail from the first frame (0.5s) of a video file.
 * Enhanced for mobile compatibility (iOS requires muted/playsInline).
 * Returns a placeholder if generation fails.
 */
export const generateVideoThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    
    // Critical attributes for mobile (iOS) background loading
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    
    // Default placeholder in case of failure (Dark gray with Orange chevron)
    const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180' viewBox='0 0 320 180'%3E%3Crect width='320' height='180' fill='%231f1f1f'/%3E%3Cpath d='M140 70 L180 90 L140 110 Z' fill='%23ea580c'/%3E%3C/svg%3E";

    let isResolved = false;

    const safeResolve = (val: string) => {
      if (isResolved) return;
      isResolved = true;
      resolve(val);
      try {
        URL.revokeObjectURL(objectUrl);
        // Clean up video element
        video.onseeked = null;
        video.onloadeddata = null;
        video.onerror = null;
        video.src = "";
        video.load();
      } catch (e) {
        // ignore cleanup errors
      }
    };

    // Safety timeout (3s) - If video is huge or codec unsupported, fail gracefully
    const timeoutId = setTimeout(() => {
        console.warn("Thumbnail generation timed out for:", file.name);
        safeResolve(fallback);
    }, 3000);

    video.onloadeddata = () => {
       // Once metadata/data is loaded, seek to 0.5s
       video.currentTime = 0.5;
    };

    video.onseeked = () => {
      clearTimeout(timeoutId);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            // Compress to 0.6 to save memory on mobile
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            safeResolve(dataUrl);
        } else {
            safeResolve(fallback);
        }
      } catch (e) {
        console.error("Canvas draw error", e);
        safeResolve(fallback);
      }
    };
    
    video.onerror = (e) => {
        clearTimeout(timeoutId);
        // Clean log to avoid [object Event]
        console.warn("Thumbnail generation failed: Video could not be loaded.");
        safeResolve(fallback); 
    };
    
    // Trigger load
    video.load();
  });
};

export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
