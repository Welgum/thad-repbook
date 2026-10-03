import { test, expect } from '@playwright/test';

test('a blocked database shows a retry screen and recovers without duplicate starter workouts', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/login');
	await page.getByLabel('Test account email').fill(`startup-${Date.now()}@example.test`);
	await page.getByRole('button', { name: 'Continue with test account' }).click();
	await expect(page.getByRole('heading', { name: /Hey,/ })).toBeVisible();

	// Keep authentication available while Firestore requests cannot reach the database.
	await page.route('http://127.0.0.1:8080/**', (route) => route.abort());
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Let’s reconnect.' })).toBeVisible({
		timeout: 25_000
	});
	await expect(page.getByRole('alert')).not.toBeEmpty();
	await expect(page.getByText('Getting your training space ready…')).toHaveCount(0);

	await page.unroute('http://127.0.0.1:8080/**');
	await page.getByRole('button', { name: 'Retry safely' }).click();
	await expect(page.getByRole('heading', { name: /Hey,/ })).toBeVisible();
	await page.goto('/workouts');
	await expect(page.locator('.workout-card')).toHaveCount(5);
	expect(errors).toEqual([]);
});
