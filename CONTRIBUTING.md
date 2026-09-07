# Guía de contribución

## Flujo de trabajo

1. Crea una rama desde `main`: `feat/<tema>`, `fix/<tema>`, `chore/<tema>`.
2. Trabaja en commits pequeños. Mensajes en formato
   [Conventional Commits](https://www.conventionalcommits.org/): `feat(video): …`, `fix(ios): …`,
   `chore(ci): …`, `docs: …`, `test: …`, `refactor: …`.
3. Antes de abrir el PR, ejecuta **`npm run check`** (lint + typecheck + tests web y functions).
   Es exactamente lo que corre CI.
4. Abre el PR contra `main` y rellena la plantilla. CI debe estar en verde para fusionar.

## Convenciones de código

- TypeScript estricto. Evita `any`; si es inevitable, deja un comentario con el motivo.
- Componentes en `comps/`, un componente por fichero, exportación con nombre.
- Lógica sin React en `utl/` (pura) o `svcs/` (con efectos). Lo puro es lo primero que se testea.
- Nada de secretos en el cliente. La IA y cualquier clave privada van por Cloud Functions.
- Textos de UI en los tres idiomas (`es`, `ing`, `eus`) cuando la pantalla ya está traducida.
- El formato lo pone Prettier en el pre-commit; no discutas estilo en las revisiones.

## Tests

- Frontend: `npm test` (Vitest). Añade tests en `test/<dir>/<modulo>.test.ts` o junto al código.
- Functions: `npm run test:fns` (`node:test` sobre `fns/lib`, se compila antes).
- Si tocas `svcs/subscriptionService.ts`, `fns/src/index.ts` (cuotas) o reglas de Firebase,
  añade o actualiza tests: es la parte que afecta a cobros y acceso a datos.

## Emuladores de Firebase

```bash
npm --prefix fns run serve     # functions en local
```

Para Firestore/Auth/Storage locales usa `firebase emulators:start` y apunta el cliente a los
emuladores (pendiente de script dedicado; ver deuda técnica en `docs/ARCHITECTURE.md`).

## Plataformas nativas

- iOS: `npm run cap:sync:ios && npm run cap:open:ios`. Prueba en simulador y en dispositivo.
- Android: `npm run cap:sync:android`. El directorio `android/` no está versionado.
- Cualquier cambio en `svcs/nativeAppService.ts` o en deep links necesita prueba en dispositivo.
