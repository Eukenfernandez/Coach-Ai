// Content-Security-Policy delivered as <meta> by the built HTML: vite.config.ts
// injects it into dist/index.html (also what the Electron and Capacitor shells
// load, which get no HTTP headers) and scripts/generate-seo-pages.tsx into the
// generated public pages. vercel.json and firebase.json send the same policy
// as a header, plus the header-only frame-ancestors 'none' (and, on Vercel,
// upgrade-insecure-requests). Keep all of them in sync.
//
// script-src has no 'unsafe-inline': every script is an external file in pub/.
// - cdn.jsdelivr.net: MediaPipe tasks-vision WASM runtime (hks/usePoseDetection).
// - www.google.com/recaptcha, www.gstatic.com/recaptcha: App Check (reCAPTCHA v3).
// - connect-src blob:/data:: fetch() of locally cached videos and PDFs.
// pdf.js is bundled from npm (worker served from 'self'), so it needs no CDN.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://images.unsplash.com https://firebasestorage.googleapis.com https://storage.googleapis.com",
  "media-src 'self' blob: https://firebasestorage.googleapis.com https://storage.googleapis.com",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net https://*.firebaseapp.com https://*.firebasestorage.app https://cdn.jsdelivr.net https://www.google.com/recaptcha/ blob: data:",
  "worker-src 'self' blob:",
  "frame-src https://*.firebaseapp.com https://www.google.com/recaptcha/",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
