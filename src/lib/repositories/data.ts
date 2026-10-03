import {
	collection,
	doc,
	getDoc,
	getDocs,
	query,
	orderBy,
	where,
	limit,
	startAfter,
	runTransaction,
	serverTimestamp,
	type Firestore,
	type QueryConstraint,
	type DocumentData,
	type QueryDocumentSnapshot
} from 'firebase/firestore';
import { firebase } from '../firebase/client';
import type { Bundle, Exercise, Profile, Session, SessionRecord, Workout } from '../domain/types';
import { clone, id, makeSession, serializeSession, hydrateSession } from '../domain/session';
import { compatible, validateImport } from '../validation/import';
import { dateInZone, validDate } from '../domain/time';
export const userRef = (db: Firestore, uid: string) => doc(db, 'users', uid);
export const userCollection = (db: Firestore, uid: string, name: string) =>
	collection(db, 'users', uid, name);
export { initializeUser } from '../seed/initialize';
import { materialize } from '../seed/initialize';
export async function saveEntity(
	uid: string,
	name: 'workouts' | 'exercises',
	value: Workout | Exercise
) {
	const { db } = firebase();
	const ref = doc(userCollection(db, uid, name), value.id);
	await runTransaction(db, async (tx) => {
		const old = await tx.get(ref);
		if (name === 'workouts' && old.exists() && old.data().version !== (value as Workout).version)
			throw new Error('This workout changed on another device. Reload before saving.');
		tx.set(ref, {
			...clone(value),
			...(name === 'workouts' ? { version: old.exists() ? old.data().version + 1 : 1 } : {}),
			updatedAt: serverTimestamp(),
			createdAt: old.exists() ? old.data().createdAt : serverTimestamp()
		});
	});
}
export async function saveProfile(uid: string, updates: Partial<Profile>) {
	const { db } = firebase();
	await runTransaction(db, async (tx) => {
		const ref = userRef(db, uid);
		await tx.get(ref);
		tx.update(ref, { ...updates, updatedAt: serverTimestamp() });
	});
}
export const sessionHeader = serializeSession;
export async function startSession(
	uid: string,
	workout: Workout,
	exercises: Exercise[],
	profile: Profile,
	editorId: string,
	pastDate?: string
): Promise<Session> {
	if (!navigator.onLine) throw new Error('Connect to the internet to start a workout.');
	if (pastDate && (!validDate(pastDate) || pastDate > dateInZone(Date.now(), profile.timeZone)))
		throw new Error('Choose today or a past date.');
	const s = makeSession(workout, exercises, profile.timeZone, editorId, pastDate);
	const { db } = firebase();
	await runTransaction(db, async (tx) => {
		const ref = userRef(db, uid);
		const p = await tx.get(ref);
		if (p.data()?.activeSessionId)
			throw new Error(
				'You already have an active workout. Resume it or abandon it before starting another.'
			);
		tx.set(doc(userCollection(db, uid, 'sessions'), s.id), {
			...sessionHeader(s),
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp()
		});
		tx.update(ref, { activeSessionId: s.id, updatedAt: serverTimestamp() });
	});
	return s;
}
export async function readSession(uid: string, sessionId: string): Promise<Session> {
	const { db } = firebase();
	const ref = doc(userCollection(db, uid, 'sessions'), sessionId);
	const [s, r] = await Promise.all([getDoc(ref), getDocs(collection(ref, 'records'))]);
	if (!s.exists()) throw new Error('Workout not found.');
	return hydrateSession(
		s.data(),
		r.docs.map((d) => ({ ...d.data(), id: d.id })) as SessionRecord[],
		s.id
	);
}
export interface SessionFilter {
	from?: string;
	to?: string;
	templateId?: string;
	status?: string;
	cursor?: QueryDocumentSnapshot<DocumentData>;
	count?: number;
}
export async function sessionPage(uid: string, filter: SessionFilter = {}) {
	const { db } = firebase();
	const constraints: QueryConstraint[] = [];
	if (filter.from) constraints.push(where('workoutDate', '>=', filter.from));
	if (filter.to) constraints.push(where('workoutDate', '<=', filter.to));
	if (filter.templateId) constraints.push(where('templateId', '==', filter.templateId));
	if (filter.status) constraints.push(where('status', '==', filter.status));
	constraints.push(orderBy('workoutDate', 'desc'), orderBy('__name__', 'desc'));
	if (filter.cursor) constraints.push(startAfter(filter.cursor));
	constraints.push(limit(filter.count || 20));
	const snapshot = await getDocs(query(userCollection(db, uid, 'sessions'), ...constraints));
	const sessions = await Promise.all(
		snapshot.docs.map(async (d) => {
			const records = await getDocs(collection(d.ref, 'records'));
			return hydrateSession(
				d.data(),
				records.docs.map((r) => ({ ...r.data(), id: r.id })) as SessionRecord[],
				d.id
			);
		})
	);
	return {
		sessions: sessions.filter((s) => s.deletedAt == null),
		cursor: snapshot.docs.at(-1),
		hasMore: snapshot.size === (filter.count || 20)
	};
}
export async function sessionsInRange(
	uid: string,
	from?: string,
	to?: string,
	onProgress?: (count: number) => void
): Promise<Session[]> {
	const all: Session[] = [];
	let cursor: SessionFilter['cursor'];
	for (;;) {
		const page = await sessionPage(uid, { from, to, cursor, count: 50 });
		all.push(...page.sessions);
		onProgress?.(all.length);
		if (!page.hasMore) break;
		cursor = page.cursor;
	}
	return all;
}
export async function importBundle(
	uid: string,
	bundle: Bundle,
	operationId: string,
	digest: string,
	mapping: Record<string, string>
) {
	const validation = validateImport(JSON.stringify(bundle));
	if (!validation.bundle) throw new Error(validation.errors.join('\n'));
	if (!navigator.onLine)
		throw new Error('Connect to the internet to import. Your preview is preserved.');
	const { db } = firebase();
	const receipt = doc(userCollection(db, uid, 'importReceipts'), operationId);
	const data = materialize(bundle, operationId, mapping);
	const existingKeys = new Set(
		(await getDocs(userCollection(db, uid, 'exercises'))).docs.map((d) => d.data().key)
	);
	if (data.exercises.length + data.workouts.length + 1 > 450)
		throw new Error('Too many writes. Split the import.');
	if (data.workouts.some((w) => new TextEncoder().encode(JSON.stringify(w)).length > 65536))
		throw new Error('A serialized workout exceeds 64 KiB. Split the workout.');
	return runTransaction(db, async (tx) => {
		const previous = await tx.get(receipt);
		if (previous.exists()) return previous.data();
		const matches = await Promise.all(
			Object.entries(mapping).map(async ([key, value]) => ({
				key,
				doc: await tx.get(doc(userCollection(db, uid, 'exercises'), value))
			}))
		);
		for (const match of matches)
			if (
				!match.doc.exists() ||
				!compatible(
					match.doc.data() as Exercise,
					bundle.exercises.find((e) => e.key === match.key)!
				)
			)
				throw new Error('A mapped exercise changed. Review the preview again.');
		data.exercises.forEach((e) =>
			tx.set(doc(userCollection(db, uid, 'exercises'), e.id), {
				...e,
				key: existingKeys.has(e.key) ? `${e.key.slice(0, 26)}-${operationId.slice(0, 8)}` : e.key,
				createdAt: serverTimestamp(),
				updatedAt: serverTimestamp()
			})
		);
		data.workouts.forEach((w) =>
			tx.set(doc(userCollection(db, uid, 'workouts'), w.id), {
				...w,
				createdAt: serverTimestamp(),
				updatedAt: serverTimestamp()
			})
		);
		const result = {
			operationId,
			fileDigest: digest,
			mapping: data.mapping,
			createdIds: data.workouts.map((w) => w.id),
			completedAt: serverTimestamp()
		};
		tx.set(receipt, result);
		return result;
	});
}
export async function digestText(text: string) {
	return Array.from(
		new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
	)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}
export const newId = id;
