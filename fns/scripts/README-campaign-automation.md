# Campaign Automation

Scripts listos para preparar, sincronizar y lanzar una campaña de CoachAI desde backend.

## Configuracion

1. Crea `fns/.env.campaign` a partir de [`.env.campaign.example`](/C:/Users/Usuario/Downloads/pruebak-coach-ai%20(3)%20-%20copia/fns/.env.campaign.example)
2. Rellena al menos:
   - `BREVO_API_KEY`
   - `BREVO_SENDER_EMAIL`
   - `BREVO_SENDER_NAME`

## Flujo

Desde [`fns`](/C:/Users/Usuario/Downloads/pruebak-coach-ai%20(3)%20-%20copia/fns):

```bash
npm run campaign:prepare
npm run campaign:sync
npm run campaign:create
npm run campaign:sync -- --execute
npm run campaign:create -- --execute
npm run campaign:send -- --send
```

Notas:
- `campaign:prepare` si ejecuta de verdad y genera ficheros en `fns/output`.
- `campaign:sync` y `campaign:create` van en `dry-run` por defecto. Solo mutan Brevo con `--execute`.
- `campaign:send` no envia nada sin `--send`.
- Opcionalmente puedes enviar una prueba:

```bash
npm run campaign:send -- --send --test-emails=tu@email.com
```

## Salidas

- `fns/output/campaign_recipients.csv`
- `fns/output/campaign_recipients.json`
- `fns/output/campaign_review_required.csv`
- `fns/output/campaign_rejected.csv`
- `fns/output/campaign_summary.json`
- `fns/output/brevo_sync_state.json`
- `fns/output/brevo_campaign_payload.json`
- `fns/output/brevo_campaign_state.json`

## Criterio de segmentacion

- `campaign_safe`: cuentas registradas y limpias, con heuristica conservadora de calidad.
- `review_required`: correos plausibles pero con dudas de consentimiento o calidad.
- `rejected`: test, basura, dominios sospechosos, identidades internas repetidas o exclusiones explicitas.
