# MotorForm production release checklist

## What is ready

The GitHub `main` branch contains the Expo mobile app, Cloudflare-style Worker
backend and ordered SQLite/D1 migrations `0000` through `0006`.

## Required production access

An owner/editor must grant access to the existing hosting project in
`.openai/hosting.json`, or provide a Cloudflare account with a D1 database and
Worker deployment permission. Do not commit provider or operator secrets.

## Release sequence

1. Apply `drizzle/0000_motorform.sql` through `drizzle/0006_preowned_decisions.sql`
   in order to the production D1 database.
2. Set Worker secrets in the host secret manager:
   - `PMC_API_KEY` — India catalogue provider key.
   - `MOTORFORM_OPERATOR_KEY` — a new, strong operator-only token.
3. Deploy the Worker build output from `worker/index.mjs` / `worker/build.mjs` with
   the D1 binding named `DB`.
4. Verify these production endpoints before releasing mobile:
   - `GET /api/catalog?city=hyderabad`
   - `POST /api/recommendations`
   - `GET /api/decision-confidence?city=hyderabad`
   - `POST /api/preowned/assess`
5. Build the mobile app with `EXPO_PUBLIC_API_BASE` set to the exact HTTPS Worker
   origin. This is public configuration, not a secret.
6. Run the Expo Android export or EAS preview build, install it on a physical phone,
   and test discovery, save, comparison, enquiry and used-car assessment.

## Truthfulness rules

- City pricing is an estimate until a source/dealer quote is recorded.
- Reviews remain unavailable until a licensed review provider is connected.
- A used vehicle is never marked verified without real document or inspection evidence.
