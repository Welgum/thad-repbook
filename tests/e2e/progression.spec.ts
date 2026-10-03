import { test, expect } from '@playwright/test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { makeSession, serializeSession, id } from '../../src/lib/domain/session';
import { dateInZone, shiftDate, weekOf } from '../../src/lib/domain/time';
import type { Exercise, Workout } from '../../src/lib/domain/types';

test('rep-aware weekly progression ranks lifts and keeps paired charts correct on mobile and desktop', async ({
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
	const week = shiftDate(weekOf(today), -7),
		baseline = shiftDate(week, -7);
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
			for (const period of [baseline, week]) {
				for (const offset of [0, 2, 4, 6]) {
					const s = makeSession(
						workout,
						exercises,
						'Europe/Warsaw',
						'test',
						shiftDate(period, offset)
					);
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
						reps: i === 0 ? (period === baseline ? 8 : 12) : period === baseline ? 10 : 3,
						weightKg: i === 0 ? 50 : period === baseline ? 20 : 22,
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
	await expect(page.getByTestId('strength-index')).toContainText('100.2');
	await expect(page.getByTestId('fastest-exercise')).toContainText('Deadlift');
	await expect(page.getByTestId('fastest-exercise')).toContainText('+10.5%');
	expect((await page.getByTestId('strength-index').boundingBox())!.y).toBeLessThan(
		(await page.locator('.hero').boundingBox())!.y
	);
	await page.goto('/progress');
	await expect(page.getByTestId('strength-index')).toContainText('2 comparable exercises');
	await expect(page.getByTestId('strength-index')).toContainText('100 = previous week');
	await expect(
		page.getByRole('columnheader', { name: 'Weekly change', exact: true })
	).toBeVisible();
	await expect(page.getByLabel('Progress week')).toHaveValue(week);
	await expect(page.locator('.exercise-progression tbody tr')).toHaveCount(2);
	await expect(page.locator('.exercise-progression tbody tr').first()).toContainText('Deadlift');
	await expect(page.locator('.exercise-progression tbody tr').last()).toContainText('-9.2%');
	await expect(page.locator('.exercise-progression tbody tr').first()).toContainText(
		'50 kg × 12 reps'
	);
	await expect(page.locator('.exercise-progression tbody tr').last()).toContainText(
		'22 kg × 3 reps'
	);
	await page.getByRole('button', { name: 'Show chart data', exact: true }).click();
	await expect(page.getByRole('table').filter({ hasText: 'Weekly strength change' })).toContainText(
		'0.2%'
	);
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
	await page.getByLabel('From', { exact: true }).fill(shiftDate(week, 3));
	await page.getByLabel('Through', { exact: true }).fill(shiftDate(week, 6));
	await expect(page.getByTestId('strength-index')).toContainText('100.2');
	await expect(
		page.locator('.stat-card').filter({ hasText: 'Included workouts' }).locator('.stat-value')
	).toHaveText('2');
	await page
		.getByRole('combobox', { name: 'Exercise', exact: true })
		.selectOption('seed-v1-deadlift');
	await expect(page.getByTestId('strength-index')).toContainText('110.5');
	await expect(page.getByTestId('strength-index')).toContainText('1 comparable exercise');
	await page.getByLabel('From', { exact: true }).fill('');
	await expect(page.getByRole('alert')).toContainText('Choose a valid date range');
	await expect(page.getByTestId('strength-index')).toHaveCount(0);
	await page.getByRole('button', { name: 'Last 12 weeks', exact: true }).click();
	await expect(page.getByTestId('strength-index')).toContainText('110.5');
	const chart = page.getByTestId('session-chart');
	await expect(chart.getByRole('heading')).toHaveText('Your weight & reps');
	await expect(chart.locator('.chart-column')).toHaveCount(8);
	await expect(chart.locator('.chart-column').nth(4)).toHaveClass(/trend-increase/);
	await expect(chart.getByRole('columnheader', { name: 'Completed reps' })).toBeVisible();
	await chart.getByRole('button', { name: 'Reps', exact: true }).click();
	await expect(chart.getByRole('button', { name: 'Reps', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(chart.locator('.chart-column').first().locator('.trend-value')).toHaveText('8');
	await expect(chart.locator('.chart-column').nth(4).locator('.trend-value')).toHaveText('↗ 12');
	await expect(chart.locator('.chart-column').nth(4)).toContainText('50 kg');
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.screenshot({ path: 'test-results/rep-progression-desktop.png', fullPage: true });
	for (const width of [360, 390, 430]) {
		await page.setViewportSize({ width, height: 844 });
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
	}
	await chart.screenshot({ path: 'test-results/rep-progression-mobile.png' });
	await chart.getByRole('button', { name: 'Weight', exact: true }).click();
	await expect(chart.locator('.chart-column').nth(4).locator('.trend-value')).toHaveText('↗ 50');
	await chart.getByRole('button', { name: 'Strength estimate', exact: true }).click();
	await expect(chart.locator('.chart-column').nth(4).locator('.trend-value')).toHaveText('↗ 70');
	// More kg with substantially fewer reps is lower estimated strength, even in the weight view.
	await page
		.getByRole('combobox', { name: 'Exercise', exact: true })
		.selectOption('seed-v1-leg-curl');
	await expect(page.getByTestId('strength-index')).toContainText('90.8');
	await chart.getByRole('button', { name: 'Weight', exact: true }).click();
	await expect(chart.locator('.chart-column').nth(4)).toHaveClass(/trend-decrease/);
	await expect(chart.locator('.chart-column').nth(4).locator('.trend-value')).toHaveText('↘ 22');
	await expect(chart.locator('.chart-column').nth(4)).toContainText('3 reps');
	await page.getByLabel('Progress week').selectOption(weekOf(today));
	await expect(page.getByTestId('strength-index')).toContainText('Building a baseline');
	expect(errors).toEqual([]);
});
