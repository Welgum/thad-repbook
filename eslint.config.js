import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
export default ts.config(
	{
		ignores: [
			'node_modules/**',
			'.svelte-kit/**',
			'.vercel/**',
			'build/**',
			'test-results/**',
			'playwright-report/**'
		]
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			],
			'svelte/no-navigation-without-resolve': 'off',
			'svelte/prefer-svelte-reactivity': 'off'
		}
	},
	{ files: ['**/*.svelte'], languageOptions: { parserOptions: { parser: ts.parser } } }
);
