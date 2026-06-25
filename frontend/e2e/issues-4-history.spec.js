import { test, expect } from '@playwright/test';

test('question edit history shows diff newest-first', async ({ page }) => {
  // Clean slate – backend e2e_test.db is wiped by webServer startup
  await page.goto('/');

  // Wait for GameList, create a game
  await expect(page.getByRole('heading', { name: '🤝 Connections' })).toBeVisible();
  const gameInput = page.getByPlaceholder('Campaign name…');
  await expect(gameInput).toBeVisible();
  await gameInput.fill('History Test Game');
  await page.getByRole('button', { name: 'Create' }).click();

  // Should be in game, default tab = Ask. Switch to Questions
  await page.getByRole('button', { name: /Questions/ }).click();

  // Add a question
  const qInput = page.getByPlaceholder('Add a question…');
  await expect(qInput).toBeVisible();
  await qInput.fill('Original question text');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  // Wait for question to appear
  const qText = page.getByText('Original question text');
  await expect(qText).toBeVisible();

  // Edit #1 – change text and tag
  await page.getByTitle('Edit').click();
  const editInput = page.getByPlaceholder('Edit question…');
  await expect(editInput).toBeVisible();
  await editInput.fill('First edit text');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('First edit text')).toBeVisible();

  // Change tag to 'warm'
  const tagBtn = page.getByLabel(/Change tag:/);
  await tagBtn.click();
  await page.getByRole('button', { name: /warm/ }).click();

  // Edit #2 – change text and tag again
  await page.getByTitle('Edit').click();
  const editInput2 = page.getByPlaceholder('Edit question…');
  await expect(editInput2).toBeVisible();
  await editInput2.fill('Second edit text');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Second edit text')).toBeVisible();

  // Change tag to 'tension'
  const tagBtn2 = page.getByLabel(/Change tag:/);
  await tagBtn2.click();
  await page.getByRole('button', { name: /tension/ }).click();

  // Open history modal
  const historyBtn = page.getByTitle('History');
  await expect(historyBtn).toBeVisible();
  await historyBtn.click();

  // Assert: "Current: [{tag}] {text}" header present
  await expect(page.getByText(/Current: \[tension\] Second edit text/)).toBeVisible();

  // Assert: entries shown newest-first, with old→new diff
  // History contains 4 entries: text edit, tag change, text edit, tag change
  const modal = page.getByRole('dialog', { name: 'Edit history' });
  await expect(modal).toBeVisible();

  // Get history list items text
  const historyItems = modal.locator('ul li');
  await expect(historyItems).toHaveCount(4);

  // Newest entry (index 0) is tag warm → tension
  // Entry 1 should be First edit → Second edit (text)
  const firstTextEntry = historyItems.nth(1);
  await expect(firstTextEntry).toContainText('First edit text');
  await expect(firstTextEntry).toContainText('Second edit text');
  // should show → arrow for diff
  await expect(firstTextEntry).toContainText('→');

  // Entry 3 should be Original → First edit (text)
  const secondTextEntry = historyItems.nth(3);
  await expect(secondTextEntry).toContainText('Original question text');
  await expect(secondTextEntry).toContainText('First edit text');

  // Ensure order is newest first – First→Second appears before Original→First
  const modalText = await modal.textContent();
  const idxFirstToSecond = modalText.indexOf('First edit text');
  const idxOriginal = modalText.indexOf('Original question text');
  expect(idxFirstToSecond).toBeLessThan(idxOriginal);

  await page.getByRole('button', { name: 'Close' }).click();
});
