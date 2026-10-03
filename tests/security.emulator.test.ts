import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import {
	initializeTestEnvironment,
	assertFails,
	assertSucceeds,
	type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import {
	doc,
	getDoc,
	getDocs,
	collection,
	setDoc,
	updateDoc,
	serverTimestamp,
	type Firestore
} from 'firebase/firestore';
import { initializeUser } from '../src/lib/seed/initialize';
let env: RulesTestEnvironment;
beforeAll(async () => {
	env = await initializeTestEnvironment({
		projectId: 'demo-repbook',
		firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') }
	});
});
afterAll(async () => {
	await env.cleanup();
});
describe('production security rules and initialization', () => {
	it('initializes concurrently exactly once without history and preserves user edits', async () => {
		const db = env.authenticatedContext('seed-user').firestore() as unknown as Firestore;
		const user = { uid: 'seed-user', displayName: 'Test Athlete', email: 'test@example.test' };
		await Promise.all([
			initializeUser(db, user, 'Europe/Warsaw'),
			initializeUser(db, user, 'Europe/Warsaw')
		]);
		expect((await getDocs(collection(db, 'users/seed-user/workouts'))).size).toBe(5);
		expect((await getDocs(collection(db, 'users/seed-user/exercises'))).size).toBe(15);
		expect((await getDocs(collection(db, 'users/seed-user/sessions'))).size).toBe(0);
		const ref = doc(db, 'users/seed-user/workouts/seed-v1-monday-lower-shoulders');
		await updateDoc(ref, {
			name: 'My program',
			archivedAt: 123,
			version: 2,
			updatedAt: serverTimestamp()
		});
		await initializeUser(db, user, 'UTC');
		expect((await getDoc(ref)).data()?.name).toBe('My program');
		expect((await getDoc(ref)).data()?.archivedAt).toBe(123);
	});
	it('denies unauthenticated and cross-user reads, queries, writes and nested records', async () => {
		const a = env.authenticatedContext('intruder').firestore();
		const anon = env.unauthenticatedContext().firestore();
		await assertFails(getDoc(doc(a, 'users/seed-user')));
		await assertFails(getDocs(collection(a, 'users/seed-user/workouts')));
		await assertFails(getDoc(doc(a, 'users/seed-user/sessions/session/records/record')));
		await assertFails(
			setDoc(doc(a, 'users/seed-user/sessions/session/records/record'), { reps: 1 })
		);
		await assertFails(
			updateDoc(doc(a, 'users/seed-user/workouts/seed-v1-monday-lower-shoulders'), {
				name: 'stolen'
			})
		);
		await assertFails(getDoc(doc(anon, 'users/seed-user')));
		await assertFails(setDoc(doc(a, 'public/data'), { value: true }));
	});
	it('rejects invalid profile fields, exercise convention changes and stale template revisions', async () => {
		const db = env.authenticatedContext('seed-user').firestore();
		await assertSucceeds(getDoc(doc(db, 'users/seed-user')));
		await assertFails(
			updateDoc(doc(db, 'users/seed-user'), { units: 'lbs', updatedAt: serverTimestamp() })
		);
		await assertFails(
			updateDoc(doc(db, 'users/seed-user'), { owner: 'intruder', updatedAt: serverTimestamp() })
		);
		await assertFails(
			updateDoc(doc(db, 'users/seed-user/exercises/seed-v1-deadlift'), {
				weightConvention: 'per_dumbbell',
				updatedAt: serverTimestamp()
			})
		);
		await assertFails(
			updateDoc(doc(db, 'users/seed-user/workouts/seed-v1-monday-lower-shoulders'), {
				version: 1,
				updatedAt: serverTimestamp()
			})
		);
	});
});

it('enforces record bounds, immutable links, revision checks and session snapshots', async () => {
	const { materialize } = await import('../src/lib/seed/initialize');
	const { makeSession, serializeSession } = await import('../src/lib/domain/session');
	const seed = (await import('../src/lib/seed/bundle.json')).default;
	const { exercises, workouts } = materialize(
		seed as import('../src/lib/domain/types').Bundle,
		'seed-v1'
	);
	const s = makeSession(workouts[0], exercises, 'UTC', 'test-editor');
	const db = env.authenticatedContext('record-user').firestore();
	const header = serializeSession(s);
	const sessionRef = doc(db, `users/record-user/sessions/${s.id}`);
	await assertSucceeds(
		setDoc(sessionRef, { ...header, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
	);
	const record = {
		id: 'one',
		sessionExerciseId: s.exercises[0].id,
		sessionExerciseOrder: 0,
		kind: 'strength',
		plannedUnitIndex: 0,
		isExtra: false,
		status: 'logged',
		reps: 6,
		weightKg: 50,
		loggedAtClient: Date.now(),
		syncedAtServer: serverTimestamp(),
		revision: 1,
		operationId: 'op-one',
		deletedAt: null
	};
	const ref = doc(sessionRef, 'records', 'one');
	await assertSucceeds(setDoc(ref, record));
	await assertFails(
		updateDoc(ref, { weightKg: -1, revision: 2, syncedAtServer: serverTimestamp() })
	);
	await assertFails(updateDoc(ref, { reps: 1001, revision: 2, syncedAtServer: serverTimestamp() }));
	await assertFails(
		updateDoc(ref, {
			sessionExerciseId: s.exercises[1].id,
			revision: 2,
			syncedAtServer: serverTimestamp()
		})
	);
	await assertFails(
		updateDoc(ref, { weightKg: 55, revision: 1, syncedAtServer: serverTimestamp() })
	);
	await assertFails(
		updateDoc(sessionRef, { revision: 1, templateId: 'different', updatedAt: serverTimestamp() })
	);
	const changed = structuredClone(s.exercises);
	changed[0].exerciseSnapshot.name = 'Forged';
	await assertFails(
		updateDoc(sessionRef, { revision: 1, exercises: changed, updatedAt: serverTimestamp() })
	);
	changed[0].exerciseSnapshot.name = s.exercises[0].exerciseSnapshot.name;
	changed[0].excludedFromStats = true;
	await assertSucceeds(
		updateDoc(sessionRef, {
			revision: 1,
			exerciseStates: {
				...(header.exerciseStates as Record<string, unknown>),
				[s.exercises[0].id]: { notes: '', excludedFromStats: true }
			},
			updatedAt: serverTimestamp()
		})
	);
	await assertFails(
		updateDoc(sessionRef, { revision: 1, notes: 'stale', updatedAt: serverTimestamp() })
	);
});
