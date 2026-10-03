import { test, expect, type Page } from '@playwright/test';
async function login(page: Page) {
	await page.goto('/login');
	await page
		.getByLabel('Test account email')
		.fill(`athlete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`);
	await page.getByRole('button', { name: 'Continue with test account' }).click();
	await expect(page.getByRole('heading', { name: /Hey,/ })).toBeVisible();
}
async function start(page: Page) {
	await page.getByRole('button', { name: 'Start workout', exact: true }).first().click();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: /Monday/ })
		.click();
	await expect(page.getByRole('heading', { name: 'Deadlift', exact: true })).toBeVisible();
}
async function noOverflow(page: Page) {
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
}
test('Start → log → rest → undo → offline recovery → finish → calendar → exclude/restore', async ({
	page,
	context
}) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.setViewportSize({ width: 390, height: 844 });
	await login(page);
	await noOverflow(page);
	await page.screenshot({ path: 'test-results/home-mobile.png', fullPage: true });
	await start(page);
	for (const width of [360, 390, 430]) {
		await page.setViewportSize({ width, height: 844 });
		await noOverflow(page);
	}
	await page.getByRole('button', { name: 'Log set', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('Enter a number');
	await expect(page.getByLabel('Rest timer')).toHaveCount(0);
	await page.getByRole('textbox', { name: 'kg total', exact: true }).fill('50,5');
	await page.getByRole('button', { name: 'Log set', exact: true }).dblclick();
	await expect(page.locator('.record-row')).toHaveCount(1);
	await expect(page.getByLabel('Rest timer').filter({ visible: true })).toBeVisible();
	await expect(page.getByRole('status').filter({ hasText: 'Synced' })).toBeVisible();
	await page.getByRole('button', { name: 'Delete set', exact: true }).click();
	await expect(page.locator('.record-row')).toHaveCount(0);
	await expect(page.getByLabel('Rest timer')).toHaveCount(0);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.locator('.record-row')).toHaveCount(1);
	await context.setOffline(true);
	await page.getByRole('button', { name: 'Log set', exact: true }).click();
	await expect(page.locator('.record-row')).toHaveCount(2);
	await expect(page.getByRole('status').filter({ hasText: 'Saved locally' })).toBeVisible();
	await context.setOffline(false);
	await expect(page.getByRole('status').filter({ hasText: 'Synced' })).toBeVisible();
	await page.reload();
	await expect(page.locator('.record-row')).toHaveCount(2);
	await page.screenshot({ path: 'test-results/session-mobile.png', fullPage: true });
	await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Finish workout', exact: true })
		.click();
	await expect(page).toHaveURL(/\/history\//);
	await expect(page.getByRole('status').filter({ hasText: 'Synced' })).toBeVisible();
	await page.getByRole('button', { name: 'Exclude this workout session', exact: true }).click();
	await expect(page.getByText('Excluded from stats: Session excluded')).toBeVisible();
	await page.getByRole('button', { name: 'Include in statistics', exact: true }).click();
	await expect(page.getByText('Excluded from stats: Session excluded')).toHaveCount(0);
	await page.getByRole('link', { name: 'Calendar', exact: true }).first().click();
	await expect(page.locator('.calendar-day')).toHaveCount(42);
	await expect(page.locator('.session-card')).toHaveCount(1);
	await noOverflow(page);
	await page.screenshot({ path: 'test-results/calendar-mobile.png', fullPage: true });
	expect(errors).toEqual([]);
});
test('import preview, shared exercise mapping, idempotent retry, settings and desktop routes', async ({
	page
}) => {
	await login(page);
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
	await page.goto('/import');
	await page.getByLabel('Choose a JSON file').setInputFiles('static/workouts.example.json');
	await expect(page.getByRole('heading', { name: 'Here’s what’s coming in.' })).toBeVisible();
	await page
		.getByRole('combobox', { name: 'Deadlift', exact: true })
		.selectOption({ label: 'Use existing: Deadlift' });
	await page.getByLabel('Import as copies. Keep existing programs.').check();
	await page.getByRole('button', { name: 'Import workouts', exact: true }).click();
	await expect(page.getByRole('heading', { name: '5 workouts, ready to go.' })).toBeVisible();
	await page.goto('/import');
	await page.getByLabel('Choose a JSON file').setInputFiles('static/workouts.example.json');
	await page.getByLabel('Import as copies. Keep existing programs.').check();
	await page.getByRole('button', { name: 'Import workouts', exact: true }).click();
	await expect(page.getByRole('heading', { name: '5 workouts, ready to go.' })).toBeVisible();
	await page.goto('/workouts');
	await expect(page.locator('.workout-card')).toHaveCount(10);
	for (const route of [
		'/calendar',
		'/progress',
		'/history',
		'/settings',
		'/workouts/new',
		'/import-format'
	]) {
		await page.goto(route);
		await expect(page.locator('h1')).toBeVisible();
		await noOverflow(page);
	}
	await page.goto('/import-format');
	const schema = await page.request.get('/workouts.schema.json');
	expect(schema.ok()).toBe(true);
	expect((await schema.json()).additionalProperties).toBe(false);
});
