## Qué cambia

<!-- Una o dos frases. Si cierra un issue: "Closes #123". -->

## Cómo probarlo

<!-- Pasos concretos o pantallas afectadas. -->

## Checklist

- [ ] `npm run check` pasa en local (lint, typecheck, tests web y de functions)
- [ ] Si toca UI: probado en web y, si aplica, en iOS/Android (`npm run cap:sync:*`)
- [ ] Si toca `fns/`: probado con el emulador (`npm --prefix fns run serve`)
- [ ] Si toca reglas de Firestore/Storage o `firebase.json`: revisado el impacto en producción
- [ ] Sin secretos ni claves en el diff
