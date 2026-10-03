import {
	doc,
	collection,
	runTransaction,
	getDocFromServer,
	serverTimestamp,
	type Firestore
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import type { Bundle, Exercise, Profile, Workout } from '../domain/types';
import seed from './bundle.json';
const userRef = (db: Firestore, uid: string) => doc(db, 'users', uid);
const userCollection = (db: Firestore, uid: string, name: string) =>
	collection(db, 'users', uid, name);
export function materialize(bundle: Bundle, prefix: string, mapping: Record<string, string> = {}) {
	const exercises: Exercise[] = bundle.exercises
		.filter((e) => !mapping[e.key])
		.map((e) => ({ ...e, id: `${prefix}-${e.key}`, archivedAt: null, excludedFromStats: false }));
	const resolved = { ...Object.fromEntries(exercises.map((e) => [e.key, e.id])), ...mapping };
	const workouts: Workout[] = bundle.workouts.map((w) => ({
		id: `${prefix}-${w.key}`,
		key: w.key,
		name: w.name,
		notes: w.notes || '',
		version: 1,
		archivedAt: null,
		excludedFromStats: false,
		items: w.items.map((item) => ({
			itemId: `${prefix}-${item.itemKey}`,
			exerciseId: resolved[item.exerciseKey],
			target: item.target,
			restSeconds: item.restSeconds,
			...(item.notes ? { notes: item.notes } : {}),
			...(item.defaultWeightKg === undefined ? {} : { defaultWeightKg: item.defaultWeightKg })
		}))
	}));
	return { exercises, workouts, mapping: resolved };
}
export async function initializeUser(
	db: Firestore,
	user: Pick<User, 'uid' | 'displayName' | 'email'>,
	timeZone: string
) {
	const ref = userRef(db, user.uid);
	const data = materialize(seed as Bundle, 'seed-v1');
	try {
		await runTransaction(db, async (tx) => {
			const current = await tx.get(ref);
			if (current.data()?.seedVersion === 1) return;
			if (current.exists())
				throw new Error(
					'This account has an unsupported seed version. No existing data was overwritten.'
				);
			const profile: Profile = {
				displayName: user.displayName || 'Athlete',
				email: user.email || '',
				timeZone,
				units: 'kg',
				seedVersion: 1,
				activeSessionId: null,
				settings: { weightStep: 0.5 }
			};
			tx.set(ref, { ...profile, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
			data.exercises.forEach((e) =>
				tx.set(doc(userCollection(db, user.uid, 'exercises'), e.id), {
					...e,
					createdAt: serverTimestamp(),
					updatedAt: serverTimestamp()
				})
			);
			data.workouts.forEach((w) =>
				tx.set(doc(userCollection(db, user.uid, 'workouts'), w.id), {
					...w,
					createdAt: serverTimestamp(),
					updatedAt: serverTimestamp()
				})
			);
		});
	} catch (error) {
		// A concurrent first-login transaction may hit immutable-create rules after the other tab commits.
		// Only a server-confirmed atomic seed marker turns that race into success.
		const winner = await getDocFromServer(ref);
		if (winner.data()?.seedVersion !== 1) throw error;
	}
}
