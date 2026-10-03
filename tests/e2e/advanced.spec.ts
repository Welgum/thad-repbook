import { test, expect, type Page } from '@playwright/test';
async function login(
	page: Page,
	email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`
) {
	await page.goto('/login');
	await expect(page.getByRole('button', { name: 'Continue with test account' })).toBeEnabled();
	await page.getByLabel('Test account email').fill(email);
	await page.getByRole('button', { name: 'Continue with test account' }).click();
	await expect(page.getByRole('heading', { name: /Hey,/ })).toBeVisible();
	return email;
}
async function synced(page: Page) {
	await expect(page.getByRole('status').filter({ hasText: 'Synced' })).toBeVisible();
}
async function start(page: Page, name = 'Monday') {
	await page.goto('/');
	await page.getByRole('button', { name: 'Start workout', exact: true }).first().click();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: new RegExp(name) })
		.click();
	await expect(page.locator('.session-main')).toBeVisible();
}
async function finish(page: Page) {
	await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Finish workout', exact: true })
		.click();
	await expect(page).toHaveURL(/\/history\//);
	await synced(page);
}
test('signed bodyweight, isolated exercise statistics, isometrics and past duration', async ({
	page
}) => {
	await login(page);
	await start(page, 'Wednesday');
	await page.getByRole('button', { name: 'Log set', exact: true }).click();
	await synced(page);
	await expect(page.locator('.record-row')).toContainText('0 kg adjustment');
	await page.getByRole('button', { name: 'Added weight', exact: true }).click();
	await page.getByRole('textbox', { name: 'Added weight (kg)', exact: true }).fill('10');
	await page.getByRole('button', { name: 'Log set', exact: true }).click();
	await synced(page);
	await page.getByRole('button', { name: 'Assistance', exact: true }).click();
	await page.getByRole('textbox', { name: 'Assistance (kg)', exact: true }).fill('20');
	await page.getByRole('button', { name: 'Log set', exact: true }).click();
	await synced(page);
	await expect(page.locator('.record-row').last()).toContainText('-20 kg adjustment');
	await finish(page);
	await page.goto('/progress/exercises/seed-v1-pull-up');
	await expect(page.getByRole('heading', { name: 'Pull-up', exact: true })).toBeVisible();
	await expect(page.locator('.chart-column')).toHaveCount(1);
	await page.getByRole('button', { name: 'Assistance', exact: true }).click();
	await expect(page.locator('.chart-column')).toContainText('10');
	await start(page);
	await page.getByRole('button', { name: /Neck Isometrics 2 rounds/ }).click();
	await page.getByRole('textbox', { name: 'Left (s)', exact: true }).fill('0');
	await page.getByRole('button', { name: 'Log round', exact: true }).click();
	await synced(page);
	await expect(page.locator('.page-heading p')).toContainText('0/13');
	await page.getByRole('textbox', { name: 'Left (s)', exact: true }).fill('8');
	await page.getByRole('button', { name: 'Log round', exact: true }).click();
	await synced(page);
	await expect(page.locator('.page-heading p')).toContainText('1/13');
	await finish(page);
	await page.goto('/history');
	await page.getByRole('button', { name: 'Add past workout' }).click();
	await page.getByRole('dialog').getByLabel('Workout date').fill('2026-01-10');
	await page
		.getByRole('dialog')
		.getByRole('button', { name: /Monday/ })
		.click();
	await page.getByRole('textbox', { name: 'kg total', exact: true }).fill('60');
	await page.getByRole('button', { name: 'Log set', exact: true }).click();
	await synced(page);
	await expect(page.getByLabel('Rest timer')).toHaveCount(0);
	await finish(page);
	await expect(page.getByLabel('Duration (minutes)')).toHaveValue('');
	await expect(page.locator('.page-heading p')).toContainText('Jan 10, 2026');
});
test('workout edits preserve a session snapshot and previous results become suggestions', async ({
	page
}) => {
	await login(page);
	await start(page);
	await page.getByRole('textbox', { name: 'kg total', exact: true }).fill('70');
	await page.getByRole('button', { name: 'Log set', exact: true }).click();
	await finish(page);
	const old = page.url();
	await page.goto('/workouts/seed-v1-monday-lower-shoulders');
	await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
	await page.getByLabel('Workout name').fill('My edited program');
	await page.getByRole('button', { name: 'Save workout', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'My edited program', exact: true })).toBeVisible();
	await expect(page.getByLabel('Workout name')).toHaveCount(0);
	await page.goto(old);
	await expect(page.locator('h1')).toHaveText('Monday — Lower Body & Shoulders');
	await start(page, 'My edited program');
	await expect(page.getByRole('textbox', { name: 'kg total', exact: true })).toHaveValue('70');
	await expect(page.locator('.record-row')).toHaveCount(0);
});
test('offline conflict preserves local work and explicit takeover resolves it', async ({
	page,
	browser
}) => {
	const email = await login(page);
	await start(page);
	await page.getByRole('textbox', { name: 'kg total', exact: true }).fill('50');
	await page.getByRole('button', { name: 'Log set', exact: true }).click();
	await synced(page);
	const url = page.url();
	await page.context().setOffline(true);
	await page.getByRole('textbox', { name: 'kg total', exact: true }).fill('55');
	await page.getByRole('button', { name: 'Log set', exact: true }).click();
	await expect(page.locator('.record-row')).toHaveCount(2);
	const other = await browser.newContext();
	const second = await other.newPage();
	await login(second, email);
	await second.goto(url);
	await second.getByRole('button', { name: 'Take over editing' }).click();
	await expect(second.getByRole('button', { name: 'Log set', exact: true })).toBeVisible();
	await second.getByRole('textbox', { name: 'kg total', exact: true }).fill('60');
	await second.getByRole('button', { name: 'Log set', exact: true }).click();
	await synced(second);
	await page.context().setOffline(false);
	await expect(
		page.getByRole('heading', { name: 'Two versions need your attention.' })
	).toBeVisible();
	await expect(page.locator('.record-row').last()).toContainText('55 kg');
	await page.getByRole('button', { name: 'Keep this device’s version' }).click();
	await synced(page);
	await expect(page.locator('.record-row')).toHaveCount(2);
	await page.reload();
	await expect(page.locator('.record-row').last()).toContainText('55 kg');
	await other.close();
});

test('duration and no-load programs import, log without rest, and accounts remain isolated', async ({
	page
}) => {
	await login(page);
	await page.goto('/import');
	const bundle = {
		schemaVersion: 1,
		units: 'kg',
		exercises: [
			{
				key: 'easy-run',
				name: 'Easy Run',
				kind: 'duration',
				loadMode: 'none',
				weightConvention: 'none'
			},
			{
				key: 'no-load',
				name: 'Unloaded movement',
				kind: 'strength',
				loadMode: 'none',
				weightConvention: 'none'
			}
		],
		workouts: [
			{
				key: 'mixed',
				name: 'A short session',
				items: [
					{
						itemKey: 'run',
						exerciseKey: 'easy-run',
						target: { durationSeconds: 60 },
						restSeconds: 0
					},
					{
						itemKey: 'movement',
						exerciseKey: 'no-load',
						target: { sets: 1, repsMin: 3, repsMax: 5 },
						restSeconds: 0
					}
				]
			}
		]
	};
	await page.getByLabel('Or paste your JSON').fill(JSON.stringify(bundle));
	await page.getByRole('button', { name: 'Validate & preview' }).click();
	await page.getByRole('button', { name: 'Import workouts', exact: true }).click();
	await expect(page.getByRole('heading', { name: '1 workout, ready to go.' })).toBeVisible();
	await start(page, 'A short session');
	await page.getByRole('textbox', { name: 'Duration (seconds)', exact: true }).fill('45');
	await page.getByRole('textbox', { name: 'Distance (km, optional)', exact: true }).fill('0,2');
	await page.getByRole('button', { name: 'Log activity', exact: true }).click();
	await synced(page);
	await expect(page.locator('.record-row')).toContainText('45s · 0.2 km');
	await expect(page.getByLabel('Rest timer')).toHaveCount(0);
	await page.getByRole('button', { name: /Unloaded movement 1 ×/ }).click();
	await page.getByRole('button', { name: 'Log set', exact: true }).click();
	await synced(page);
	await expect(page.locator('.record-row')).toContainText('5 reps');
	await finish(page);
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Sign out', exact: true }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect(page).toHaveURL(/\/login/);
	await login(page);
	await expect(page.locator('.stat-card').first().locator('.stat-value')).toHaveText('0');
	await page.goto('/workouts');
	await expect(page.locator('.workout-card')).toHaveCount(5);
});
