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

### Login succeeds but the training space does not load

Authentication and Firestore are separate services. If Google sign-in succeeds but startup fails, confirm that the Cloud Firestore API is enabled for the configured project, that a **`(default)` database** exists, and that the repository's Firestore rules have been deployed to that same project. An API response containing `SERVICE_DISABLED` means Firestore must be enabled; changing Authentication's authorized domains will not fix it. After enabling the service, allow a few minutes for the change to propagate, then retry.

Startup shows a retry screen if authentication or the initial data load has not finished within 20 seconds. Retrying preserves existing programs and does not duplicate starter data.

## Vercel deployment

1. Push this directory to your repository, then import that repository in Vercel.
2. Select the SvelteKit preset, the project root, Node 22.x or 24.x, install command `npm ci`, and build command `npm run build`.
3. Set the four public Firebase variables for the relevant Vercel environments. Leave `PUBLIC_USE_EMULATORS` unset or false. Prefer a separate Firebase project for staging / previews.
4. Deploy Firestore rules and indexes separately using the command above. Do not leave test-mode rules enabled.
5. Add the final Vercel/custom hostname to Firebase authorized domains. Deploy the site, then test Google sign-in, a Firestore write, refresh on `/calendar`, `/workouts/<id>`, and `/session/<id>`, and sign-out on that URL.

`@sveltejs/adapter-vercel` generates `.vercel/output`. No always-running server, local server filesystem, service account, or separate backend is needed. No production deployment is performed automatically by this repository.

## Final-rep failure logging

For strength records, `reps` stores completed whole repetitions. The optional `lastRepFailed: true` marker records one additional final attempt at muscle failure, counted as **0.5 rep**. For example, 8 completed reps plus this marker gives 8.5 counted reps. The marker resets after each logged set and is not copied from previous-result suggestions. Existing records without it keep their original totals.

Counted reps feed total reps, best reps at a selected load, and per-exercise volume. A marked attempt with 0 completed reps counts as 0.5; an unmarked failed set with 0 reps remains incomplete. Plan completion still counts planned sets, not repetitions. Statistics expose final-rep failure counts and apply the usual exclusions. The marker is only valid on logged strength records, never skipped/failed records or isometric/cardio entries.

Deploy the updated `firestore.rules` **before deploying this client change** using the Firebase command above. Old rules reject the new optional field; existing clients and records remain compatible with the new rules.

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

## Strength progression

Home and Progress lead with a weekly strength progression dashboard. Weeks run Monday–Sunday, identified by the Monday's workout date. The week picker defaults to the latest week with a valid comparison, or the latest week when there is not enough history. The strength index uses **100 as the previous calendar week**: 105 means estimated strength rose about 5%; 95 means it fell about 5%. The line chart shows each week's percentage change, not cumulative growth. Changes within ±1% count as steady. An unfinished week is labeled with its cutoff date and includes only results through that date.

Each positive external-weight set receives an **Epley-style strength score: `weightKg × (1 + completedReps / 30)`**. More full reps at the same weight increase the score; adding weight while dropping reps can increase, preserve, or lower it. For example, 50 kg × 10 scores 66.67; 55 kg × 6 scores 66 (−1%, steady); 55 kg × 8 scores 69.67 (+4.5%); and 55 kg × 3 scores 60.5 (−9.25%). This is a consistent comparison score, not a measured maximum or a physiological strength measurement. The same formula applies to singles and higher-rep sets so additional reps never disappear at an arbitrary cutoff. The UI flags that high reps and changes in effort or technique make estimates less certain. The Epley relationship is documented in [STMr's strength-estimation functions](https://mladenjovanovic.github.io/STMr/reference/max_perc_1RM.html); we use 1/30 rather than its rounded 0.0333 coefficient.

Comparisons require the same exercise identity and weight convention. The calculation takes the best set score per calendar day and the median of those daily scores within the week. At least one valid observation is required in each of the two consecutive weeks. The current median divided by the previous median gives the exercise ratio; the geometric mean of these ratios gives the overall index. Each exercise has equal weight regardless of training frequency. Repeated sets, same-day sessions, and volume do not add votes; medians reduce isolated outliers when multiple days are available. Additional days with different performance can still change the median. The index summarizes logged performance and cannot adjust for unrecorded effort, technique, or fatigue.

The fastest progression card ranks weekly increases above 1%, and the exercise table sorts the largest weekly gains first, with unavailable comparisons last. Its sparklines show the same weekly strength estimates used by the index. The weight × reps column and tooltips preserve the actual one or two middle daily-best sets (including dates) behind the median; they never combine the heaviest load with another set's rep count. An even number of daily results averages the middle two scores, not their weights or reps. Exercise session charts offer Strength estimate, Weight, and Reps views of the same actual best set per session. Every view displays its weight–rep pair and dates, with a full data table. Colors always describe the combined strength estimate, so fewer reps with a sufficient load increase are not colored as a loss. Session charts use the exercise's current weight convention; history with a different convention remains in the separately grouped weekly charts and source records.

New exercises, missing weeks, changed conventions, and insufficient history remain unscored. Missing weeks are never replaced with zero or bridged using older results. The compared-exercise count makes coverage visible, since the eligible exercise mix can change between weeks. Bodyweight adjustments, holds, and cardio retain their separate performance charts. Failed half-rep markers affect existing repetition/volume statistics but do not increase the strength index or the completed reps shown in its charts.

Progress reads the complete first displayed calendar week and its preceding baseline week, even for a custom range beginning midweek. The cutoff date still applies. Activity totals and session charts use the exact selected dates. Home displays the current week and eleven previous weeks, reads one additional baseline week, and retains its last-four-weeks activity totals. All calculations use the shared exclusion pipeline and workout-date strings, preserving calendar weeks across year boundaries, daylight-saving changes, and time zones. No data migration is needed.

The progression unit tests cover rep-only gains, heavier/fewer-rep tradeoffs, real set pairing, medians, frequency invariance, outliers, exclusions, single weekly observations, missing weeks, partial-week cutoffs, conventions, and date boundaries. The progression browser test seeds only the local Firebase emulator and checks rep-aware ranking and colors, chart measure controls, actual weight–rep pairs, filters, exact-range totals, chart order, and mobile overflow.

## Remaining deployment checks

Before publishing your own instance, verify real Google sign-in, mobile keyboard behavior, deep-link refreshes, and Firestore reads and writes on your authorized deployment domain. See [VERIFICATION.md](../VERIFICATION.md) for checks performed during development and their results.
