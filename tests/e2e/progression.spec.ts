import { test, expect } from '@playwright/test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { makeSession, serializeSession, id } from '../../src/lib/domain/session';
import { dateInZone } from '../../src/lib/domain/time';
import { monthOf, shiftMonth } from '../../src/lib/analytics/progression';
import type { Exercise, Workout } from '../../src/lib/domain/types';

test('monthly progression ranks lifts, preserves exact activity dates, and renders above activity on mobile and desktop', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/login');
	await page.getByLabel('Test account email').fill(`progression-${Date.now()}@example.test`);
	await page.getByRole('button', { name: 'Continue with test account' }).click();
	await expect(page.getByRole('heading', { name: /Hey,/ })).toBeVisible();
	const uid = await page.evaluate(async () => {
		const path = '/src/lib/firebase/client.ts';
		const { firebase } = await import(/* @vite-ignore */ path);
		return firebase().auth.currentUser.uid as string;
	});
	const today = dateInZone(Date.now(), 'Europe/Warsaw');
	const month = shiftMonth(monthOf(today), -1),
		baseline = shiftMonth(month, -1);
	const environment = await initializeTestEnvironment({
		projectId: 'demo-repbook',
		firestore: { host: '127.0.0.1', port: 8080 }
	});
	try {
		await environment.withSecurityRulesDisabled(async (context) => {
			const db = context.firestore();
			const exercises = (await getDocs(collection(db, 'users', uid, 'exercises'))).docs.map(
				(d) => d.data() as Exercise
			);
			const workout = (await getDocs(collection(db, 'users', uid, 'workouts'))).docs
				.find((d) => d.id === 'seed-v1-monday-lower-shoulders')!
				.data() as Workout;
			for (const m of [baseline, month]) {
				for (const day of ['03', '10', '17', '24']) {
					const s = makeSession(workout, exercises, 'Europe/Warsaw', 'test', `${m}-${day}`);
					s.status = 'completed';
					s.finishedAt = s.startedAt;
					s.records = [0, 1].map((i) => ({
						id: id(),
						sessionExerciseId: s.exercises[i].id,
						sessionExerciseOrder: i,
						kind: 'strength',
						plannedUnitIndex: 0,
						isExtra: false,
						status: 'logged',
						reps: 8,
						weightKg: i === 0 ? (m === baseline ? 50 : 55) : m === baseline ? 20 : 18,
						loggedAtClient: s.startedAt,
						revision: 1,
						operationId: id(),
						deletedAt: null
					}));
					await setDoc(doc(db, 'users', uid, 'sessions', s.id), serializeSession(s));
					for (const record of s.records)
						await setDoc(doc(db, 'users', uid, 'sessions', s.id, 'records', record.id), record);
				}
			}
		});
	} finally {
		await environment.cleanup();
	}

	await page.reload();
	await expect(page.getByTestId('strength-index')).toContainText('99.5');
	await expect(page.getByTestId('fastest-exercise')).toContainText('Deadlift');
	await expect(page.getByTestId('fastest-exercise')).toContainText('+10.0%');
	expect((await page.getByTestId('strength-index').boundingBox())!.y).toBeLessThan(
		(await page.locator('.hero').boundingBox())!.y
	);
	await page.goto('/progress');
	await expect(page.getByTestId('strength-index')).toContainText('2 comparable exercises');
	await expect(page.getByLabel('Progress month')).toHaveValue(month);
	await expect(page.locator('.exercise-progression tbody tr')).toHaveCount(2);
	await expect(page.locator('.exercise-progression tbody tr').first()).toContainText('Deadlift');
	await expect(page.locator('.exercise-progression tbody tr').last()).toContainText('-10.0%');
	await page.getByRole('button', { name: 'Show chart data', exact: true }).click();
	await expect(
		page.getByRole('table').filter({ hasText: 'Monthly strength change' })
	).toContainText('-0.5%');
	expect((await page.getByTestId('strength-index').boundingBox())!.y).toBeLessThan(
		(await page.locator('.stats-grid').boundingBox())!.y
	);
	await page.screenshot({ path: 'test-results/progression-desktop.png', fullPage: true });
	for (const width of [360, 390, 430]) {
		await page.setViewportSize({ width, height: 844 });
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
	}
	await page.screenshot({ path: 'test-results/progression-mobile.png', fullPage: true });

	await page.getByRole('button', { name: 'Custom', exact: true }).click();
	await page.getByLabel('From', { exact: true }).fill(`${month}-15`);
	await page.getByLabel('Through', { exact: true }).fill(`${month}-28`);
	await expect(page.getByTestId('strength-index')).toContainText('99.5');
	await expect(
		page.locator('.stat-card').filter({ hasText: 'Included workouts' }).locator('.stat-value')
	).toHaveText('2');
	await page
		.getByRole('combobox', { name: 'Exercise', exact: true })
		.selectOption('seed-v1-deadlift');
	await expect(page.getByTestId('strength-index')).toContainText('110');
	await expect(page.getByTestId('strength-index')).toContainText('1 comparable exercise');
	await page.getByLabel('From', { exact: true }).fill('');
	await expect(page.getByRole('alert')).toContainText('Choose a valid date range');
	await expect(page.getByTestId('strength-index')).toHaveCount(0);
	await page.getByRole('button', { name: 'Last 12 weeks', exact: true }).click();
	await expect(page.getByTestId('strength-index')).toContainText('110');
	await page.getByLabel('Progress month').selectOption(monthOf(today));
	await expect(page.getByTestId('strength-index')).toContainText('Building a baseline');
	expect(errors).toEqual([]);
});
