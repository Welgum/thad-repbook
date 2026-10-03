import { writable, get } from 'svelte/store';
import { get as localGet, set as localSet, entries as localEntries } from 'idb-keyval';
import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { firebase } from '../firebase/client';
import { readSession, sessionHeader, userCollection, userRef } from './data';
import { clone, id } from '../domain/session';
import type { Draft, Session } from '../domain/types';
export const drafts = writable<Record<string, Draft>>({});
let currentUid = '';
const working = new Set<string>();
const locks = new Map<string, Promise<unknown>>();
export function editorId(): string {
	let value = sessionStorage.getItem('repbook-editor');
	if (!value) {
		value = id();
		sessionStorage.setItem('repbook-editor', value);
	}
	return value;
}
const key = (uid: string, sid: string, editor = editorId()) =>
	`repbook:${uid}:draft:${sid}:${editor}`;
export function setDraftUser(uid: string) {
	currentUid = uid;
	drafts.set({});
}
function publish(sid: string, d: Draft) {
	drafts.update((all) => ({ ...all, [sid]: d }));
}
async function persist(uid: string, sid: string, d: Draft) {
	await localSet(key(uid, sid), clone(d));
	if (currentUid === uid) publish(sid, d);
}
export async function openSession(uid: string, sid: string): Promise<Draft> {
	const existing = get(drafts)[sid];
	if (existing) return existing;
	let local = await localGet<Draft>(key(uid, sid));
	if (!local) {
		const candidates = (await localEntries<string, Draft>()).filter(
			([k, v]) =>
				k.startsWith(`repbook:${uid}:draft:${sid}:`) && !k.includes(':backup:') && v.pending
		);
		if (candidates.length) local = { ...candidates[0][1], recoveredFrom: candidates[0][0] };
	}
	if (local?.pending) {
		local.status = local.session.editorId === editorId() ? 'Saved locally' : 'Conflict';
		if (local.status === 'Conflict')
			local.error = 'Recovered unsent changes from another editor. Choose which version to keep.';
		await persist(uid, sid, local);
		if (local.status !== 'Conflict') void syncSession(uid, sid);
		return local;
	}
	try {
		const s = await readSession(uid, sid);
		const d: Draft = {
			session: s,
			baseRevision: s.revision,
			dirtyRecordIds: [],
			pending: false,
			operationId: id(),
			status: 'Synced'
		};
		await persist(uid, sid, d);
		return d;
	} catch (error) {
		if (local) {
			await persist(uid, sid, local);
			return local;
		}
		throw error;
	}
}
export function watchSession(uid: string, sid: string) {
	const { db } = firebase();
	return onSnapshot(doc(userCollection(db, uid, 'sessions'), sid), async (snapshot) => {
		const d = get(drafts)[sid];
		if (
			!d ||
			d.pending ||
			working.has(sid) ||
			!snapshot.exists() ||
			snapshot.metadata.hasPendingWrites
		)
			return;
		if (
			snapshot.data().revision !== d.baseRevision ||
			snapshot.data().editorId !== d.session.editorId
		) {
			try {
				const s = await readSession(uid, sid);
				if (currentUid !== uid || get(drafts)[sid]?.pending) return;
				await persist(uid, sid, {
					session: s,
					baseRevision: s.revision,
					pending: false,
					dirtyRecordIds: [],
					operationId: id(),
					status: 'Synced'
				});
			} catch {
				/* The next snapshot or Retry will recover. */
			}
		}
	});
}
export async function mutateSession(
	uid: string,
	sid: string,
	mutation: (s: Session) => void,
	recordIds: string[] = []
) {
	const before = locks.get(sid) || Promise.resolve();
	const action = before
		.catch(() => {})
		.then(async () => {
			const old = get(drafts)[sid];
			if (!old) throw new Error('The workout has not loaded yet.');
			if (old.status === 'Conflict') throw new Error('Resolve the conflict before editing.');
			if (old.session.editorId !== editorId())
				throw new Error('Another editor owns this workout. Take over to continue.');
			const d = clone(old);
			mutation(d.session);
			if (d.session.notes.length > 2000)
				throw new Error('Notes must be 2,000 characters or fewer.');
			d.pending = true;
			d.operationId = id();
			d.status = 'Saved locally';
			d.error = undefined;
			d.dirtyRecordIds = [...new Set([...d.dirtyRecordIds, ...recordIds])];
			// Do not acknowledge a log or start its visible timer until IndexedDB commits.
			await persist(uid, sid, d);
			void syncSession(uid, sid);
		});
	locks.set(sid, action);
	await action;
}
export async function syncSession(uid: string, sid: string) {
	if (working.has(sid) || currentUid !== uid) return;
	working.add(sid);
	try {
		for (;;) {
			const live = get(drafts)[sid];
			if (!live?.pending || live.status === 'Conflict' || !navigator.onLine) break;
			const sent = clone(live);
			const split = sent.dirtyRecordIds.length > 200;
			if (split) sent.dirtyRecordIds = sent.dirtyRecordIds.slice(0, 200);
			publish(sid, { ...live, status: 'Syncing' });
			const { db } = firebase();
			const ref = doc(userCollection(db, uid, 'sessions'), sid);
			try {
				const revision = await runTransaction(db, async (tx) => {
					const remote = await tx.get(ref);
					const profile = await tx.get(userRef(db, uid));
					if (!remote.exists()) throw new Error('This workout no longer exists.');
					const r = remote.data();
					if (r.lastOperationId === sent.operationId) return r.revision as number;
					if (r.revision !== sent.baseRevision || r.editorId !== editorId())
						throw new Error(
							'CONFLICT: This workout changed on another device. Your local version is safe.'
						);
					const next = sent.baseRevision + 1;
					tx.update(ref, {
						...sessionHeader(sent.session),
						...(split
							? { status: r.status, finishedAt: r.finishedAt, durationSeconds: r.durationSeconds }
							: {}),
						revision: next,
						lastOperationId: sent.operationId,
						updatedAt: serverTimestamp()
					});
					for (const rid of sent.dirtyRecordIds) {
						const record = sent.session.records.find((r) => r.id === rid);
						if (record)
							tx.set(doc(collection(ref, 'records'), rid), {
								...record,
								syncedAtServer: serverTimestamp()
							});
					}
					if (
						!split &&
						sent.session.status !== 'in_progress' &&
						profile.data()?.activeSessionId === sid
					)
						tx.update(userRef(db, uid), { activeSessionId: null, updatedAt: serverTimestamp() });
					return next;
				});
				if (currentUid !== uid) break;
				// Serialize acknowledgments with local mutations; a newer local operation stays pending.
				const prior = locks.get(sid) || Promise.resolve();
				const ack = prior
					.catch(() => {})
					.then(async () => {
						const now = get(drafts)[sid];
						if (!now) return;
						const same = now.operationId === sent.operationId && !split;
						const updated: Draft = {
							...now,
							...(split && now.operationId === sent.operationId ? { operationId: id() } : {}),
							baseRevision: revision,
							session: { ...now.session, revision, lastOperationId: sent.operationId },
							pending: !same,
							status: same ? 'Synced' : 'Saved locally',
							dirtyRecordIds: same
								? []
								: now.dirtyRecordIds.filter(
										(rid) =>
											!sent.dirtyRecordIds.includes(rid) ||
											JSON.stringify(now.session.records.find((r) => r.id === rid)) !==
												JSON.stringify(sent.session.records.find((r) => r.id === rid))
									)
						};
						await persist(uid, sid, updated);
					});
				locks.set(sid, ack);
				await ack;
			} catch (error) {
				const now = get(drafts)[sid];
				if (now && currentUid === uid) {
					const message = error instanceof Error ? error.message : 'Unable to sync.';
					await persist(uid, sid, {
						...now,
						status: message.startsWith('CONFLICT:') ? 'Conflict' : 'Sync failed',
						error: message
					});
				}
				break;
			}
		}
	} finally {
		working.delete(sid);
	}
}
export async function resolveConflict(uid: string, sid: string, choice: 'local' | 'remote') {
	const local = get(drafts)[sid];
	if (!local) return;
	const remote = await readSession(uid, sid);
	async function markRecovered() {
		if (local?.recoveredFrom) {
			await localSet(`${local.recoveredFrom}:backup:${Date.now()}`, clone(local));
			await localSet(local.recoveredFrom, { ...clone(local), pending: false });
		}
	}
	if (choice === 'remote') {
		await localSet(`${key(uid, sid)}:backup:${Date.now()}`, clone(local));
		await persist(uid, sid, {
			session: remote,
			baseRevision: remote.revision,
			dirtyRecordIds: [],
			pending: false,
			operationId: id(),
			status: 'Synced'
		});
		await markRecovered();
		return;
	}
	const { db } = firebase();
	const ref = doc(userCollection(db, uid, 'sessions'), sid);
	const version = await runTransaction(db, async (tx) => {
		const latest = await tx.get(ref);
		if (latest.data()?.revision !== remote.revision)
			throw new Error('The server changed again. Retry the takeover.');
		tx.update(ref, {
			editorId: editorId(),
			revision: remote.revision + 1,
			updatedAt: serverTimestamp()
		});
		return remote.revision + 1;
	});
	// Keep both versions on disk before the user-authorized replacement.
	await localSet(`${key(uid, sid)}:backup:${Date.now()}`, clone(remote));
	const s = clone(local.session);
	s.editorId = editorId();
	s.revision = version;
	for (const r of remote.records)
		if (!s.records.some((l) => l.id === r.id)) s.records.push({ ...r, deletedAt: Date.now() });
	for (const record of s.records) {
		record.revision =
			Math.max(record.revision, remote.records.find((r) => r.id === record.id)?.revision || 0) + 1;
		record.operationId = id();
	}
	await markRecovered();
	await persist(uid, sid, {
		session: s,
		baseRevision: version,
		dirtyRecordIds: s.records.map((r) => r.id),
		pending: true,
		operationId: id(),
		status: 'Saved locally'
	});
	void syncSession(uid, sid);
}
export async function takeover(uid: string, sid: string) {
	const d = get(drafts)[sid];
	if (d?.pending) {
		await resolveConflict(uid, sid, 'local');
		return;
	}
	const { db } = firebase();
	const ref = doc(userCollection(db, uid, 'sessions'), sid);
	await runTransaction(db, async (tx) => {
		const s = await tx.get(ref);
		tx.update(ref, {
			editorId: editorId(),
			revision: s.data()!.revision + 1,
			updatedAt: serverTimestamp()
		});
	});
	const s = await readSession(uid, sid);
	await persist(uid, sid, {
		session: s,
		baseRevision: s.revision,
		dirtyRecordIds: [],
		pending: false,
		operationId: id(),
		status: 'Synced'
	});
}
export async function hasPending(uid: string): Promise<boolean> {
	return (await localEntries<string, Draft>()).some(
		([k, d]) => k.startsWith(`repbook:${uid}:draft:`) && !k.includes(':backup:') && d.pending
	);
}
export async function retryAll(uid: string) {
	for (const sid of Object.keys(get(drafts))) await syncSession(uid, sid);
}
