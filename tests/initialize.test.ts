import { beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
const mocks = vi.hoisted(() => ({ runTransaction: vi.fn(), getDocFromServer: vi.fn() }));
vi.mock('firebase/firestore', () => ({
	doc: vi.fn(),
	collection: vi.fn(),
	serverTimestamp: vi.fn(),
	runTransaction: mocks.runTransaction,
	getDocFromServer: mocks.getDocFromServer
}));
import { initializeUser } from '../src/lib/seed/initialize';
const db = {} as Firestore;
const user = { uid: 'athlete', displayName: 'Athlete', email: 'athlete@example.test' };
beforeEach(() => vi.resetAllMocks());

it('reports unavailable services without starting another potentially stalled read', async () => {
	const error = Object.assign(new Error('Cloud Firestore API is disabled'), {
		code: 'unavailable'
	});
	mocks.runTransaction.mockRejectedValue(error);
	await expect(initializeUser(db, user, 'UTC')).rejects.toBe(error);
	expect(mocks.getDocFromServer).not.toHaveBeenCalled();
});

it('accepts a concurrent first-login winner only after server confirmation', async () => {
	mocks.runTransaction.mockRejectedValue({ code: 'permission-denied' });
	mocks.getDocFromServer.mockResolvedValue({ data: () => ({ seedVersion: 1 }) });
	await expect(initializeUser(db, user, 'UTC')).resolves.toBeUndefined();
});

it('preserves the initialization error when the race-recovery read fails', async () => {
	const error = Object.assign(new Error('Cloud Firestore API is disabled'), {
		code: 'permission-denied'
	});
	mocks.runTransaction.mockRejectedValue(error);
	mocks.getDocFromServer.mockRejectedValue(new Error('Client is offline'));
	await expect(initializeUser(db, user, 'UTC')).rejects.toBe(error);
});

it('rejects a failed seed without a server-confirmed winner', async () => {
	const error = { code: 'permission-denied' };
	mocks.runTransaction.mockRejectedValue(error);
	mocks.getDocFromServer.mockResolvedValue({ data: () => undefined });
	await expect(initializeUser(db, user, 'UTC')).rejects.toBe(error);
});
