import { test, expect } from '@playwright/test';

test('admin invites empty state says "No pending invites."', async ({ page }) => {
  await page.goto('/');

  // Create a game to get into Admin tab
  const gameInput = page.getByPlaceholder('Campaign name…');
  await expect(gameInput).toBeVisible();
  await gameInput.fill('Admin Test Game');
  await page.getByRole('button', { name: 'Create' }).click();

  // Go to Admin tab
  await page.locator('nav').getByRole('button', { name: /Admin/ }).click();

  // Check invites section
  const invitesSection = page.locator('text=Invite links').locator('..');
  await expect(invitesSection).toBeVisible();

  // Assert "No pending invites." is visible
  await expect(page.getByText('No pending invites.')).toBeVisible();

  // Assert old text "No invites yet." is NOT visible
  await expect(page.getByText('No invites yet.')).toHaveCount(0);
});
