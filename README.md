# Coach AI

Plataforma de entrenamiento con IA: análisis biomecánico de vídeo a cámara lenta, chat con un
entrenador virtual, seguimiento de marcas (fuerza, competición, entrenamientos, partidos),
planes en PDF y gestión de atletas para entrenadores. Disponible como web, app de escritorio
(Electron) y apps móviles (Capacitor iOS/Android).

- Producción web: <https://coachai.es>
- Backend: Firebase (Auth, Firestore, Storage, Cloud Functions) en el proyecto `entrenamientos-bfac2`
- IA: Google Gemini (vía Cloud Functions) + MediaPipe Pose en el navegador
- Pagos: Stripe (suscripciones)

Documentación ampliada en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Guía de trabajo en
[`CONTRIBUTING.md`](CONTRIBUTING.md). Seguridad de claves y prompts en
[`SECURITY_SETUP.md`](SECURITY_SETUP.md).

## Stack

| Capa              | Tecnología                                                           |
| ----------------- | -------------------------------------------------------------------- |
| Frontend          | React 18, TypeScript, Vite 5, Tailwind CSS 3, lucide-react           |
| Backend           | Firebase Cloud Functions v2 (Node), firebase-admin, Gemini SDK       |
| Datos             | Firestore, Firebase Storage, Firebase Auth                           |
| Visión en cliente | @mediapipe/tasks-vision                                              |
| Escritorio        | Electron + electron-builder (Windows x64)                            |
| Móvil             | Capacitor 8 (iOS/Android) sobre el mismo bundle web                  |
| Calidad           | ESLint 10, Prettier, Vitest + Testing Library, node:test (functions) |
| CI                | GitHub Actions (`.github/workflows/ci.yml`), Dependabot              |

## Requisitos

- Node **22 LTS** (ver `.nvmrc`; `nvm use` lo selecciona). Las Cloud Functions declaran su
  propio runtime en `fns/package.json` → `engines`.
- npm 10+
- Firebase CLI (`npm i -g firebase-tools`) para emuladores y despliegues
- Para móvil: Xcode (iOS) / Android Studio (Android). Ver `npm run cap:doctor`.

## Puesta en marcha

```bash
npm install                 # instala deps del frontend y activa los git hooks (husky)
npm --prefix fns install    # deps de las Cloud Functions
cp .env.example .env.local  # y rellena lo que necesites (ver abajo)
npm run dev                 # http://localhost:5173
```

### Variables de entorno

El frontend lee variables `VITE_*` (tipadas en [`vite-env.d.ts`](vite-env.d.ts)). Todas son
opcionales para arrancar en local; la configuración pública de Firebase está embebida en
`svcs/storageService.ts` (las claves web de Firebase no son secretas: el acceso se controla
con las reglas de Firestore/Storage).

| Variable                 | Uso                                                          |
| ------------------------ | ------------------------------------------------------------ |
| `VITE_PUBLIC_APP_URL`    | URL pública de la app (deep links y retornos desde Stripe)   |
| `VITE_STRIPE_PUBLIC_KEY` | Clave publicable de Stripe                                   |
| `VITE_FIREBASE_*`        | Reservadas para mover la config de Firebase fuera del código |

Los **secretos** (por ejemplo `GEMINI_API_KEY`) viven en Firebase Secrets y solo los leen las
Cloud Functions. Nunca van en `.env*` del frontend. Ver `SECURITY_SETUP.md`.

## Scripts

| Script                                           | Qué hace                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `npm run dev`                                    | Servidor de desarrollo Vite                                      |
| `npm run build`                                  | Imágenes responsive → bundle Vite → páginas SEO estáticas        |
| `npm run preview`                                | Sirve `dist/`                                                    |
| `npm run check`                                  | **Todo lo que ejecuta CI**: lint + typecheck + tests (web y fns) |
| `npm run lint` / `lint:fix`                      | ESLint en todo el repo                                           |
| `npm run format` / `format:check`                | Prettier                                                         |
| `npm run typecheck` / `typecheck:fns`            | `tsc --noEmit` del frontend / de las functions                   |
| `npm test` / `test:watch` / `test:coverage`      | Vitest                                                           |
| `npm run test:fns`                               | Compila y ejecuta los tests de `fns/` con `node --test`          |
| `npm run electron:dev` / `electron:build`        | App de escritorio                                                |
| `npm run cap:sync:ios` / `cap:open:ios`          | Build web + sincronizar/abrir proyecto iOS                       |
| `npm run cap:sync:android` / `cap:build:android` | Idem para Android                                                |

Los git hooks (`.husky/pre-commit`) pasan `eslint --fix` y `prettier` solo sobre los ficheros
del commit, así el formato se va normalizando sin un reformateo masivo.

## Estructura

```
.
├── App.tsx / index.tsx / index.html   Entrada de la SPA (routing manual por pantalla)
├── comps/          Componentes de pantalla (Dashboard, VideoAnalyzer, Gallery, Profile…)
├── hks/            Hooks (useTheme, useVideoPlayer, usePoseDetection)
├── svcs/           Servicios: Firebase, suscripciones, Gemini, vídeo-inteligencia, shell nativo
├── utl/            Utilidades puras (biomecánica, traducciones, vídeo)
├── seo/ + scripts/ Contenido y generación de páginas públicas estáticas (es/en/eu)
├── types.ts        Tipos de dominio compartidos
├── test/           Tests del frontend (Vitest)
├── fns/            Cloud Functions (src/), tests (test/) y scripts de marketing (scripts/)
├── electron/       Proceso principal de Electron
├── ios/ android/   Proyectos nativos Capacitor (android/ está ignorado en git)
├── pub/            Estáticos públicos (publicDir de Vite)
└── docs/           Arquitectura y decisiones
```

## Tests

- **Frontend**: Vitest + jsdom + Testing Library. Tests en `test/**` (o junto al código como
  `*.test.ts`). Cobertura con `npm run test:coverage` → `coverage/`.
- **Cloud Functions**: `node:test` sobre el código compilado (`fns/test/`).

## Despliegue

| Qué             | Cómo                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| Web             | Vercel (config en `vercel.json`, cabeceras CSP incluidas). `firebase.json` también define Hosting como alternativa. |
| Cloud Functions | `npm --prefix fns run deploy` (`firebase deploy --only functions`)                                                  |
| Reglas          | `firebase deploy --only firestore:rules,storage`                                                                    |
| Escritorio      | `npm run electron:build` → instalador NSIS en `el-dist/`                                                            |
| iOS / Android   | `npm run cap:sync:*` y publicar desde Xcode / Android Studio                                                        |

No hay despliegue automático desde CI todavía: CI valida (lint, tipos, tests, build) y el
despliegue es manual. Ver "Próximos pasos" en `docs/ARCHITECTURE.md`.

## Licencia

Propietario. Todos los derechos reservados.
