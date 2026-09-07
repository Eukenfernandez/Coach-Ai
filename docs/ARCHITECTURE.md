# Arquitectura de Coach AI

Documento de referencia para entender cómo encajan las piezas. Para el flujo concreto del
análisis de vídeo con memoria multimodal ver [`video-context-architecture.md`](video-context-architecture.md).

## Visión general

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  Cliente (mismo bundle web)  │        │  Firebase (entrenamientos-…) │
│  · Navegador (Vercel)        │ HTTPS  │  · Auth                      │
│  · Electron (Windows)        │ ─────▶ │  · Firestore                 │
│  · Capacitor iOS / Android   │        │  · Storage (vídeos, PDFs)    │
│                              │        │  · Cloud Functions v2 ───▶ Gemini API
│  React 18 + Vite + Tailwind  │        │  · Secrets (GEMINI_API_KEY)  │
│  MediaPipe Pose (on-device)  │        └──────────────┬───────────────┘
└──────────────────────────────┘                       │ webhooks / extensión
                                                       ▼
                                                    Stripe
```

Principio rector: **el cliente nunca habla con Gemini ni guarda secretos**. Toda la IA pasa
por Cloud Functions autenticadas (`onCall`), que además aplican cuotas por plan.

## Frontend

- **Entrada**: `index.html` → `index.tsx` → `App.tsx`. `index.tsx` decide entre `hydrateRoot`
  (páginas públicas prerenderizadas) y `createRoot` (login o app nativa).
- **Navegación**: `App.tsx` mantiene `currentScreen` en estado y renderiza la pantalla
  correspondiente con `React.lazy` (helper `lazyNamed`). No hay router; las rutas públicas
  (`/`, `/es`, `/en/...`) se resuelven contra `seo/site.ts`.
- **Pantallas** (`comps/`): `Dashboard`, `Gallery` + `VideoAnalyzer` (núcleo del producto),
  `PlanGallery` + `PdfViewer`, trackers (`StrengthTracker`, `JavelinTracker`, `TrainingTracker`,
  `MatchTracker`, `SupplementsTracker`), `CoachChat`, `Profile`, `PricingSection`,
  `CoachTeamManagement`, `AdminPanel`, `LandingPage`, `Onboarding`.
- **Servicios** (`svcs/`):
  - `storageService.ts` — inicializa Firebase (API `compat`), auth, persistencia local +
    Firestore de `userdata/{uid}`, subida a Storage. Es el módulo más acoplado del proyecto.
  - `subscriptionService.ts` — tier del usuario, límites por plan, checkout/portal de Stripe.
  - `geminiService.ts` — wrappers de las callables `analizarFrame` y `chatWithCoach`.
  - `videoIntelligenceService.ts` — prepara artefactos del vídeo y consulta `askVideoQuestion`.
  - `nativeAppService.ts` — detección de Capacitor, deep links y retorno desde navegador externo.
- **Hooks** (`hks/`): `useTheme` (dark/light persistido), `useVideoPlayer`,
  `usePoseDetection` (MediaPipe).
- **Utilidades** (`utl/`): reglas biomecánicas por deporte que se inyectan en los prompts,
  traducciones (es / ing / eus), helpers de vídeo.
- **SEO**: `seo/site.ts` contiene el contenido de todas las páginas públicas en tres idiomas;
  `scripts/generate-seo-pages.tsx` las renderiza a HTML estático en `dist/` tras el build de
  Vite (más `sitemap.xml`, `robots.txt`, `404.html`). `scripts/generate-public-media.ts`
  genera las variantes responsive (avif/webp/png) del hero.

## Backend (`fns/`)

Cloud Functions v2 en TypeScript, compiladas a `fns/lib/` (ignorado en git).

| Función                                                      | Tipo               | Propósito                                             |
| ------------------------------------------------------------ | ------------------ | ----------------------------------------------------- |
| `analizarFrame`                                              | onCall             | Análisis de un frame con Gemini + reglas biomecánicas |
| `chatWithCoach`                                              | onCall             | Chat con el entrenador virtual                        |
| `upsertVideoContext`, `askVideoQuestion` (`videoContext.ts`) | onCall             | Memoria multimodal del vídeo y preguntas con contexto |
| `getCoachQuotaUsage`                                         | onCall             | Consumo de cuota del usuario                          |
| `registerVideoInGallery`, `registerPdfInGallery`             | onCall             | Alta de assets tras subir a Storage                   |
| `onVideoCreatedFallback`, `onPdfCreatedFallback`             | Firestore trigger  | Reparación si el cliente no completó el alta          |
| `onVideoDeletion`, `onPdfDeletion`                           | Firestore trigger  | Limpieza de Storage y metadatos                       |
| `evaluateVideoQuotaCompliance`, `enforcementCronJob`         | onCall / scheduler | Periodo de gracia y bloqueo por exceso de cuota       |
| `onSubscriptionChange`                                       | Firestore trigger  | Reacciona a cambios de suscripción (Stripe)           |

Secretos con `defineSecret("GEMINI_API_KEY")`. Los tests (`fns/test/`) cubren el núcleo puro
de `video-intelligence/core.ts` (ranking de segmentos, similitud, formato de respuestas).

`fns/scripts/` contiene herramientas operativas de marketing (export/auditoría de emails,
campañas Brevo). No se despliegan; se ejecutan a mano con credenciales de admin.

## Modelo de datos (Firestore)

- `users/{uid}` — perfil, email, idioma, rol (atleta / entrenador).
- `userdata/{uid}` — documento agregado con `videos[]`, `plans[]`, registros de fuerza,
  competición, entrenamientos, partidos y suplementos.
- `userdata/{uid}/videoContexts/{videoId}` (+ `segments`, `chatSessions/messages`) — memoria del
  análisis de vídeo.
- `customers/{uid}` — suscripciones Stripe (extensión de Firebase).
- `quota_counters`, `account_enforcement`, `ai_analysis_logs`, `notifications`, `requests`.

Storage: `videos/{userId}/{fileName}`, `plans/{userId}/{fileName}`, `public/`.
Reglas en `firestore.rules` y `storage.rules`.

## Plataformas

| Plataforma | Cómo se construye                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Web        | `npm run build` → `dist/`. Vercel sirve `dist/` con las cabeceras de `vercel.json`.                               |
| Electron   | `electron/main.cjs` carga `dist/index.html`. `electron-builder` → NSIS x64.                                       |
| iOS        | Capacitor copia `dist/` a `ios/App/App/public`. `svcs/nativeAppService.ts` gestiona deep links y el shell nativo. |
| Android    | Igual con `android/` (no versionado; se regenera con `npx cap add android`).                                      |

## Calidad de código

- **TypeScript estricto** en frontend y functions. `tsconfig.json` raíz solo incluye el
  frontend; `fns/tsconfig.json` es independiente.
- **ESLint 10** (flat config en `eslint.config.js`). Reglas de bugs en `error`; reglas del React
  Compiler y de código muerto en `warn` mientras se refactoriza el código heredado.
- **Prettier** con `lint-staged` en el pre-commit: formatea solo lo que se toca. No se ha
  reformateado la base de código de golpe para no crear conflictos con las ramas de iOS.
- **Tests**: Vitest (frontend) + node:test (functions). Se prioriza código puro; los módulos que
  inicializan Firebase al importarse (`storageService`) requieren mocks antes de testearse.
- **CI**: `.github/workflows/ci.yml` ejecuta lint, typecheck, tests y build en cada PR y push a
  `main`. `npm run check` reproduce lo mismo en local.

## Deuda técnica conocida (a septiembre de 2026)

1. **Ficheros gigantes**: `comps/VideoAnalyzer.tsx` (~2.300 líneas), `App.tsx` (~2.000),
   `svcs/storageService.ts` (~1.600), `fns/src/videoContext.ts` (~1.600). Partirlos por
   responsabilidad es el siguiente paso natural; hacerlo con tests de caracterización primero.
2. **212 warnings de ESLint** (`no-explicit-any`, `no-unused-vars`, reglas del React Compiler).
   Bajar el contador y endurecer reglas a `error` progresivamente.
3. **78 ficheros sin formato Prettier**. Se normalizan solos al tocarse; si se decide un
   reformateo global, hacerlo en un commit aislado y añadirlo a `.git-blame-ignore-revs`.
4. **Firebase `compat` API**: migrar a la API modular reduciría bundle y facilitaría el testing.
5. **Config de Firebase embebida** en `storageService.ts`; moverla a `VITE_FIREBASE_*`.
6. **Ramas de iOS divergentes**: `codex/fix-ios-webview-routing` (WebView + Capacitor) y
   `claude/infallible-johnson-7d4cb7` (shell SwiftUI completo) contienen dos enfoques distintos.
   Hay que decidir uno y fusionar.
7. **Sin despliegue continuo**: añadir un workflow de deploy (Vercel/Firebase) tras CI verde.
8. **i18n**: el sistema actual son tablas manuales por idioma; considerar una librería si crece.
9. **Cobertura ~13 %**: subir primero en `svcs/subscriptionService` (límites por plan) y en el
   flujo de cuotas de `fns/`, que es donde vive el dinero.
