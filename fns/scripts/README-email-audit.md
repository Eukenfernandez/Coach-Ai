# Auditoria y export de emails

## Fuentes reales detectadas en este proyecto

- Firebase Authentication:
  - `createUserWithEmailAndPassword` y `signInWithEmailAndPassword` en `svcs/storageService.ts`
- Firestore:
  - `users/{uid}` guarda `email` y `username`
  - `requests/{coachId}_{athleteId}` guarda `athleteEmail`
  - `customers/{uid}/...` existe por Stripe y puede contener emails o metadatos relacionados
  - `userdata/{uid}` existe como raiz de datos del usuario, aunque en el codigo auditado no aparece un `email` explicito como campo principal
- Realtime Database:
  - no se detecta uso real en cliente ni en Cloud Functions actuales
  - el script la soporta solo si se activa con `databaseURL` y `rtdb.paths`

## Ejecutar

Desde `fns`:

```bash
npm run emails:audit -- --config=./scripts/email-audit.config.example.json
```

Dry-run:

```bash
npm run emails:audit -- --config=./scripts/email-audit.config.example.json --dry-run
```

## CSV

Formato:

```csv
"email","source","sourcePath","uid","notes"
```

Ejemplo:

```csv
"athlete@example.com","auth,firestore","auth/users/uid123 | users/uid123.email","uid123","Firebase Authentication; firestore:field:email"
"invitee@example.com","firestore","requests/coach1_athlete2.athleteEmail","","firestore:field:athleteEmail"
```

## Notas

- El exportador deduplica emails sin distinguir mayusculas.
- Normaliza todo a minusculas.
- Ignora vacios e invalidos.
- Si un correo aparece en varias fuentes, consolida `source`, `sourcePath` y `notes`.
