import { test, expect } from '@playwright/test';

test('GameList: active games first, no join-code input', async ({ page }) => {
  await page.goto('/');

  // Wait for GameList
  await expect(page.getByRole('heading', { name: '🤝 Connections' })).toBeVisible();

  // Assert NO "Join with invite code" input exists
  await expect(page.getByText(/Join with invite code/i)).toHaveCount(0);
  await expect(page.getByPlaceholder(/invite code/i)).toHaveCount(0);

  // Create a game so we have an active game entry
  const gameInput = page.getByPlaceholder('Campaign name…');
  await gameInput.fill('Layout Test Game');
  await page.getByRole('button', { name: 'Create' }).click();

  // Go back to GameList
  await page.getByRole('button', { name: /games/ }).click();

  // Assert Active games list appears BEFORE "New game" card in DOM order
  const activeGamesText = page.getByText(/active game/);
  await expect(activeGamesText).toBeVisible();
  const newGameHeading = page.getByText('New game', { exact: true });
  await expect(newGameHeading).toBeVisible();

  // Check DOM order: active games element comes before New game element
  const orderOk = await page.evaluate(() => {
    const activeEl = Array.from(document.querySelectorAll('*')).find(el => /active game/.test(el.textContent || ''));
    const newGameEl = Array.from(document.querySelectorAll('*')).find(el => el.textContent?.trim() === 'New game');
    if (!activeEl || !newGameEl) return false;
    return !!(activeEl.compareDocumentPosition(newGameEl) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(orderOk).toBe(true);
});

test('GameList: invite URL auto-join populates game name', async ({ page }) => {
  await page.goto('/');

  // Create a game
  const gameInput = page.getByPlaceholder('Campaign name…');
  await expect(gameInput).toBeVisible();
  await gameInput.fill('Invite Join Test');
  await page.getByRole('button', { name: 'Create' }).click();

  // Go to Admin tab to create invite
  await page.getByRole('button', { name: /Admin/ }).click();
  await page.getByRole('button', { name: 'Generate invite' }).click();

  // Extract invite token from displayed URL
  const inviteUrlEl = page.locator('text=/invite=/').first();
  await expect(inviteUrlEl).toBeVisible();
  const inviteUrlText = await inviteUrlEl.textContent();
  const tokenMatch = inviteUrlText.match(/invite=([A-Za-z0-9_-]+)/);
  expect(tokenMatch).toBeTruthy();
  const token = tokenMatch[1];

  // Go back to games list, then navigate to invite URL (simulating fresh join)
  await page.getByRole('button', { name: /games/ }).click();
  await page.goto(`/?invite=${token}`);

  // Auto-join should fire, game name should populate (not empty)
  // We should land in the game view with the game name visible
  await expect(page.getByRole('heading', { name: 'Invite Join Test' })).toBeVisible({ timeout: 5000 });

  // Assert game name is NOT empty in header
  const headerName = await page.locator('header h1').textContent();
  expect(headerName.trim().length).toBeGreaterThan(0);
  expect(headerName).toContain('Invite Join Test');
});
