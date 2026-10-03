# Verification — 2026-10-03

## Automated checks

- `npm run check`: passed, zero errors and warnings.
- `npm run lint`: passed.
- `npm run test`: 24 domain tests passed. Coverage includes exact seeds / sample agreement, schema and semantic rejection, shared exercise identity, formulas, exclusion precedence, failed / extra / partial records, snapshot isolation, historical suggestions, decimal parsing, deadline restoration, DST, month/year boundaries and deletion handling.
- Firestore Emulator Suite: 4 security tests passed. Real rules were loaded for concurrent seed initialization, preservation of edited/archived seed programs, cross-account and unauthenticated access denial, nested record access, critical bounds, immutable relationships/conventions/snapshots, and stale revision rejection.
- Playwright + Firebase Authentication/Firestore emulators: 6 integration scenarios passed. These exercise Start → Log → Rest → Undo → offline save/reconnect → refresh → Finish → Calendar → Exclude/Restore; bodyweight 0/+10/−20; partial/complete isometric rounds; duration and no-load activities; past entries with unknown duration and no timer; template edits and previous-result suggestions; conflicting offline edits with explicit takeover; import preview/mapping/idempotent resubmission; and sign-out/account isolation.
- Mobile browser layout assertions passed at 360, 390 and 430 CSS px; desktop routes were checked at 1440 px. Home, active session and calendar screenshots were visually inspected. Keyboard/safe-area behavior on physical phones still needs a real-device check.
- `npm run build`: passed using `@sveltejs/adapter-vercel`, producing `.vercel/output`.
- Production preview HTTP checks passed for login, calendar, nested session/history/workout URLs, public format documentation and both downloadable JSON files; no server-side browser-API failures.
- `npm audit --omit=dev`: zero reported production dependency vulnerabilities at verification time. npm overrides pin patched, compatible cookie and grpc transitive dependencies.

Test fixtures are confined to the local `demo-repbook` emulators. New production accounts receive five templates and fifteen shared exercises, with empty history. Screenshots and traces are generated under `test-results/` and are not seed data.

## Requires deployment credentials / target devices

No production Firebase configuration or Vercel account/hostname was provided. The app has **not been deployed**. The remaining steps are to configure Firebase Google sign-in, set Vercel environment variables, deploy Firestore rules/indexes, deploy the site, and test Google OAuth plus a real Firestore write on the actual authorized hostname. See README.md for exact commands.

Real Google login on mobile Safari/Chrome, physical-device decimal keyboards, background/lock-screen restoration, and production-domain refresh cannot be certified from the emulator tests. Unit tests verify deadline arithmetic and stable timezone dates; browser tests verify local recovery and refresh. These checks complement the required device tests.
