import { test, expect } from '@playwright/test';

test('half-rep failure markers survive offline sync, reset between sets, and update statistics after editing', async ({
	page
}) => {
	await page.goto('/login');
	await page.getByLabel('Test account email').fill(`failure-${Date.now()}@example.test`);
	await page.getByRole('button', { name: 'Continue with test account' }).click();
	await expect(page.getByRole('heading', { name: /Hey,/ })).toBeVisible();
	await page.getByRole('button', { name: 'Start workout', exact: true }).first().click();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: /Monday/ })
		.click();
	await page.getByRole('textbox', { name: 'Reps', exact: true }).fill('8');
	await page.getByRole('textbox', { name: 'kg total', exact: true }).fill('50');
	const failure = page.getByRole('checkbox', {
		name: 'Muscle failure on final rep (+0.5)',
		exact: true
	});
	await failure.check();
	await page.context().setOffline(true);
	await page.getByRole('button', { name: 'Log set', exact: true }).click();
	await expect(page.locator('.record-row')).toContainText('8.5 reps');
	await expect(page.getByRole('status').filter({ hasText: 'Saved locally' })).toBeVisible();
	await expect(failure).not.toBeChecked();
	await page.context().setOffline(false);
	await expect(page.getByRole('status').filter({ hasText: 'Synced' })).toBeVisible();
	await page.reload();
	await expect(page.locator('.record-row')).toContainText('8 full + 0.5 final failed rep');
	await expect(failure).not.toBeChecked();
	await page.getByRole('button', { name: 'Log set', exact: true }).click();
	await expect(page.locator('.record-row')).toHaveCount(2);
	await expect(page.locator('.record-row').nth(1)).toContainText('8 reps');

	// A final planned entry unmounts the form; its marker must not leak into extras.
	await failure.check();
	await page.getByRole('button', { name: 'Log set', exact: true }).click();
	await expect(page.locator('.record-row')).toHaveCount(3);
	await page.getByRole('button', { name: 'Add set (extra)', exact: true }).click();
	await expect(failure).not.toBeChecked();
	await page.getByRole('button', { name: 'Cancel extra', exact: true }).click();
	await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Finish workout', exact: true })
		.click();
	await expect(page).toHaveURL(/\/history\//);
	await expect(page.getByRole('status').filter({ hasText: 'Synced' })).toBeVisible();
	const historyUrl = page.url();
	await page.goto('/progress/exercises/seed-v1-deadlift');
	await expect(
		page.locator('.stat-card').filter({ hasText: 'Final-rep failures' }).locator('.stat-value')
	).toHaveText('2');
	await page.locator('details summary').click();
	await expect(page.locator('details')).toContainText('25 total reps');
	await expect(page.locator('details')).toContainText('1250 kg·reps');
	await page.getByLabel('Best reps at selected kg total').fill('50');
	await expect(page.locator('details')).toContainText('kg total: 8.5');

	await page.goto(historyUrl);
	await page
		.locator('.record-row')
		.first()
		.getByRole('button', { name: 'Edit set', exact: true })
		.click();
	await expect(
		page
			.getByRole('dialog')
			.getByRole('checkbox', { name: 'Muscle failure on final rep (+0.5)', exact: true })
	).toBeChecked();
	await page
		.getByRole('dialog')
		.getByRole('checkbox', { name: 'Muscle failure on final rep (+0.5)', exact: true })
		.uncheck();
	await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.getByRole('status').filter({ hasText: 'Synced' })).toBeVisible();
	await page.reload();
	await expect(page.locator('.record-row').first()).toContainText('8 reps');
	await expect(page.locator('.record-row').first()).not.toContainText('final failed rep');
	await page.goto('/progress/exercises/seed-v1-deadlift');
	await expect(
		page.locator('.stat-card').filter({ hasText: 'Final-rep failures' }).locator('.stat-value')
	).toHaveText('1');
	await page.locator('details summary').click();
	await expect(page.locator('details')).toContainText('24.5 total reps');
	await expect(page.locator('details')).toContainText('1225 kg·reps');
});
