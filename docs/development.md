# Development and deployment

[← Back to Repbook](../README.md)

Run the commands below from the repository root.

## Run locally

Use Node 22 LTS (22.12 or newer) or Node 24 LTS. Node 20.19+ is also supported by the pinned dependencies. Use `npm ci`, not an unpinned framework generator.

```sh
nvm use
npm ci
cp -n .env.example .env
npm run dev
```

Fill in the four `PUBLIC_FIREBASE_*` settings from Firebase Console → Project settings → Your apps → Web app configuration. These are public web configuration values, **not** service-account credentials. With no configuration, the app shows an explicit setup screen. There is no in-memory production account or fabricated workout history.

## Develop without a Firebase account

The app can use the actual Firebase Authentication and Firestore emulators. Install Java 21+ and make `java` available on PATH. On Apple Silicon with Homebrew OpenJDK, for example: `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"`.

```sh
npm run emulators
```

In another terminal:

```sh
PUBLIC_USE_EMULATORS=true npm run dev
```

Open `http://127.0.0.1:5173`. Use **Continue with test account** and any test email, or exercise the Google-provider emulator dialog. Test accounts use a fixed, emulator-only credential. Emulator controls and connections are guarded by SvelteKit's compile-time `dev` flag and cannot be enabled in a production build. Emulator data is temporary unless you explicitly export it with Firebase CLI. Emulator UI: `http://127.0.0.1:4000`.

## Firebase / Google setup

1. Create a Firebase project and register a Web App.
2. Enable Authentication → Sign-in method → Google, and set the support email.
3. Create a Cloud Firestore database. Choose the region deliberately; it cannot be changed casually afterward.
4. Add your actual localhost, stable staging, and production hostnames under Authentication → Settings → Authorized domains. Arbitrary Vercel preview hostnames are not automatically authorized.
5. Set `PUBLIC_FIREBASE_API_KEY`, `PUBLIC_FIREBASE_AUTH_DOMAIN`, `PUBLIC_FIREBASE_PROJECT_ID`, and `PUBLIC_FIREBASE_APP_ID` in `.env` / Vercel environment settings.
6. Deploy the rules and indexes to your real project (the checked-in default deliberately points to a demo project):

```sh
npx firebase login
npx firebase deploy --only firestore:rules,firestore:indexes --project YOUR_FIREBASE_PROJECT_ID
```

This app uses user-initiated `signInWithPopup`, with cancellation, popup-blocked, unauthorized-domain and network error states. No redirect flow or third-party-storage redirect workaround is assumed. OAuth on real mobile Safari and Chrome must be checked on the actual authorized deployment domain. A local emulator sign-in does not verify real Google OAuth.

## Vercel deployment

1. Push this directory to your repository, then import that repository in Vercel.
2. Select the SvelteKit preset, the project root, Node 22.x or 24.x, install command `npm ci`, and build command `npm run build`.
3. Set the four public Firebase variables for the relevant Vercel environments. Leave `PUBLIC_USE_EMULATORS` unset or false. Prefer a separate Firebase project for staging / previews.
4. Deploy Firestore rules and indexes separately using the command above. Do not leave test-mode rules enabled.
5. Add the final Vercel/custom hostname to Firebase authorized domains. Deploy the site, then test Google sign-in, a Firestore write, refresh on `/calendar`, `/workouts/<id>`, and `/session/<id>`, and sign-out on that URL.

`@sveltejs/adapter-vercel` generates `.vercel/output`. No always-running server, local server filesystem, service account, or separate backend is needed. No production deployment is performed automatically by this repository.

## Commands and tests

```sh
npm run check             # Svelte + TypeScript, including accessibility diagnostics
npm run lint              # ESLint, TypeScript and Svelte rules
npm run test              # Domain / analytics / validation / timer / date unit tests
npm run build             # Reproduce public contracts and build for Vercel
npm run test:rules        # Firestore emulator: authorization and seed idempotency
npx playwright install chromium
npm run test:integration  # Starts auth + Firestore emulators and runs browser flows
```

`test:integration` manages its own dev server on port 5173. Stop unrelated servers on that port first. `npm run test:e2e` instead uses emulators you have already started. Screenshots and retained failure traces are written to `test-results/` (gitignored). Unit tests do not require credentials or Java. Rules and browser tests use `demo-repbook` and cannot read production data.

## Architecture and data guarantees

- `src/lib/domain`: typed entities, snapshots, unit accounting, numeric input, explicit date grouping, and deadline-based rest timers.
- `src/lib/analytics`: the shared inclusion predicate, four independent exclusion scopes, completion, volume, historical suggestions and exercise metrics.
- `src/lib/validation/workouts.schema.json`: canonical JSON Schema. The editor and importer use this schema plus semantic checks in `import.ts`. `npm run sync:contracts` copies it to `static/workouts.schema.json`.
- `src/lib/seed/bundle.json`: the exact appendix's 15 shared exercise definitions and five programs. The same source produces the downloadable example. Weights and performed history are not seeded. Thursday is retained in the requirements as an optional sixth program.
- `src/lib/seed/initialize.ts`: one online transaction with stable seed IDs and `seedVersion: 1`. Concurrent login, retry, and later archived/edited starter programs are handled without replacement.
- `src/lib/firebase`: browser-only SDK initialization. Memory SDK cache avoids sharing persistent Firestore caches between accounts; the explicitly managed session outbox uses IndexedDB.
- `src/lib/repositories`: profile/catalog subscriptions, date-range queries, history pagination, atomic import receipts, and per-session local drafts and revision-checked transactions.
- `src/lib/components`: reusable journal UI, workout editor, session logging, number inputs, dialogs, timer, history cards, and accessible chart tables.

Storage paths are `users/{uid}`, `exercises`, `workouts`, `sessions`, nested `sessions/{id}/records`, and `importReceipts`. Ordered, immutable session exercise snapshots are embedded in each session header (maximum 40); an independent exerciseStates map stores per-occurrence notes and exclusions, and actual records are separate documents. This allows the rules to protect snapshots with a direct equality check. History is never stored in one user document. Audit writes use Firestore server timestamps; action timing uses separate UTC client timestamps. Firestore rules enforce ownership, allowed fields, critical numeric bounds, immutable identities/conventions, and revisions. Deleted history is soft-deleted.

A session starts online with an atomic active-session pointer. Every log commits to IndexedDB before the UI acknowledges it or starts rest. Network flushing uses stable record IDs / operation IDs and a revision check; server acknowledgments are distinguished from local saving. Refresh restores pending drafts and deadlines. New tabs/devices must take over editing explicitly. Conflicts preserve the local version and offer server/local resolution, with a local backup before replacement. The outbox is UID-scoped; sign-out is blocked while unsent changes remain. Clearing browser storage will remove unsubmitted local data, so sync first.

A session's `workoutDate` and `timeZoneAtStart` preserve its original calendar day across midnight, DST, travel, and preference changes. Past entry never runs a rest timer and keeps unknown duration as `null`. Programs can run on any weekday. Archiving preserves statistics; explicit exclusions affect statistics without erasing history. Changed exercise measurement conventions always create a new variant, even before a first logged result, to avoid silently altering programs already using that identity.

External volume is recorded load × reps within one exercise and convention. Dumbbell values are never doubled; different exercise volumes are never combined into total tonnage. Bodyweight adjustments are signed and separated into modes. Extra units do not inflate completion. Chart data is also available in tables, and missing dates are not invented as zero results.

## Remaining deployment checks

Before publishing your own instance, verify real Google sign-in, mobile keyboard behavior, deep-link refreshes, and Firestore reads and writes on your authorized deployment domain. See [VERIFICATION.md](../VERIFICATION.md) for checks performed during development and their results.
