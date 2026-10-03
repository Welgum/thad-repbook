import { test, expect } from '@playwright/test';

test('Monday counts all eleven strength sets and both neck rounds before finishing', async ({
	page
}) => {
	await page.goto('/login');
	await page.getByLabel('Test account email').fill(`completion-${Date.now()}@example.test`);
	await page.getByRole('button', { name: 'Continue with test account' }).click();
	await expect(page.getByRole('heading', { name: /Hey,/ })).toBeVisible();
	await page.getByRole('button', { name: 'Start workout', exact: true }).first().click();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: /Monday/ })
		.click();
	await expect(page.locator('.session-main')).toBeVisible();

	const exercises = [
		{ sets: 3, label: 'kg total' },
		{ sets: 2, label: 'kg on stack' },
		{ sets: 4, label: 'kg per dumbbell' },
		{ sets: 2, label: 'kg as logged' }
	];
	for (const [index, exercise] of exercises.entries()) {
		await page.locator('.exercise-switcher button').nth(index).click();
		await page.getByRole('textbox', { name: exercise.label, exact: true }).fill('10');
		for (let set = 0; set < exercise.sets; set++) {
			await page.getByRole('button', { name: 'Log set', exact: true }).click();
			await expect(page.locator('.record-row')).toHaveCount(set + 1);
		}
	}
	await expect(page.locator('.page-heading p')).toContainText('11/13 planned units');
	await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
	await expect(page.getByRole('dialog')).toContainText('11 of 13 planned units completed');
	await expect(page.getByRole('dialog')).toContainText('0 of 2 planned rounds completed');
	await expect(page.getByRole('dialog').getByRole('button', { name: /^Review / })).toHaveCount(1);
	await page.getByRole('button', { name: 'Review Neck Isometrics', exact: true }).click();
	for (const direction of ['Front', 'Back', 'Left', 'Right']) {
		await page
			.getByRole('textbox', { name: `${direction} (s)`, exact: true })
			.fill(direction === 'Left' ? '0' : '10');
	}
	for (let round = 0; round < 2; round++) {
		await page.getByRole('button', { name: 'Log round', exact: true }).click();
		await expect(page.locator('.record-row')).toHaveCount(round + 1);
	}
	await expect(page.locator('.page-heading p')).toContainText('11/13 planned units');
	await expect(
		page.getByRole('heading', { name: 'All entries saved; some work is incomplete.' })
	).toBeVisible();
	await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
	await expect(page.getByRole('dialog')).toContainText('0 of 2 planned rounds completed');
	await expect(page.getByRole('dialog')).toContainText('Front, Back, Left, Right');
	await page.getByRole('button', { name: 'Review Neck Isometrics', exact: true }).click();
	for (let round = 0; round < 2; round++) {
		await page
			.locator('.record-row')
			.nth(round)
			.getByRole('button', { name: 'Edit set', exact: true })
			.click();
		await page
			.getByRole('dialog')
			.getByRole('textbox', { name: 'Left (s)', exact: true })
			.fill('10');
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Save changes', exact: true })
			.click();
		await expect(page.getByRole('dialog')).toHaveCount(0);
	}
	await expect(page.locator('.page-heading p')).toContainText('13/13 planned units');
	await expect(page.getByRole('status').filter({ hasText: 'Synced' })).toBeVisible();
	await page.reload();
	await expect(page.locator('.page-heading p')).toContainText('13/13 planned units');
	await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
	await expect(page.getByRole('dialog')).toContainText('13 of 13 planned units completed');
	await expect(page.getByRole('dialog')).not.toContainText('partial workout');
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Finish workout', exact: true })
		.click();
	await expect(page).toHaveURL(/\/history\//);
	await expect(page.locator('.page-heading p')).toContainText('13/13 planned units');
});
