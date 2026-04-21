// /// <reference types="vite/client" />

interface ImportMetaEnv {
  // Tu API Key de Gemini (necesaria para el análisis)
  readonly VITE_GEMINI_API_KEY: string;

  // Tus configuraciones de Firebase (Recomendado pasarlas aquí en lugar de tenerlas fijas en el código)
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_STRIPE_PUBLIC_KEY : string;
  readonly VITE_PUBLIC_APP_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
