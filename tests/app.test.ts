import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { User } from 'firebase/auth';

const mocks = vi.hoisted(() => ({
	firebase: vi.fn(),
	onAuthStateChanged: vi.fn(),
	onSnapshot: vi.fn(),
	initializeUser: vi.fn(),
	setDraftUser: vi.fn()
}));
vi.mock('../src/lib/firebase/client', () => ({
	configured: () => true,
	emulatorEnabled: () => false,
	firebase: mocks.firebase
}));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: mocks.onAuthStateChanged }));
vi.mock('firebase/firestore', () => ({ onSnapshot: mocks.onSnapshot }));
vi.mock('../src/lib/repositories/data', () => ({
	initializeUser: mocks.initializeUser,
	userRef: (_db: unknown, uid: string) => `users/${uid}`,
	userCollection: (_db: unknown, uid: string, name: string) => `users/${uid}/${name}`
}));
vi.mock('../src/lib/repositories/sessions', () => ({
	setDraftUser: mocks.setDraftUser,
	retryAll: vi.fn()
}));

import { app, initializeAppState } from '../src/lib/repositories/app';

type Snapshot = {
	exists: () => boolean;
	data: () => object;
	docs: { id: string; data: () => object }[];
};
const user = { uid: 'athlete' } as User;
const snapshot: Snapshot = {
	exists: () => true,
	data: () => ({ displayName: 'Athlete', seedVersion: 1 }),
	docs: []
};
let authChanged: (user: User | null) => Promise<void>;
let authFailed: (error: Error) => void;
let listeners: {
	next: (snapshot: Snapshot) => void;
	fail: (error: Error) => void;
	stop: ReturnType<typeof vi.fn>;
}[];
let stopAuth: ReturnType<typeof vi.fn>;
let cleanup: (() => void) | undefined;

beforeEach(() => {
	vi.useFakeTimers();
	vi.resetAllMocks();
	vi.stubGlobal('window', new EventTarget());
	vi.stubGlobal('navigator', { onLine: true });
	listeners = [];
	stopAuth = vi.fn();
	mocks.firebase.mockReturnValue({ auth: {}, db: {} });
	mocks.initializeUser.mockResolvedValue(undefined);
	mocks.onAuthStateChanged.mockImplementation((_auth, next, fail) => {
		authChanged = next;
		authFailed = fail;
		return stopAuth;
	});
	mocks.onSnapshot.mockImplementation((_ref, next, fail) => {
		const stop = vi.fn();
		listeners.push({ next, fail, stop });
		return stop;
	});
});

afterEach(() => {
	cleanup?.();
	cleanup = undefined;
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('training space startup', () => {
	it('shows Firebase setup errors instead of leaving the loading screen', () => {
		mocks.firebase.mockImplementation(() => {
			throw new Error('Firebase configuration failed');
		});
		cleanup = initializeAppState();
		expect(get(app)).toMatchObject({ phase: 'error', error: 'Firebase configuration failed' });
		expect(vi.getTimerCount()).toBe(0);
	});

	it('times out if the initial authentication state never arrives', () => {
		cleanup = initializeAppState();
		vi.advanceTimersByTime(20_000);
		expect(get(app).phase).toBe('error');
		expect(get(app).error).toContain('taking too long');
	});

	it('surfaces authentication observer errors', () => {
		cleanup = initializeAppState();
		authFailed(new Error('Authentication unavailable'));
		expect(get(app)).toMatchObject({ phase: 'error', error: 'Authentication unavailable' });
		expect(vi.getTimerCount()).toBe(0);
	});

	it('stops waiting for a stalled initializer and ignores its late completion', async () => {
		let resolve!: () => void;
		mocks.initializeUser.mockReturnValue(new Promise<void>((done) => (resolve = done)));
		cleanup = initializeAppState();
		const pending = authChanged(user);
		vi.advanceTimersByTime(20_000);
		expect(get(app).phase).toBe('error');
		resolve();
		await pending;
		expect(mocks.onSnapshot).not.toHaveBeenCalled();
		expect(get(app).phase).toBe('error');
	});

	it('shows the original initialization failure', async () => {
		mocks.initializeUser.mockRejectedValue(new Error('Cloud Firestore API is disabled'));
		cleanup = initializeAppState();
		await authChanged(user);
		expect(get(app)).toMatchObject({ phase: 'error', error: 'Cloud Firestore API is disabled' });
		expect(vi.getTimerCount()).toBe(0);
	});

	it('waits for all three data subscriptions and clears the deadline when ready', async () => {
		cleanup = initializeAppState();
		await authChanged(user);
		listeners[0].next(snapshot);
		listeners[1].next(snapshot);
		expect(get(app).phase).toBe('loading');
		listeners[2].next(snapshot);
		expect(get(app).phase).toBe('ready');
		expect(vi.getTimerCount()).toBe(0);
		vi.advanceTimersByTime(30_000);
		expect(get(app).phase).toBe('ready');
	});

	it('times out a missing data subscription and ignores late snapshots', async () => {
		cleanup = initializeAppState();
		await authChanged(user);
		listeners[0].next(snapshot);
		listeners[1].next(snapshot);
		vi.advanceTimersByTime(20_000);
		expect(get(app).phase).toBe('error');
		for (const listener of listeners) {
			expect(listener.stop).toHaveBeenCalledOnce();
			listener.next(snapshot);
		}
		expect(get(app).phase).toBe('error');
	});

	it('does not let later successful snapshots hide a subscription failure', async () => {
		cleanup = initializeAppState();
		await authChanged(user);
		listeners.forEach((listener) => listener.next(snapshot));
		listeners[0].fail(new Error('Access denied'));
		listeners[1].next(snapshot);
		expect(get(app)).toMatchObject({ phase: 'error', error: 'Access denied' });
		listeners.forEach((listener) => expect(listener.stop).toHaveBeenCalledOnce());
	});

	it('rejects a missing profile instead of opening an unusable training space', async () => {
		cleanup = initializeAppState();
		await authChanged(user);
		listeners[0].next({ ...snapshot, exists: () => false });
		listeners.slice(1).forEach((listener) => listener.next(snapshot));
		expect(get(app).phase).toBe('error');
		expect(get(app).error).toContain('profile could not be loaded');
	});

	it('ignores old account callbacks after sign-out', async () => {
		cleanup = initializeAppState();
		await authChanged(user);
		await authChanged(null);
		listeners.forEach((listener) => listener.next(snapshot));
		expect(get(app)).toMatchObject({ phase: 'signed-out', user: null, profile: null });
		expect(vi.getTimerCount()).toBe(0);
	});

	it('cancels pending startup when the layout is destroyed', async () => {
		let resolve!: () => void;
		mocks.initializeUser.mockReturnValue(new Promise<void>((done) => (resolve = done)));
		cleanup = initializeAppState();
		const pending = authChanged(user);
		cleanup();
		cleanup = undefined;
		resolve();
		await pending;
		expect(mocks.onSnapshot).not.toHaveBeenCalled();
		expect(stopAuth).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});
});
