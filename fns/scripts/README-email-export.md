# Exportador endurecido de emails

Script Node.js para extraer emails desde Firestore y Realtime Database con Firebase Admin SDK, normalizarlos, deduplicarlos y prepararlos para uso real en produccion.

## Refuerzos incluidos

- `dry-run` para validar alcance y metricas sin escribir nada.
- filtros por coleccion y por prefijos de path para no recorrer Firebase completo.
- limites de runtime, documentos, nodos, candidatos, emails unicos y tamano de string.
- paginacion en Firestore para evitar lecturas masivas en memoria.
- deduplicacion case-insensitive y sanitizacion de emails.
- deteccion de consentimiento mas robusta:
  - `marketing`
  - `review_required`
  - `transactional_only`
- CSV de marketing, review y supresion transaccional.
- escritura normalizada en Firestore.
- idempotencia para reejecuciones mediante `marketing_sync_state`.
- batching, rate limiting y retries para Mailchimp y Brevo.
- Trigger Email con `campaignKey` y doc id determinista para no duplicar envios.

## Uso

Dry-run:

```bash
npm run emails:export -- --config=./scripts/email-export.config.example.json --dry-run
```

Ejecucion real:

```bash
npm run emails:export -- --config=./scripts/email-export.config.example.json
```

Overrides utiles por CLI:

```bash
--firestore-root-collections=users,leads
--firestore-include-prefixes=users,leads
--firestore-exclude-prefixes=users/private
--rtdb-paths=/users,/marketingLeads
```

## Salidas

CSV principales:

- `*-consented.csv`: solo marketing elegible.
- `*-review-required.csv`: no enviar automaticamente; requiere revision.
- `*-transactional-only.csv`: opt-out, consent negativo o solo uso transaccional.

Columnas:

```csv
"email","deliveryClassification","marketingEligible","consentStatus","consentScope","consentReason","consentPath","primarySource","primarySourcePath","duplicateCount","sourceCount"
```

Resumen JSON:

- `*-summary.json` con metricas y errores de la ejecucion.

## Marketing vs transaccional

- Mailchimp y Brevo estan configurados como integraciones de marketing y solo toman contactos `marketing`.
- Trigger Email de Firebase se deja por defecto como `transactional` para evitar uso accidental como marketing.
- Si cambias Trigger Email a `purpose: "marketing"`, el script solo encola contactos con consentimiento explicito de marketing.

## Requisitos operativos

- Usa service account con permisos de lectura en Firestore y/o RTDB.
- Evita escanear `/` en RTDB salvo que conozcas bien el tamano real del dataset.
- Para produccion, define siempre filtros de path y limites conservadores.
