import { defineConfig } from '@playwright/test';
export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: false,
	workers: 1,
	timeout: 60000,
	expect: { timeout: 15000 },
	use: {
		baseURL: 'http://127.0.0.1:5173',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer: {
		command: 'npm run dev -- --port 5173',
		url: 'http://127.0.0.1:5173',
		reuseExistingServer: !process.env.CI,
		env: { PUBLIC_USE_EMULATORS: 'true' },
		timeout: 60000
	}
});
