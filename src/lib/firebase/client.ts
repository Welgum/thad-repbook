import { browser, dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import {
	initializeFirestore,
	memoryLocalCache,
	connectFirestoreEmulator,
	type Firestore
} from 'firebase/firestore';
let database: Firestore | undefined;
let authentication: Auth | undefined;
export const emulatorEnabled = () => dev && env.PUBLIC_USE_EMULATORS === 'true';
export const configured = () =>
	emulatorEnabled() ||
	Boolean(
		env.PUBLIC_FIREBASE_API_KEY &&
		env.PUBLIC_FIREBASE_PROJECT_ID &&
		env.PUBLIC_FIREBASE_AUTH_DOMAIN &&
		env.PUBLIC_FIREBASE_APP_ID
	);
export function firebase() {
	if (!browser) throw new Error('Firebase is only available in the browser.');
	if (!configured())
		throw new Error('Firebase is not configured. Follow README.md to connect your project.');
	if (!database || !authentication) {
		const local = emulatorEnabled();
		const app =
			getApps()[0] ||
			initializeApp({
				apiKey: local ? 'demo-key' : env.PUBLIC_FIREBASE_API_KEY,
				authDomain: local ? 'demo-repbook.firebaseapp.com' : env.PUBLIC_FIREBASE_AUTH_DOMAIN,
				projectId: local ? 'demo-repbook' : env.PUBLIC_FIREBASE_PROJECT_ID,
				appId: local ? 'demo-repbook-app' : env.PUBLIC_FIREBASE_APP_ID
			});
		authentication = getAuth(app);
		database = initializeFirestore(app, { localCache: memoryLocalCache() });
		if (local) {
			connectAuthEmulator(authentication, 'http://127.0.0.1:9099', { disableWarnings: true });
			connectFirestoreEmulator(database, '127.0.0.1', 8080);
		}
	}
	return { db: database, auth: authentication };
}
