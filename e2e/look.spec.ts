import { expect, test } from '@playwright/test';
import { localToday, nineByNine, openFresh, openScreen } from './helpers';

const SETTINGS = 'cellbound:v1:settings';

test('a new player starts in Prism, and Settings offers light, dark and auto but no look to pick', async ({ page }) => {
  await openFresh(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'prism');
  await openScreen(page, 'Settings');
  await expect(page.locator('.cb-form legend').first()).toHaveText('Light or dark');
  const night = page.getByRole('group', { name: 'Light or dark' });
  const names = await night.getByRole('radio').evaluateAll((els) => els.map((e) => (e.closest('label')?.textContent ?? '').trim()));
  expect(names).toEqual(['Auto', 'Light', 'Dark']);
  await expect(night.getByRole('radio', { name: 'Auto' })).toBeChecked();
  await expect(page.locator('input[name="theme"]')).toHaveCount(0);
});

test('Auto follows the device, Light and Dark override it, and the browser bar takes the ground', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openFresh(page);
  const html = page.locator('html');
  const bar = page.locator('meta[name="theme-color"]');
  await expect(html).toHaveAttribute('data-night', 'false');
  await expect(bar).toHaveAttribute('content', '#eceef3');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveAttribute('data-night', 'true');
  await expect(bar).toHaveAttribute('content', '#0a0c11');
  await openScreen(page, 'Settings');
  await page.getByRole('radio', { name: 'Light', exact: true }).check();
  await expect(html).toHaveAttribute('data-night', 'false');
  await expect(bar).toHaveAttribute('content', '#eceef3');
  await page.reload();
  await expect(html).toHaveAttribute('data-night', 'false');
  await expect(html).toHaveAttribute('data-theme', 'prism');
});

test('a player from before who never picked a look gets Prism', async ({ page }) => {
  // A saved game and no saved settings: these players were kept on Star atlas until it was removed.
  await openFresh(page, nineByNine());
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'prism');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'prism');
});

test('a saved look that was removed becomes Prism, and the other settings stay', async ({ page }) => {
  await openFresh(page);
  // Version 2 saves could name the last look to go; version 1 saves any of the earlier ones.
  const olds: [string, number][] = [['letters', 2], ['atlas', 1], ['paper', 1], ['washi', 1], ['swiss', 1]];
  for (const [theme, version] of olds) {
    await page.evaluate(
      (o) => localStorage.setItem(o.key, JSON.stringify({ state: { theme: o.theme, night: 'dark', hideTimer: true }, version: o.version })),
      { key: SETTINGS, theme, version },
    );
    await page.reload();
    await expect(page.locator('.cb-board')).toBeVisible();
    await expect(page.locator('html'), theme).toHaveAttribute('data-theme', 'prism');
    await expect(page.locator('html'), theme).toHaveAttribute('data-night', 'true');
    await expect(page.locator('.cb-timer'), theme).toHaveCount(0);
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), SETTINGS);
    expect(saved?.state?.theme, theme).toBe('prism');
    expect(saved?.version, theme).toBe(3);
  }
});

test('the app opens on today\'s 9x9 Daily, even over a 6x6 begun for today before every Daily was a 9x9', async ({ page }) => {
  // From 24 October 2026 every Daily is a 9x9. A device that still ran the older app that morning
  // may hold a 6x6 under today's save key and puzzle id; that board is not today's Daily any more.
  const today = localToday();
  const solution = [2, 5, 4, 1, 6, 3, 6, 3, 1, 4, 2, 5, 1, 6, 3, 5, 4, 2, 4, 2, 5, 3, 1, 6, 5, 4, 2, 6, 3, 1, 3, 1, 6, 2, 5, 4];
  const givens = solution.map((d, i) => ([5, 8, 13, 17, 22, 24, 33].includes(i) ? d : 0));
  const key = `daily:${today}`;
  const game = {
    key,
    mode: 'daily',
    puzzle: { id: `daily-${today}`, seed: key, size: 6, boxW: 3, boxH: 2, givens, solution, clues: [{ kind: 'kropki', a: 34, b: 35, color: 'white' }], difficulty: 2, score: 0, name: 'Lyra' },
    values: solution.map((d, i) => (i === 0 ? d : 0)),
    notes: new Array(36).fill(0),
    selected: null,
    notesMode: false,
    undo: [],
    redo: [],
    mistakes: 0,
    hintsUsed: 0,
    elapsedMs: 42000,
    status: 'playing',
    doneBoxes: [],
    hinted: new Array(36).fill(false),
  };
  await openFresh(page, { state: { games: { [key]: game }, touched: { [key]: 1 }, lastKey: { daily: key } }, version: 1 });
  await expect(page.locator('.cb-top-title')).toHaveText('Daily');
  await expect(page.locator('.cb-board[data-size="9"]')).toBeVisible();
  await expect(page.locator('.cb-cell')).toHaveCount(81);
  await expect(page.locator('.cb-key')).toHaveCount(9);
  // It stays today's 9x9 after a reload.
  await page.reload();
  await expect(page.locator('.cb-board[data-size="9"]')).toBeVisible();
});
