import { expect, test } from '@playwright/test';
import { openFresh, openScreen } from './helpers';

test('the Back button steps back through the screens, and Forward returns', async ({ page }) => {
  await openFresh(page);
  await openScreen(page, 'Stats');
  await expect(page.locator('.cb-page-title')).toHaveText('Stats');
  await openScreen(page, 'Settings');
  await expect(page.locator('.cb-page-title')).toHaveText('Settings');
  await page.goBack();
  await expect(page.locator('.cb-page-title')).toHaveText('Stats');
  await page.goBack();
  await expect(page.locator('.cb-board')).toBeVisible();
  await expect(page.locator('.cb-top-title')).toHaveText('Daily');
  await page.goForward();
  await expect(page.locator('.cb-page-title')).toHaveText('Stats');
});

test('Back from a screen opened over a shared link returns to that day', async ({ page }) => {
  await openFresh(page, undefined, '/?daily=2026-10-18');
  await expect(page.locator('.cb-band-wrap')).toContainText('Sunday 18 October');
  await openScreen(page, 'Fog');
  await expect(page.locator('.cb-top-title')).toHaveText('Fog');
  await page.goBack();
  await expect(page.locator('.cb-band-wrap')).toContainText('Sunday 18 October');
  await expect(page.locator('.cb-top-title')).toHaveText('Daily');
});

test('choosing the screen already open adds no history entry', async ({ page }) => {
  await openFresh(page);
  const before = await page.evaluate(() => history.length);
  await openScreen(page, 'Daily');
  await openScreen(page, 'Daily');
  expect(await page.evaluate(() => history.length)).toBe(before);
});

test('Stats, Settings and About have a back arrow, like Run and Learn', async ({ page }) => {
  await openFresh(page);
  for (const name of ['Stats', 'Settings', 'About']) {
    await openScreen(page, name);
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    // Settings draws small preview boards, so wait for the page to leave and match the play board only.
    await expect(page.locator('.cb-page-title')).toHaveCount(0);
    await expect(page.locator('.cb-play .cb-board')).toBeVisible();
    await expect(page.locator('.cb-top-title')).toHaveText('Daily');
  }
  // It goes back to where the player came from, here a Fog board.
  await openScreen(page, 'Fog');
  await expect(page.locator('.cb-top-title')).toHaveText('Fog');
  await page.getByRole('button', { name: 'Stats', exact: true }).first().click();
  await expect(page.locator('.cb-page-title')).toHaveText('Stats');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.cb-top-title')).toHaveText('Fog');
});
