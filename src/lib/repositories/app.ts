import { writable, get } from 'svelte/store';
import {
	GoogleAuthProvider,
	onAuthStateChanged,
	signInWithPopup,
	signOut,
	signInWithEmailAndPassword,
	createUserWithEmailAndPassword,
	type User
} from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';
import { configured, emulatorEnabled, firebase } from '../firebase/client';
import { initializeUser, userCollection, userRef } from './data';
import { hasPending, retryAll, setDraftUser } from './sessions';
import type { Exercise, Profile, Workout } from '../domain/types';
interface AppState {
	phase: 'loading' | 'signed-out' | 'ready' | 'error' | 'unconfigured';
	user: User | null;
	profile: Profile | null;
	exercises: Exercise[];
	workouts: Workout[];
	error: string;
	online: boolean;
}
const initial: AppState = {
	phase: 'loading',
	user: null,
	profile: null,
	exercises: [],
	workouts: [],
	error: '',
	online: true
};
export const app = writable<AppState>(initial);
const STARTUP_TIMEOUT_MS = 20_000;
export function errorMessage(error: unknown): string {
	const code = (error as { code?: string })?.code;
	return (
		{
			'auth/popup-blocked':
				'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
			'auth/network-request-failed': 'Could not connect. Check your connection and try again.',
			'auth/unauthorized-domain':
				'This domain is not authorized for Google sign-in. Add it to Firebase Authentication authorized domains.',
			'auth/cancelled-popup-request': '',
			'auth/popup-closed-by-user': ''
		}[code || ''] ??
		(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
	);
}
export function initializeAppState() {
	if (!configured()) {
		app.set({ ...initial, phase: 'unconfigured' });
		return () => {};
	}
	let subscriptions: (() => void)[] = [];
	let unsubscribe = () => {};
	let epoch = 0;
	let disposed = false;
	let failed = false;
	let timeout: ReturnType<typeof setTimeout>;
	const current = (generation: number) => !disposed && !failed && generation === epoch;
	const stopSubscriptions = () => {
		subscriptions.forEach((fn) => fn());
		subscriptions = [];
	};
	const fail = (generation: number, error: unknown) => {
		if (!current(generation)) return;
		failed = true;
		clearTimeout(timeout);
		stopSubscriptions();
		app.update((s) => ({ ...s, phase: 'error', error: errorMessage(error) }));
	};
	const watchStartup = (generation: number) => {
		clearTimeout(timeout);
		timeout = setTimeout(
			() =>
				fail(
					generation,
					new Error(
						navigator.onLine
							? 'Your training space is taking too long to load. Check your connection and try again. If this continues, the database may be unavailable.'
							: 'You’re offline. Connect to the internet and try again.'
					)
				),
			STARTUP_TIMEOUT_MS
		);
	};
	const online = () => {
		app.update((s) => ({ ...s, online: navigator.onLine }));
		const uid = get(app).user?.uid;
		if (uid && navigator.onLine) void retryAll(uid);
	};
	app.set({ ...initial, online: navigator.onLine });
	window.addEventListener('online', online);
	window.addEventListener('offline', online);
	watchStartup(epoch);
	try {
		const { auth, db } = firebase();
		unsubscribe = onAuthStateChanged(
			auth,
			async (user) => {
				if (disposed) return;
				const generation = ++epoch;
				failed = false;
				clearTimeout(timeout);
				stopSubscriptions();
				setDraftUser(user?.uid || '');
				app.set({
					...initial,
					phase: user ? 'loading' : 'signed-out',
					user,
					online: navigator.onLine
				});
				if (!user) return;
				watchStartup(generation);
				try {
					await initializeUser(db, user, Intl.DateTimeFormat().resolvedOptions().timeZone);
					if (!current(generation)) return;
					const loaded = new Set<string>();
					const mark = (name: string) => {
						loaded.add(name);
						if (loaded.size === 3) {
							clearTimeout(timeout);
							app.update((s) => ({ ...s, phase: 'ready' }));
						}
					};
					const subscriptionFailed = (error: unknown) => fail(generation, error);
					subscriptions.push(
						onSnapshot(
							userRef(db, user.uid),
							(s) => {
								if (!current(generation)) return;
								if (!s.exists()) {
									fail(
										generation,
										new Error('Your profile could not be loaded. Please try again.')
									);
									return;
								}
								app.update((a) => ({ ...a, profile: s.data() as Profile }));
								mark('profile');
							},
							subscriptionFailed
						)
					);
					subscriptions.push(
						onSnapshot(
							userCollection(db, user.uid, 'exercises'),
							(s) => {
								if (!current(generation)) return;
								app.update((a) => ({
									...a,
									exercises: s.docs.map((d) => ({ ...d.data(), id: d.id })) as Exercise[]
								}));
								mark('exercises');
							},
							subscriptionFailed
						)
					);
					subscriptions.push(
						onSnapshot(
							userCollection(db, user.uid, 'workouts'),
							(s) => {
								if (!current(generation)) return;
								app.update((a) => ({
									...a,
									workouts: (s.docs.map((d) => ({ ...d.data(), id: d.id })) as Workout[]).sort(
										(a, b) => {
											const order = ['monday', 'tuesday', 'wednesday', 'friday', 'saturday'];
											const rank = (w: Workout) =>
												w.id.startsWith('seed-v1-')
													? order.findIndex((day) => w.key.startsWith(day))
													: 99;
											return rank(a) - rank(b) || a.name.localeCompare(b.name);
										}
									)
								}));
								mark('workouts');
							},
							subscriptionFailed
						)
					);
				} catch (e) {
					fail(generation, e);
				}
			},
			(error) => fail(epoch, error)
		);
	} catch (error) {
		fail(epoch, error);
	}
	return () => {
		disposed = true;
		clearTimeout(timeout);
		unsubscribe();
		stopSubscriptions();
		window.removeEventListener('online', online);
		window.removeEventListener('offline', online);
	};
}
export async function login() {
	try {
		await signInWithPopup(firebase().auth, new GoogleAuthProvider());
	} catch (e) {
		const message = errorMessage(e);
		if (message) throw new Error(message);
	}
}
export async function emulatorLogin(email: string) {
	if (!emulatorEnabled()) throw new Error('Emulator login is disabled.');
	try {
		await signInWithEmailAndPassword(firebase().auth, email, 'local-testing-only');
	} catch (e) {
		if (['auth/user-not-found', 'auth/invalid-credential'].includes((e as { code: string }).code))
			await createUserWithEmailAndPassword(firebase().auth, email, 'local-testing-only');
		else throw e;
	}
}
export async function logout() {
	const uid = get(app).user?.uid;
	if (uid && (await hasPending(uid)))
		throw new Error(
			'You have unsent changes. Stay signed in and use Retry sync before signing out.'
		);
	await signOut(firebase().auth);
}
