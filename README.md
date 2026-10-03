# Repbook

**Thad Castle energy. Transactional integrity.**

A workout tracker for lifting weights and retaining evidence. Programs, sets, rest timers, history, and progress charts. Written in TypeScript because “pretty sure I did twelve” is not a numeric type.

The operating model is simple: Thad sets the expectations. Alex Moran wants to go home. Repbook records what actually happened.

<p align="center">
  <img src="docs/images/slow-clap.webp" width="498" alt="An approving slow clap." />
  <br />
  <em>The Goat House has successfully persisted one piece of information.</em>
</p>

## Scope of operations

| Capability | Implementation |
| --- | --- |
| Workout programs | Create, edit, duplicate, archive, or import JSON. Five programs and fifteen exercises are seeded on first login. You supply the weights. |
| Set logging | Reps, load, failed sets, skipped sets, and previous results. Failure is a valid state. Thad is handling this poorly. |
| Exercise types | Loaded strength, bodyweight with added load or assistance, isometric holds, and timed cardio. Kilograms throughout. |
| Rest timers | Persisted deadlines that survive refreshes and background tabs. Alex Moran cannot extend the rest period by minimizing the browser. |
| History | Calendar, session details, and retrospective entries for workouts you actually did but neglected to document. |
| Progress | Overview, per-program, and per-exercise statistics, with exclusions at four levels. |
| Program imports | JSON Schema validation, semantic checks, and atomic import receipts. Includes an example bundle and a prompt for preparing plans with an AI assistant. |

The starter programs have weekday names. These are labels. Running Monday’s workout on Thursday does not require a database migration.

## Failure modes we took personally

### The gym loses internet

A session starts online. After that, each logged change commits to **IndexedDB before the UI acknowledges it**. A local outbox retries synchronization with Firestore. The interface distinguishes `Saved locally`, `Syncing`, `Synced`, `Sync failed`, and `Conflict`.

Unsent changes survive a refresh. They do not survive you clearing browser storage. Wait for sync before signing out; the app checks for pending changes.

### Two tabs both think they are team captain

Session writes use Firestore transactions, revision checks, stable record IDs, and operation IDs. Another tab or device must explicitly take over editing. Conflicts preserve the local draft and require a resolution.

Thad yelling louder does not increase his revision number.

### Someone rewrites the training plan

Sessions retain immutable exercise and target snapshots. Updating a template changes future training. Coach Daniels cannot retroactively improve your bench press by editing a document.

### The statistics get creative

Volume is calculated within an exercise and its weight convention. A dumbbell value means the convention you selected. Missing dates remain missing. Extra sets do not inflate planned completion.

You can exclude a program, an exercise, a session, or one exercise occurrence from statistics while keeping the underlying history. This is useful for experiments and bad data. It will also accept your explanation for that particular Tuesday.

## The machinery

| Layer | Stack |
| --- | --- |
| UI | Svelte 5, SvelteKit 2, TypeScript; bold borders and large controls for use between sets |
| Identity | Firebase Authentication with Google popup sign-in |
| Database | Cloud Firestore with user-scoped Security Rules |
| Local persistence | IndexedDB outbox; the Firestore SDK itself uses an in-memory cache |
| Hosting | Official SvelteKit Vercel adapter |
| Validation | AJV and JSON Schema, plus domain checks |
| Verification | Vitest, Firebase emulators, and Playwright |

Data lives under `users/{uid}`. Sessions store their exercise snapshots in the header and their logged records in a subcollection. Dates retain the workout’s original time zone. Rest timers store a deadline rather than trusting a browser tab to count seconds responsibly.

For the full layout, data guarantees, and deployment steps, see the [development guide](docs/development.md). The architecture has received more supervision than the Goat House.

## Local deployment, zero athletic eligibility required

Use Node **22.12+ on the 22.x line**, or **24.x**.

```sh
npm ci
cp -n .env.example .env
```

Set the four `PUBLIC_FIREBASE_*` values in `.env`, enable Google sign-in, and deploy the Firestore rules and indexes using the [Firebase setup instructions](docs/development.md#firebase--google-setup). The copy command preserves an existing `.env`; Git ignores that file.

```sh
npm run dev
```

Open <http://127.0.0.1:5173>.

To run entirely against local Firebase emulators, install Java 21+ and use two terminals:

```sh
# Terminal 1
npm run emulators

# Terminal 2
PUBLIC_USE_EMULATORS=true npm run dev
```

Use **Continue with test account**. Emulator access is restricted to development builds. Production requires an actual Google account; “Coach knows me” is not an authentication provider.

For Vercel, follow the [deployment guide](docs/development.md#vercel-deployment). Firebase configuration goes in Vercel’s environment settings, and the deployed hostname goes in Firebase’s authorized domains.

## Contributing

[Open an issue](https://github.com/Welgum/thad-repbook/issues) with reproduction steps, expected behavior, and actual behavior. “It’s broken, bro” will be treated as an incomplete bug report, however confidently delivered.

For code changes, start with:

```sh
npm run check
npm run lint
npm run test
npm run build
```

Changes to persistence, authentication, or Security Rules also need the [emulator and browser checks](docs/development.md#commands-and-tests). A passing bench press does not satisfy CI.

## License

Code and documentation: [MIT](LICENSE). The third-party reaction image is excluded; rights remain with its respective owners.

Thad has not reviewed the pull requests.
