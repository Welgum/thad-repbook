import { defineConfig } from 'vitest/config';
export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		exclude: ['tests/**/*.emulator.test.ts'],
		environment: 'node'
	}
});
