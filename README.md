# Repbook 💪

**Lift. Log. Rest. Remember what you lifted last time.**

Repbook is a personal workout journal for the part of your brain that forgets every number immediately after a hard set. Build your programs, log your training, and watch your progress take shape in a bold, colorful interface that feels at home on your phone.

<p align="center">
  <img src="docs/images/slow-clap.webp" width="498" alt="An approving slow clap." />
  <br />
  <em>When you actually log the set instead of saying “I’ll remember it.”</em>
</p>

## Your training, with receipts

| In the gym | In Repbook |
| --- | --- |
| “What am I training today?” | Five starter programs and a shared exercise library, ready to make your own. |
| “What did I lift last time?” | Previous results alongside your current exercise. Your memory can take a rest day. |
| “Was that set three or four?” | Log reps, weight, and set status as you go. |
| “How long have I been scrolling?” | A rest timer that keeps its deadline when you switch tabs or refresh. |
| “Am I getting anywhere?” | Calendar, workout history, and progress views for programs and individual exercises. |
| “I trained yesterday. Forgot to log it.” | Add a past session with its actual workout date. |

## Built for the whole session

**More than barbells.** Track loaded and bodyweight strength work, timed isometric holds, and cardio. Weights use kilograms, with explicit conventions for dumbbells, machines, and assisted movements.

**Your plan can change.** Create, edit, duplicate, and archive programs. Adjust sets, rep ranges, and rest times. Completed sessions keep a snapshot of the plan you used, so editing next week’s workout preserves last week’s history.

**Gym Wi-Fi can have a bad day.** Start a session online, then keep logging if the connection drops. Entries save in your browser and sync when the connection returns. The app shows what is still waiting to sync; let it finish before signing out or clearing browser data.

**The numbers stay useful.** Keep a session in your journal while excluding it from statistics. Exclude a program, an exercise, or one exercise occurrence when you need to. Missing training days stay missing rather than turning into invented zeroes.

**Bring your own program.** Import a JSON workout bundle with validation before saving. The app includes a format guide, example file, and a prompt you can give an AI assistant to help prepare your plan.

## From first login to first set

1. Sign in with Google to open your personal training space.
2. Pick one of the five starter programs, build your own, or import a plan.
3. Start a workout, log your sets, and let the rest timer do its job.
4. Finish the session and find it in your calendar and progress views.

The starter library contains **15 exercises and 5 programs**. You can run any program on any day. Monday’s workout will survive being done on Tuesday.

## Run your own Repbook

Built with **Svelte 5, SvelteKit, TypeScript, Firebase Authentication, and Cloud Firestore**, with a Vercel adapter ready for deployment.

With Node 22.12+ on the 22.x line or Node 24 installed:

```sh
npm ci
cp -n .env.example .env
```

Fill in the four `PUBLIC_FIREBASE_*` values in `.env`, then run:

```sh
npm run dev
```

Open <http://127.0.0.1:5173>. The `.env` file is ignored by Git; keep your own configuration there. The copy command preserves an existing `.env`.

The **[development guide](docs/development.md)** covers Firebase and Google sign-in setup, trying the app with local emulators, Vercel deployment, architecture, and test commands.

## Make it better

Found a bug or have an idea? [Open an issue](https://github.com/Welgum/thad-repbook/issues) with what happened and what you expected. Contributions are welcome; see the [development guide](docs/development.md#commands-and-tests) for the checks to run before a pull request.

## License

Source code and documentation are available under the [MIT License](LICENSE).
The third-party reaction image is excluded from this license; rights remain with its respective owners.
